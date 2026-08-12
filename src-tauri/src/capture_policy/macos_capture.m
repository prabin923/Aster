#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>

typedef struct {
  int status; // 1 = pass, 0 = fail, -1 = not applicable
  int overlay_detected;
  int native_window_detected;
  int stream_started;
  int frame_received;
  int marker_detected;
  char *message;
} AsterSckDiagnostic;

static AsterSckDiagnostic make_result(
    int status,
    int overlay_detected,
    int native_window_detected,
    int stream_started,
    int frame_received,
    int marker_detected,
    NSString *message
) {
  AsterSckDiagnostic result;
  result.status = status;
  result.overlay_detected = overlay_detected;
  result.native_window_detected = native_window_detected;
  result.stream_started = stream_started;
  result.frame_received = frame_received;
  result.marker_detected = marker_detected;
  result.message = strdup(message.UTF8String ?: "Unknown ScreenCaptureKit result.");
  return result;
}

void aster_sck_free_message(char *message) {
  if (message != NULL) {
    free(message);
  }
}

int aster_sck_is_available(void) {
  if (@available(macOS 12.3, *)) {
    return 1;
  }
  return 0;
}

@interface AsterFrameInspector : NSObject <SCStreamOutput>
@property(nonatomic) dispatch_semaphore_t frame_semaphore;
@property(nonatomic) BOOL frame_received;
@property(nonatomic) BOOL marker_detected;
@end

@implementation AsterFrameInspector

- (instancetype)init {
  self = [super init];
  if (self) {
    _frame_semaphore = dispatch_semaphore_create(0);
    _frame_received = NO;
    _marker_detected = NO;
  }
  return self;
}

- (void)stream:(SCStream *)stream
didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer
         ofType:(SCStreamOutputType)type {
  if (type != SCStreamOutputTypeScreen || !CMSampleBufferIsValid(sampleBuffer)) {
    return;
  }
  CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
  if (imageBuffer == NULL) {
    return;
  }
  CVPixelBufferRef pixelBuffer = (CVPixelBufferRef)imageBuffer;
  if (CVPixelBufferGetPixelFormatType(pixelBuffer) != kCVPixelFormatType_32BGRA) {
    return;
  }
  CVPixelBufferLockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
  uint8_t *pixels = (uint8_t *)CVPixelBufferGetBaseAddress(pixelBuffer);
  const size_t width = CVPixelBufferGetWidth(pixelBuffer);
  const size_t height = CVPixelBufferGetHeight(pixelBuffer);
  const size_t bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer);
  size_t magentaPixels = 0;
  // The Rust command temporarily adds a 48px #ff00ff marker to Aster's own
  // overlay. Seeing a contiguous amount of this marker in the app-owned
  // capture means the exclusion filter did not take effect.
  for (size_t y = 0; y < height; y += 2) {
    uint8_t *row = pixels + y * bytesPerRow;
    for (size_t x = 0; x < width; x += 2) {
      uint8_t *pixel = row + x * 4;
      const uint8_t blue = pixel[0];
      const uint8_t green = pixel[1];
      const uint8_t red = pixel[2];
      if (red > 235 && green < 25 && blue > 235) {
        magentaPixels += 1;
      }
    }
  }
  CVPixelBufferUnlockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
  self.marker_detected = magentaPixels >= 20;
  self.frame_received = YES;
  dispatch_semaphore_signal(self.frame_semaphore);
}
@end

static AsterSckDiagnostic run_test(NSWindow *overlayWindow) {
  if (overlayWindow == nil) {
    return make_result(0, 0, 0, 0, 0, 0, @"The native Aster overlay window is unavailable.");
  }

  __block NSInteger overlayWindowNumber = 0;
  __block CGDirectDisplayID displayID = 0;
  void (^readWindow)(void) = ^{
    overlayWindowNumber = overlayWindow.windowNumber;
    NSNumber *screenNumber = overlayWindow.screen.deviceDescription[@"NSScreenNumber"];
    displayID = screenNumber.unsignedIntValue;
  };
  if (NSThread.isMainThread) {
    readWindow();
  } else {
    dispatch_sync(dispatch_get_main_queue(), readWindow);
  }
  if (overlayWindowNumber <= 0 || displayID == 0) {
    return make_result(0, 0, 0, 0, 0, 0, @"Aster's native overlay has no usable macOS window or display identity.");
  }

  dispatch_semaphore_t contentSemaphore = dispatch_semaphore_create(0);
  __block SCShareableContent *shareableContent = nil;
  __block NSError *contentError = nil;
  [SCShareableContent getShareableContentExcludingDesktopWindows:NO
                                           onScreenWindowsOnly:YES
                                             completionHandler:^(SCShareableContent *content, NSError *error) {
    shareableContent = content;
    contentError = error;
    dispatch_semaphore_signal(contentSemaphore);
  }];
  if (dispatch_semaphore_wait(contentSemaphore, dispatch_time(DISPATCH_TIME_NOW, 8 * NSEC_PER_SEC)) != 0) {
    return make_result(-1, 0, 1, 0, 0, 0, @"Timed out waiting for ScreenCaptureKit shareable content. Grant Screen Recording permission and retry.");
  }
  if (contentError != nil || shareableContent == nil) {
    NSString *message = contentError.localizedDescription ?: @"ScreenCaptureKit shareable content is unavailable.";
    return make_result(-1, 0, 1, 0, 0, 0, message);
  }

  SCWindow *overlaySCWindow = nil;
  for (SCWindow *candidate in shareableContent.windows) {
    if (candidate.windowID == overlayWindowNumber) {
      overlaySCWindow = candidate;
      break;
    }
  }
  if (overlaySCWindow == nil) {
    return make_result(-1, 0, 1, 0, 0, 0, @"ScreenCaptureKit could not discover the Aster overlay window. Keep it visible and grant Screen Recording permission before retrying.");
  }

  SCDisplay *targetDisplay = nil;
  for (SCDisplay *candidate in shareableContent.displays) {
    if (candidate.displayID == displayID) {
      targetDisplay = candidate;
      break;
    }
  }
  if (targetDisplay == nil) {
    return make_result(-1, 1, 1, 0, 0, 0, @"ScreenCaptureKit could not find the display that contains Aster's overlay.");
  }

  SCContentFilter *filter = [[SCContentFilter alloc] initWithDisplay:targetDisplay excludingWindows:@[ overlaySCWindow ]];
  SCStreamConfiguration *configuration = [SCStreamConfiguration new];
  configuration.width = CGDisplayPixelsWide(displayID);
  configuration.height = CGDisplayPixelsHigh(displayID);
  configuration.pixelFormat = kCVPixelFormatType_32BGRA;
  configuration.queueDepth = 1;
  configuration.showsCursor = NO;
  configuration.minimumFrameInterval = CMTimeMake(1, 30);

  AsterFrameInspector *inspector = [AsterFrameInspector new];
  SCStream *stream = [[SCStream alloc] initWithFilter:filter configuration:configuration delegate:nil];
  NSError *outputError = nil;
  dispatch_queue_t sampleQueue = dispatch_queue_create("com.aster.capture-policy.frame-test", DISPATCH_QUEUE_SERIAL);
  if (![stream addStreamOutput:inspector type:SCStreamOutputTypeScreen sampleHandlerQueue:sampleQueue error:&outputError]) {
    NSString *message = outputError.localizedDescription ?: @"ScreenCaptureKit could not attach the app-owned stream output.";
    return make_result(0, 1, 1, 0, 0, 0, message);
  }

  dispatch_semaphore_t startSemaphore = dispatch_semaphore_create(0);
  __block NSError *startError = nil;
  [stream startCaptureWithCompletionHandler:^(NSError *error) {
    startError = error;
    dispatch_semaphore_signal(startSemaphore);
  }];
  if (dispatch_semaphore_wait(startSemaphore, dispatch_time(DISPATCH_TIME_NOW, 8 * NSEC_PER_SEC)) != 0 || startError != nil) {
    NSString *message = startError.localizedDescription ?: @"Timed out starting Aster's ScreenCaptureKit stream.";
    return make_result(-1, 1, 1, 0, 0, 0, message);
  }

  const long frameWait = dispatch_semaphore_wait(inspector.frame_semaphore, dispatch_time(DISPATCH_TIME_NOW, 8 * NSEC_PER_SEC));
  [stream stopCaptureWithCompletionHandler:^(__unused NSError *error) {}];
  if (frameWait != 0 || !inspector.frame_received) {
    return make_result(-1, 1, 1, 1, 0, 0, @"Aster's ScreenCaptureKit stream started but did not deliver a frame. Check Screen Recording permission and retry.");
  }
  if (inspector.marker_detected) {
    return make_result(0, 1, 1, 1, 1, 1, @"The app-owned ScreenCaptureKit frame contained Aster's test marker; exclusion was not verified.");
  }
  return make_result(1, 1, 1, 1, 1, 0, @"Aster's own ScreenCaptureKit stream received a frame without the temporary overlay marker. This verification applies only to streams created by Aster.");
}

AsterSckDiagnostic aster_sck_run_overlay_exclusion_test(void *ns_window) {
  @autoreleasepool {
    if (!aster_sck_is_available()) {
      return make_result(-1, 0, 0, 0, 0, 0, @"ScreenCaptureKit requires macOS 12.3 or later.");
    }
    return run_test((__bridge NSWindow *)ns_window);
  }
}

void aster_set_ns_window_sharing_none(void *ns_window) {
  if (ns_window == NULL) return;
  @autoreleasepool {
    NSWindow *window = (__bridge NSWindow *)ns_window;
    void (^setSharing)(void) = ^{
      [window setSharingType:NSWindowSharingNone];
    };
    if (NSThread.isMainThread) {
      setSharing();
    } else {
      dispatch_sync(dispatch_get_main_queue(), setSharing);
    }
  }
}

void aster_set_ns_window_sharing_type(void *ns_window, int sharing_type) {
  if (ns_window == NULL) return;
  @autoreleasepool {
    NSWindow *window = (__bridge NSWindow *)ns_window;
    void (^setSharing)(void) = ^{
      [window setSharingType:(NSWindowSharingType)sharing_type];
    };
    if (NSThread.isMainThread) {
      setSharing();
    } else {
      dispatch_sync(dispatch_get_main_queue(), setSharing);
    }
  }
}

int aster_get_ns_window_sharing_type(void *ns_window) {
  if (ns_window == NULL) return -1;
  __block NSWindowSharingType type = NSWindowSharingReadOnly;
  @autoreleasepool {
    NSWindow *window = (__bridge NSWindow *)ns_window;
    void (^getSharing)(void) = ^{
      type = [window sharingType];
    };
    if (NSThread.isMainThread) {
      getSharing();
    } else {
      dispatch_sync(dispatch_get_main_queue(), getSharing);
    }
  }
  return (int)type;
}

void aster_setup_macos_window_behavior(void *ns_window) {
  if (ns_window == NULL) return;
  @autoreleasepool {
    NSWindow *window = (__bridge NSWindow *)ns_window;
    void (^block)(void) = ^{
      [window setOpaque:NO];
      [window setBackgroundColor:[NSColor clearColor]];
      [window setLevel:NSStatusWindowLevel];
      NSWindowCollectionBehavior behavior = window.collectionBehavior;
      behavior |= (NSWindowCollectionBehaviorCanJoinAllSpaces |
                   NSWindowCollectionBehaviorStationary |
                   NSWindowCollectionBehaviorFullScreenAuxiliary |
                   NSWindowCollectionBehaviorIgnoresCycle);
      [window setCollectionBehavior:behavior];
      [window orderFrontRegardless];
    };
    if (NSThread.isMainThread) {
      block();
    } else {
      dispatch_sync(dispatch_get_main_queue(), block);
    }
  }
}

typedef struct {
  double x;
  double y;
} AsterPoint;

static __unsafe_unretained NSWindow *aster_cursor_follow_window = nil;
static id aster_global_cursor_monitor = nil;
static id aster_local_cursor_monitor = nil;
static id aster_workspace_activation_observer = nil;
static NSTimer *aster_follow_timer = nil;
static __weak NSScreen *aster_last_cursor_screen = nil;
static __weak NSScreen *aster_last_active_window_screen = nil;

AsterPoint aster_get_global_cursor_position(void) {
  AsterPoint result = {0.0, 0.0};
  CGEventRef event = CGEventCreate(NULL);
  if (event != NULL) {
    CGPoint point = CGEventGetLocation(event);
    result.x = (double)point.x;
    result.y = (double)point.y;
    CFRelease(event);
  }
  return result;
}

static NSScreen *aster_screen_containing_point(NSPoint point) {
  NSArray<NSScreen *> *screens = [NSScreen screens];
  for (NSScreen *screen in screens) {
    if (NSPointInRect(point, screen.frame)) return screen;
  }
  return nil;
}

static NSScreen *aster_screen_for_cursor(void) {
  return aster_screen_containing_point([NSEvent mouseLocation]);
}

// Finds only the front application's foremost normal-window bounds. It does
// not request Accessibility access and never reads a title, pixel, or other
// window content. The PID/layer/rectangle are used in memory solely to choose
// the display where the native overlay should appear.
static NSScreen *aster_screen_for_frontmost_application_window(void) {
  NSRunningApplication *frontmost = [NSWorkspace sharedWorkspace].frontmostApplication;
  if (frontmost == nil || frontmost.processIdentifier == [NSProcessInfo processInfo].processIdentifier) {
    return nil;
  }

  CFArrayRef copiedInfo = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
      kCGNullWindowID);
  if (copiedInfo == NULL) return nil;

  NSArray<NSDictionary *> *windows = CFBridgingRelease(copiedInfo);
  const pid_t targetPID = frontmost.processIdentifier;
  for (NSDictionary *info in windows) {
    NSNumber *ownerPID = [info objectForKey:(__bridge NSString *)kCGWindowOwnerPID];
    NSNumber *layer = [info objectForKey:(__bridge NSString *)kCGWindowLayer];
    NSNumber *onScreen = [info objectForKey:(__bridge NSString *)kCGWindowIsOnscreen];
    NSNumber *alpha = [info objectForKey:(__bridge NSString *)kCGWindowAlpha];
    if (ownerPID == nil || ownerPID.intValue != targetPID || layer.integerValue != 0 ||
        (onScreen != nil && !onScreen.boolValue) || (alpha != nil && alpha.doubleValue <= 0.01)) {
      continue;
    }

    NSDictionary *boundsDictionary = [info objectForKey:(__bridge NSString *)kCGWindowBounds];
    CGRect bounds = CGRectZero;
    if (boundsDictionary == nil || !CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)boundsDictionary, &bounds) ||
        bounds.size.width < 32.0 || bounds.size.height < 32.0) {
      continue;
    }

    // Quartz window geometry has its origin at the top of the primary display;
    // AppKit screen geometry is bottom-origin. Convert the center point before
    // resolving its NSScreen.
    NSScreen *mainScreen = [NSScreen mainScreen];
    if (mainScreen == nil) return nil;
    NSPoint center = NSMakePoint(CGRectGetMidX(bounds), NSMaxY(mainScreen.frame) - CGRectGetMidY(bounds));
    NSScreen *screen = aster_screen_containing_point(center);
    if (screen != nil) return screen;
  }
  return nil;
}

static BOOL aster_screens_match(NSScreen *first, NSScreen *second) {
  return first == second || (first != nil && [first isEqual:second]);
}

static int aster_move_follow_window_to_screen(NSWindow *window, NSScreen *targetScreen) {
  if (window == nil || targetScreen == nil) return 0;
  if (window.level != NSStatusWindowLevel) [window setLevel:NSStatusWindowLevel];

  NSScreen *currentScreen = window.screen;
  if (currentScreen == nil) currentScreen = [NSScreen mainScreen];

  if (![currentScreen isEqual:targetScreen]) {
    NSRect currentVisible = currentScreen.visibleFrame;
    NSRect windowFrame = window.frame;
    double spanX = currentVisible.size.width - windowFrame.size.width;
    double spanY = currentVisible.size.height - windowFrame.size.height;
    double relX = (spanX > 1.0) ? (windowFrame.origin.x - currentVisible.origin.x) / spanX : 0.0;
    double relY = (spanY > 1.0) ? (windowFrame.origin.y - currentVisible.origin.y) / spanY : 0.0;
    relX = fmax(0.0, fmin(1.0, relX));
    relY = fmax(0.0, fmin(1.0, relY));

    NSRect targetVisible = targetScreen.visibleFrame;
    double targetSpanX = fmax(0.0, targetVisible.size.width - windowFrame.size.width);
    double targetSpanY = fmax(0.0, targetVisible.size.height - windowFrame.size.height);
    [window setFrameOrigin:NSMakePoint(targetVisible.origin.x + relX * targetSpanX,
                                        targetVisible.origin.y + relY * targetSpanY)];
  }

  [window orderFrontRegardless];
  return 1;
}

static int aster_follow_cursor_display(void) {
  NSScreen *cursorScreen = aster_screen_for_cursor() ?: [NSScreen mainScreen];
  if (cursorScreen == nil) return 0;
  aster_last_cursor_screen = cursorScreen;
  return aster_move_follow_window_to_screen(aster_cursor_follow_window, cursorScreen);
}

static int aster_follow_active_window_display(void) {
  NSScreen *activeWindowScreen = aster_screen_for_frontmost_application_window();
  if (activeWindowScreen == nil) return aster_follow_cursor_display();
  aster_last_active_window_screen = activeWindowScreen;
  return aster_move_follow_window_to_screen(aster_cursor_follow_window, activeWindowScreen);
}

static void aster_poll_follow_context(void) {
  // Polling is intentionally stateful: a cursor move to another display stays
  // there, rather than being immediately overridden by the older active window
  // on the first display. A changed active-window display (including a
  // keyboard-only switch inside one app) takes over only when it actually
  // changes.
  NSScreen *cursorScreen = aster_screen_for_cursor();
  BOOL cursorChanged = cursorScreen != nil && !aster_screens_match(cursorScreen, aster_last_cursor_screen);
  if (cursorChanged) aster_last_cursor_screen = cursorScreen;

  NSScreen *activeWindowScreen = aster_screen_for_frontmost_application_window();
  BOOL activeWindowChanged = activeWindowScreen != nil &&
      !aster_screens_match(activeWindowScreen, aster_last_active_window_screen);
  if (activeWindowChanged) aster_last_active_window_screen = activeWindowScreen;

  if (activeWindowChanged) {
    aster_move_follow_window_to_screen(aster_cursor_follow_window, activeWindowScreen);
  } else if (cursorChanged) {
    aster_move_follow_window_to_screen(aster_cursor_follow_window, cursorScreen);
  }
}

void aster_start_cursor_following(void *ns_window) {
  if (ns_window == NULL) return;
  void (^block)(void) = ^{
    aster_cursor_follow_window = (__bridge NSWindow *)ns_window;
    const NSEventMask mask = NSEventMaskMouseMoved | NSEventMaskLeftMouseDragged | NSEventMaskRightMouseDragged;
    if (aster_global_cursor_monitor == nil) {
      aster_global_cursor_monitor = [NSEvent addGlobalMonitorForEventsMatchingMask:mask handler:^(__unused NSEvent *event) {
        dispatch_async(dispatch_get_main_queue(), ^{ aster_follow_cursor_display(); });
      }];
    }
    if (aster_local_cursor_monitor == nil) {
      aster_local_cursor_monitor = [NSEvent addLocalMonitorForEventsMatchingMask:mask handler:^(NSEvent *event) {
        aster_follow_cursor_display();
        return event;
      }];
    }
    if (aster_workspace_activation_observer == nil) {
      aster_workspace_activation_observer = [[[NSWorkspace sharedWorkspace] notificationCenter]
          addObserverForName:NSWorkspaceDidActivateApplicationNotification
                      object:nil
                       queue:[NSOperationQueue mainQueue]
                  usingBlock:^(__unused NSNotification *notification) {
                    aster_follow_active_window_display();
                  }];
    }
    // This catches keyboard-only window switches within the same application,
    // which do not emit an application-activation notification or mouse event.
    if (aster_follow_timer == nil) {
      aster_follow_timer = [NSTimer timerWithTimeInterval:0.12
                                                    repeats:YES
                                                      block:^(__unused NSTimer *timer) {
                                                        aster_poll_follow_context();
                                                      }];
      [[NSRunLoop mainRunLoop] addTimer:aster_follow_timer forMode:NSRunLoopCommonModes];
    }
    aster_last_cursor_screen = aster_screen_for_cursor();
    aster_last_active_window_screen = aster_screen_for_frontmost_application_window();
    aster_follow_active_window_display();
  };
  if (NSThread.isMainThread) block();
  else dispatch_async(dispatch_get_main_queue(), block);
}

#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

typedef struct {
  int available;
  int is_assistant_window;
  uint32_t process_id;
  int has_bounds;
  double x;
  double y;
  double width;
  double height;
  char *application_name;
  char *bundle_id;
  char *window_title;
  char *display_id;
  char *reason;
} AsterActiveWindowResult;

static char *aster_copy_string(NSString *value) {
  return strdup((value ?: @"").UTF8String ?: "");
}

static AsterActiveWindowResult aster_active_window_result(
    int available,
    int is_assistant_window,
    pid_t process_id,
    int has_bounds,
    CGRect bounds,
    NSString *application_name,
    NSString *bundle_id,
    NSString *window_title,
    NSString *display_id,
    NSString *reason
) {
  return (AsterActiveWindowResult){
    .available = available,
    .is_assistant_window = is_assistant_window,
    .process_id = (uint32_t)MAX(process_id, 0),
    .has_bounds = has_bounds,
    .x = bounds.origin.x,
    .y = bounds.origin.y,
    .width = bounds.size.width,
    .height = bounds.size.height,
    .application_name = aster_copy_string(application_name),
    .bundle_id = aster_copy_string(bundle_id),
    .window_title = aster_copy_string(window_title),
    .display_id = aster_copy_string(display_id),
    .reason = aster_copy_string(reason),
  };
}

void aster_active_window_free_result(AsterActiveWindowResult result) {
  free(result.application_name);
  free(result.bundle_id);
  free(result.window_title);
  free(result.display_id);
  free(result.reason);
}

static NSString *aster_ax_string(AXUIElementRef element, CFStringRef attribute) {
  CFTypeRef value = NULL;
  if (AXUIElementCopyAttributeValue(element, attribute, &value) != kAXErrorSuccess || value == NULL) {
    return @"";
  }
  NSString *result = @"";
  if (CFGetTypeID(value) == CFStringGetTypeID()) {
    result = [(__bridge NSString *)value copy];
  }
  CFRelease(value);
  return result;
}

static BOOL aster_ax_bounds(AXUIElementRef element, CGRect *bounds) {
  CFTypeRef positionValue = NULL;
  CFTypeRef sizeValue = NULL;
  BOOL success = NO;
  if (AXUIElementCopyAttributeValue(element, kAXPositionAttribute, &positionValue) == kAXErrorSuccess &&
      AXUIElementCopyAttributeValue(element, kAXSizeAttribute, &sizeValue) == kAXErrorSuccess &&
      positionValue != NULL && sizeValue != NULL &&
      CFGetTypeID(positionValue) == AXValueGetTypeID() && CFGetTypeID(sizeValue) == AXValueGetTypeID()) {
    CGPoint position = CGPointZero;
    CGSize size = CGSizeZero;
    success = AXValueGetValue((AXValueRef)positionValue, kAXValueCGPointType, &position) &&
        AXValueGetValue((AXValueRef)sizeValue, kAXValueCGSizeType, &size) && size.width >= 0.0 && size.height >= 0.0;
    if (success) *bounds = CGRectMake(position.x, position.y, size.width, size.height);
  }
  if (positionValue != NULL) CFRelease(positionValue);
  if (sizeValue != NULL) CFRelease(sizeValue);
  return success;
}

static NSString *aster_display_id_for_bounds(CGRect bounds) {
  CGDirectDisplayID display = 0;
  uint32_t count = 0;
  CGPoint center = CGPointMake(CGRectGetMidX(bounds), CGRectGetMidY(bounds));
  if (CGGetDisplaysWithPoint(center, 1, &display, &count) == kCGErrorSuccess && count > 0) {
    return [NSString stringWithFormat:@"display:%u", display];
  }
  return @"";
}

// NSWorkspace's `frontmostApplication` can remain Aster while this floating
// status-level window is visible above another app. With Accessibility
// permission, the system-wide focused-application attribute is the actual
// keyboard-working application and is therefore the correct context signal.
static NSRunningApplication *aster_focused_running_application(BOOL *accessibilityTrusted) {
  const BOOL trusted = AXIsProcessTrusted();
  if (accessibilityTrusted != NULL) *accessibilityTrusted = trusted;
  if (!trusted) {
    return [NSWorkspace sharedWorkspace].frontmostApplication;
  }

  AXUIElementRef systemWide = AXUIElementCreateSystemWide();
  CFTypeRef focusedApplicationValue = NULL;
  pid_t focusedPID = 0;
  if (AXUIElementCopyAttributeValue(systemWide, kAXFocusedApplicationAttribute, &focusedApplicationValue) == kAXErrorSuccess &&
      focusedApplicationValue != NULL && CFGetTypeID(focusedApplicationValue) == AXUIElementGetTypeID()) {
    // AXUIElementGetPid is the documented way to get the focused app's PID.
    // Reading an `AXPID` attribute is not reliable across macOS releases.
    AXUIElementGetPid((AXUIElementRef)focusedApplicationValue, &focusedPID);
  }
  if (focusedApplicationValue != NULL) CFRelease(focusedApplicationValue);
  CFRelease(systemWide);

  NSRunningApplication *focusedApplication = focusedPID > 0
      ? [NSRunningApplication runningApplicationWithProcessIdentifier:focusedPID]
      : nil;
  if (focusedApplication != nil) {
    return focusedApplication;
  }
  return [NSWorkspace sharedWorkspace].frontmostApplication;
}

static AsterActiveWindowResult aster_read_active_window(void) {
  BOOL accessibilityTrusted = NO;
  NSRunningApplication *focusedApplication = aster_focused_running_application(&accessibilityTrusted);
  if (focusedApplication == nil) {
    return aster_active_window_result(NO, NO, 0, NO, CGRectZero, @"", @"", @"", @"", @"macOS did not report a focused application.");
  }

  const pid_t processID = focusedApplication.processIdentifier;
  NSString *applicationName = focusedApplication.localizedName ?: @"Application";
  NSString *bundleID = focusedApplication.bundleIdentifier ?: [NSString stringWithFormat:@"macos:pid:%d", processID];
  if (processID == [NSProcessInfo processInfo].processIdentifier) {
    return aster_active_window_result(YES, YES, processID, NO, CGRectZero, applicationName, bundleID, @"", @"", @"");
  }

  // We deliberately do not prompt or modify Accessibility settings. Without
  // permission, only AppKit's best-effort app metadata is available; focused
  // title/bounds/display details remain unavailable.
  if (!accessibilityTrusted) {
    return aster_active_window_result(NO, NO, processID, NO, CGRectZero, applicationName, bundleID, @"", @"", @"accessibility_permission_required");
  }

  AXUIElementRef application = AXUIElementCreateApplication(processID);
  CFTypeRef focusedValue = NULL;
  AXError error = AXUIElementCopyAttributeValue(application, kAXFocusedWindowAttribute, &focusedValue);
  if (error != kAXErrorSuccess || focusedValue == NULL || CFGetTypeID(focusedValue) != AXUIElementGetTypeID()) {
    if (focusedValue != NULL) CFRelease(focusedValue);
    CFRelease(application);
    return aster_active_window_result(NO, NO, processID, NO, CGRectZero, applicationName, bundleID, @"", @"", @"focused_window_unavailable");
  }

  AXUIElementRef focusedWindow = (AXUIElementRef)focusedValue;
  NSString *windowTitle = aster_ax_string(focusedWindow, kAXTitleAttribute);
  CGRect bounds = CGRectZero;
  BOOL hasBounds = aster_ax_bounds(focusedWindow, &bounds);
  NSString *displayID = hasBounds ? aster_display_id_for_bounds(bounds) : @"";
  CFRelease(focusedValue);
  CFRelease(application);
  return aster_active_window_result(YES, NO, processID, hasBounds, bounds, applicationName, bundleID, windowTitle, displayID, @"");
}

AsterActiveWindowResult aster_get_active_window(void) {
  __block AsterActiveWindowResult result;
  void (^read)(void) = ^{
    @autoreleasepool { result = aster_read_active_window(); }
  };
  if (NSThread.isMainThread) read();
  else dispatch_sync(dispatch_get_main_queue(), read);
  return result;
}

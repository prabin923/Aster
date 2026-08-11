#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>
#import <Speech/Speech.h>

typedef void (*AsterSpeechEventCallback)(int kind, const char *text);

// 1 = partial transcript, 2 = final transcript, 3 = error, 4 = status.
static AsterSpeechEventCallback aster_speech_callback = NULL;
static AVAudioEngine *aster_audio_engine = nil;
static SFSpeechRecognizer *aster_recognizer = nil;
static SFSpeechAudioBufferRecognitionRequest *aster_request = nil;
static SFSpeechRecognitionTask *aster_task = nil;
static BOOL aster_active = NO;

static void aster_emit(int kind, NSString *message) {
  if (aster_speech_callback == NULL) {
    return;
  }
  const char *text = message.UTF8String ?: "";
  aster_speech_callback(kind, text);
}

static void aster_stop_on_main(void) {
  aster_active = NO;
  if (aster_audio_engine != nil) {
    AVAudioInputNode *input = aster_audio_engine.inputNode;
    [input removeTapOnBus:0];
    [aster_audio_engine stop];
  }
  [aster_request endAudio];
  [aster_task cancel];
  aster_task = nil;
  aster_request = nil;
  aster_audio_engine = nil;
  aster_recognizer = nil;
}

static void aster_start_recognition_request(void) {
  if (!aster_active || aster_recognizer == nil) {
    return;
  }
  [aster_task cancel];
  aster_task = nil;
  aster_request = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
  aster_request.shouldReportPartialResults = YES;

  __weak SFSpeechAudioBufferRecognitionRequest *request = aster_request;
  aster_task = [aster_recognizer recognitionTaskWithRequest:aster_request
                                               resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
    if (result != nil) {
      NSString *transcript = result.bestTranscription.formattedString ?: @"";
      if (transcript.length > 0) {
        aster_emit(result.isFinal ? 2 : 1, transcript);
      }
      if (result.isFinal && aster_active) {
        dispatch_async(dispatch_get_main_queue(), ^{
          if (aster_active && request == aster_request) {
            aster_start_recognition_request();
          }
        });
      }
      return;
    }
    if (error != nil && aster_active) {
      NSString *message = [NSString stringWithFormat:@"Native speech recognition failed: %@", error.localizedDescription ?: @"Unknown error."];
      aster_emit(3, message);
    }
  }];
}

static void aster_begin_audio_engine(void) {
  if (!aster_active) {
    return;
  }
  aster_recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale currentLocale]];
  if (aster_recognizer == nil || !aster_recognizer.isAvailable) {
    aster_emit(3, @"Native speech recognition is unavailable. Check your network connection and macOS Speech Recognition settings.");
    aster_stop_on_main();
    return;
  }

  aster_audio_engine = [[AVAudioEngine alloc] init];
  AVAudioInputNode *input = aster_audio_engine.inputNode;
  AVAudioFormat *format = [input outputFormatForBus:0];
  if (format == nil || format.sampleRate == 0) {
    aster_emit(3, @"No microphone input is available. Connect a microphone and try again.");
    aster_stop_on_main();
    return;
  }

  [input installTapOnBus:0
              bufferSize:1024
                  format:format
                   block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
    (void)when;
    if (aster_active && aster_request != nil) {
      [aster_request appendAudioPCMBuffer:buffer];
    }
  }];
  [aster_audio_engine prepare];
  NSError *error = nil;
  if (![aster_audio_engine startAndReturnError:&error]) {
    NSString *message = [NSString stringWithFormat:@"Could not start the microphone: %@", error.localizedDescription ?: @"Unknown error."];
    aster_emit(3, message);
    aster_stop_on_main();
    return;
  }
  aster_start_recognition_request();
  aster_emit(4, @"Native macOS speech recognition is listening. Audio is processed in memory and is not stored.");
}

static void aster_request_speech_permission(void) {
  SFSpeechRecognizerAuthorizationStatus status = [SFSpeechRecognizer authorizationStatus];
  if (status == SFSpeechRecognizerAuthorizationStatusAuthorized) {
    aster_begin_audio_engine();
    return;
  }
  if (status == SFSpeechRecognizerAuthorizationStatusDenied) {
    aster_emit(3, @"Speech Recognition permission was denied. Enable Aster in System Settings > Privacy & Security > Speech Recognition.");
    aster_stop_on_main();
    return;
  }
  if (status == SFSpeechRecognizerAuthorizationStatusRestricted) {
    aster_emit(3, @"Speech Recognition is restricted by this Mac's policy.");
    aster_stop_on_main();
    return;
  }
  [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus authorizationStatus) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (!aster_active) {
        return;
      }
      if (authorizationStatus == SFSpeechRecognizerAuthorizationStatusAuthorized) {
        aster_begin_audio_engine();
      } else if (authorizationStatus == SFSpeechRecognizerAuthorizationStatusDenied) {
        aster_emit(3, @"Speech Recognition permission was denied. Enable Aster in System Settings > Privacy & Security > Speech Recognition.");
        aster_stop_on_main();
      } else {
        aster_emit(3, @"Speech Recognition is unavailable or restricted on this Mac.");
        aster_stop_on_main();
      }
    });
  }];
}

static void aster_begin_with_microphone_permission(void) {
  AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
  if (status == AVAuthorizationStatusAuthorized) {
    aster_request_speech_permission();
    return;
  }
  if (status == AVAuthorizationStatusDenied || status == AVAuthorizationStatusRestricted) {
    aster_emit(3, @"Microphone permission was denied. Enable Aster in System Settings > Privacy & Security > Microphone.");
    aster_stop_on_main();
    return;
  }
  [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (!aster_active) {
        return;
      }
      if (granted) {
        aster_request_speech_permission();
      } else {
        aster_emit(3, @"Microphone permission was denied. Enable Aster in System Settings > Privacy & Security > Microphone.");
        aster_stop_on_main();
      }
    });
  }];
}

int aster_native_speech_is_available(void) {
  if (@available(macOS 10.15, *)) {
    return 1;
  }
  return 0;
}

void aster_native_speech_set_callback(AsterSpeechEventCallback callback) {
  aster_speech_callback = callback;
}

int aster_native_speech_start(void) {
  if (!aster_native_speech_is_available()) {
    return 0;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    if (aster_active) {
      return;
    }
    aster_active = YES;
    aster_begin_with_microphone_permission();
  });
  return 1;
}

void aster_native_speech_stop(void) {
  dispatch_async(dispatch_get_main_queue(), ^{
    aster_stop_on_main();
  });
}

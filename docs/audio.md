# Audio and speech-to-text

`AudioManager` owns the microphone stream and has `start`, `stop`, `pause`, `resume`, and `getDevices` operations. It selects a named input or the system default, listens for device changes, and reports a disconnected microphone without crashing the overlay.

## Providers

- **MockSpeechProvider** is offline and displays an initial partial status. It is intended for development and test flows.
- **NativeSpeechProvider** uses macOS's documented `SFSpeechRecognizer` and `AVAudioEngine` APIs through the Tauri backend. It delivers partial and final transcript events without sending raw microphone data to the React renderer. macOS may use Apple speech-recognition services when on-device recognition is unavailable.
- **BrowserSpeechProvider** uses the Web Speech Recognition implementation exposed by the current WebView. It streams interim and final transcript events where available. Some desktop WebViews reject this service with `service-not-allowed`; Aster stops listening cleanly and directs macOS users to the native provider instead of pretending that recognition is active.

Native macOS speech requires macOS 10.15 or later and requests both **Microphone** and **Speech Recognition** permission the first time it is started. Browser recognition remains WebView-dependent. For consistent Windows/Linux transcription, add a documented native or cloud `SpeechProvider` implementation behind the same interface; do not put provider-specific logic in React.

## Privacy and permissions

Aster asks the OS/WebView for microphone permission only after **Start**. On macOS native speech, the app also asks for Speech Recognition permission with a purpose string in the app bundle. It keeps the live stream in memory, stops it on Stop, and does not persist raw audio. Partial/final transcript text enters the bounded context manager only for the active session.

Automatic answer mode is opt-in. It invokes the question detector only for likely questions; it never answers every sentence by default.

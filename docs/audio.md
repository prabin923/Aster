# Audio and speech-to-text

`AudioManager` owns the microphone stream and has `start`, `stop`, `pause`, `resume`, and `getDevices` operations. It selects a named input or the system default, listens for device changes, and reports a disconnected microphone without crashing the overlay.

## Providers

- **MockSpeechProvider** is offline and displays an initial partial status. It is intended for development and test flows.
- **BrowserSpeechProvider** uses the Web Speech Recognition implementation exposed by the current WebView. It streams interim and final transcript events and restarts after recoverable end events.

The browser adapter is the included real STT adapter, but support varies by operating system/WebView. For production-grade cross-platform transcription, add a native or cloud `SpeechProvider` implementation behind the same interface; do not put provider-specific logic in React.

## Privacy and permissions

Aster asks the OS/WebView for microphone permission only after **Start**. It keeps the live stream in memory, stops all tracks on Stop, and does not persist raw audio. Partial/final transcript text enters the bounded context manager only for the active session.

Automatic answer mode is opt-in. It invokes the question detector only for likely questions; it never answers every sentence by default.

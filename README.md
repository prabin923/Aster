# Aster

Aster is a native, privacy-first desktop assistant for notes, accessibility, and productive conversations. It is a Tauri 2 desktop application with a React/TypeScript overlay and a Rust native boundary for window control, credentials, and cloud-provider calls.

It is deliberately not a covert tool: Aster does not hide its process, bypass security controls, evade proctoring, or promise invisibility in screen sharing. **Screen-share behavior** is reported from the native layer, so the interface never claims exclusion when the OS has not verified it.

## What works in this MVP

- Frameless, draggable, resizable, always-on-top overlay with opacity, position, theme, collapse/minimize, configurable global shortcuts, a native one-click move-to-next-display action, and automatic multi-monitor following. On macOS, Aster follows the front app window's display (with cursor-display fallback), including keyboard-only app/window switches; it uses only window PID/layer/bounds in memory and never reads window content.
- Streaming chat with Markdown, code blocks, stop, regenerate, copy, clear, and optional in-memory conversation history.
- Mock AI that runs without a network connection, plus native OpenAI, Gemini, and Claude streaming adapters.
- API keys go directly from the one-time settings input to native Keychain/Credential Manager/Secret Service storage; they are never returned to the renderer or saved in settings JSON.
- Microphone selection, permission errors, pause/resume, device-change detection, Mock STT, native macOS Speech recognition, and a browser-speech adapter where the platform WebView exposes speech recognition.
- Explicit, on-demand screen capture with local Tesseract OCR. Screenshots and microphone audio are stopped and discarded after processing.
- Rolling, secret-redacted context with a bounded transcript buffer and question detection.

## Quick start

Prerequisites: Node.js 22+ and Rust 1.77+. On Linux, install the current Tauri WebKitGTK/system packages before building.

```bash
npm install
npm run dev
```

The default shortcut is `Cmd/Ctrl + Space`. macOS commonly reserves `Cmd + Space` for Spotlight; if it cannot register, set a different shortcut in Aster Settings, such as `CommandOrControl+Shift+Space`.

## Commands

```bash
npm run dev       # native desktop development app
npm run build     # TypeScript + Vite production frontend
npm run check     # TypeScript and Rust checks
npm test          # frontend unit tests
npm run package   # native installer/bundle for the current OS
```

On this macOS workspace, `npm run package` creates an unsigned `.app` and DMG when local packaging prerequisites are present. Windows and Linux installers must be produced on their target OS (or a properly configured CI runner), because Tauri packages native artifacts.

## Using a cloud provider

1. Open **Settings → AI**.
2. Choose OpenAI, Gemini, or Claude and select the model.
3. Paste the API key once and select **Store**.
4. Select **Save settings**.

Keys never belong in `.env`, source files, or `settings.json`. The default Gemini model is `gemini-3.6-flash`, replacing legacy Gemini 2.5 defaults that are no longer available to some new accounts. See [AI provider setup](docs/ai-providers.md).

## Privacy defaults

- Mock AI is the default and works offline.
- Screen context is off until explicitly enabled.
- Raw microphone audio and raw screenshots are not persisted.
- Conversation history, transcript retention, screen-derived text retention, and telemetry are off by default.
- Before any cloud request, Aster redacts obvious API keys, passwords, bearer tokens, and private-key blocks.

See [privacy](docs/privacy.md), [security](docs/security.md), [audio](docs/audio.md), and [screen context](docs/screen-context.md) for limitations and data flow.

## Project map

```text
src/                 React UI, local context, audio, screen/OCR and IPC client
src-tauri/src/       Rust commands, provider streaming, secure storage and window settings
docs/                architecture, privacy, providers, audio, screen, security, development
```

## Important limitations

- macOS 10.15+ has a native Speech framework provider. It requests Microphone and Speech Recognition permission at first use and may use Apple speech-recognition services when on-device recognition is unavailable. The browser-speech adapter still depends on `SpeechRecognition` availability in the embedded WebView; a `service-not-allowed` response means that adapter is unavailable and does not mean the microphone is still listening. Mock STT is always available. Windows and Linux still need a dedicated native or cloud STT adapter for consistent recognition.
- Screen OCR is local but Tesseract may obtain language assets on first use, depending on the runtime cache. The captured image itself is not uploaded by Aster.
- Windows 10 version 2004+ can use and verify `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` for Aster's top-level overlay. On macOS, Aster applies `NSWindowSharingNone` to its top-level native window. On macOS 12.3+, the optional **Capture Privacy Test** can verify a separate, Aster-owned ScreenCaptureKit stream created with the overlay excluded. Linux reports its detected session/desktop and remains unsupported unless a documented native implementation is added. None of these states mean universal recorder, monitoring, or proctoring invisibility.
- This MVP does not yet include signed/notarized releases, automated update delivery, or a native loopback/system-audio capture pipeline.

## Documentation

- [Architecture](docs/architecture.md)
- [Privacy model](docs/privacy.md)
- [AI providers](docs/ai-providers.md)
- [Audio](docs/audio.md)
- [Screen context](docs/screen-context.md)
- [Security](docs/security.md)
- [Development and packaging](docs/development.md)
# Aster

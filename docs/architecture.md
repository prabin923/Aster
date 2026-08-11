# Architecture

```text
React overlay ── Tauri IPC ── Rust native boundary ── AI provider
     │                 │                 │
     ├─ Chat           ├─ window state   ├─ OS credential store
     ├─ Transcript      ├─ event stream   ├─ request timeout/cancellation
     ├─ Settings        └─ secure commands└─ provider SSE parsing
     │
     ├─ AudioManager ─ SpeechProvider ─ transcript/context
     └─ ScreenContextProvider ─ local OCR ─ context
```

## Renderer

`src/App.tsx` is the overlay controller. Components are deliberately compact: `Chat`, `Transcript`, `ContextPanel`, `Settings`, `Overlay`, and `StatusIndicator`. It owns transient UI state only; no provider secret is exposed through its types or IPC results.

`ContextManager` holds the current task, rolling final transcript segments, a bounded summary, and screen-derived text. It clips text before model submission, expires old transcript into a short summary, and clears all active context immediately on request.

## Native boundary

The Rust process owns settings persistence, `keyring` access, provider transport, response streaming, window position, platform capture-policy status, and a small provider request limiter. Provider events are emitted over `aster://ai-stream`; the renderer begins rendering each delta without waiting for completion.

`src-tauri/src/capture_policy/` contains one module per supported desktop family. It returns a native capability (`native_exclusion`, `app_controlled_exclusion`, `window_sharing_recommended`, or `unsupported`) and an actual enabled state to React rather than treating a setting as proof of capture behavior. Windows operates only on Aster's HWND. macOS can test only an Aster-owned ScreenCaptureKit stream that excludes the overlay; it does not control another application's capture stream.

`settings.json` contains only non-secret preferences. Provider credentials live under the `com.aster.native-realtime-assistant` keyring service. All cloud calls originate in Rust, after a second secret-sanitization pass.

## Context budget and lifecycle

The active context uses no unlimited history. Final transcript segments are limited to 18 and compacted when their combined text exceeds the character budget. Screen text is capped at 3,000 characters. Raw capture data is not included in settings or history and is discarded once OCR finishes.

## Provider boundary

The frontend has an `AIProvider` abstraction and deterministic Mock provider for unit tests. Production providers are selected by the backend setting and have one Rust adapter each:

- OpenAI-compatible Chat Completions SSE
- Gemini `streamGenerateContent` SSE
- Anthropic Messages SSE

The adapter normalizes chunks into one frontend event shape and reports provider, network, timeout, malformed-stream, and credential errors without exposing secrets.

# Privacy model

Aster is local-first by default.

| Data | Default | Retention | Cloud behavior |
| --- | --- | --- | --- |
| Microphone audio | Off | Processed in memory and discarded | Never sent by the shipped audio adapters |
| Transcript | Current session only | Bounded active context; optional UI history | Redacted before a cloud AI request |
| Screen capture | Off | Frame is discarded after local OCR | Screenshot is not uploaded by Aster |
| Screen-derived text | Current session only | Cleared by **Clear Screen Context**; never written to settings | Redacted and included only in an answer request |
| API key | User action required | OS secure credential store | Sent only from Rust to the chosen provider |
| Telemetry | Off | No telemetry collector is enabled | N/A |

## Visible indicators

The Context tab displays **MIC ON/OFF**, **SCREEN CONTEXT ON/OFF**, **SCREEN-SHARE MODE**, and **AI** state. Aster does not use deceptive indicators. Enabling screen context requires an explicit system capture selection each time.

## Screen-share exclusion

The **Screen-share exclusion** control leaves Aster's native overlay visible on the local display. It does not hide the process or change endpoint-security, monitoring, DRM, examination, or proctoring behavior.

| Platform | Aster status | Implementation and limit |
| --- | --- | --- |
| Windows 10 version 2004+ | Supported | Calls and verifies `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` on Aster's top-level native window. It applies only to compatible DWM-composed capture paths. |
| macOS | Window sharing | Aster does not use `NSWindowSharingNone` as a capture-exclusion workaround. It recommends selecting a specific meeting/application window rather than **Entire Screen**, and does not claim the overlay is universally hidden. |
| Linux | Unsupported | Aster detects the session/desktop but the current window backend has no documented cross-desktop equivalent. |

Unsupported systems show **Capture exclusion is not supported in this environment.** A successful Windows call does not imply universal invisibility: external hardware, unsupported recorders, remote monitoring, and other capture paths are outside its scope.

## Controls

- **Clear** removes conversation, transcript, response, and active screen context from the UI.
- **Clear Screen Context** removes cached OCR text immediately.
- **Stop** cancels a response as soon as its provider stream observes cancellation.
- Settings turn screen context, history, transcript retention, and telemetry on or off. The current implementation keeps retention local and non-persistent; raw audio/screenshots are never stored.

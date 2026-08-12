# Privacy model

Aster is local-first by default.

| Data | Default | Retention | Cloud behavior |
| --- | --- | --- | --- |
| Microphone audio | Off | Processed in memory and discarded | Never sent by the shipped audio adapters |
| Transcript | Current session only | Bounded active context; optional UI history | Redacted before a cloud AI request |
| Screen capture | Off | Frame is discarded after local OCR | Screenshot is not uploaded by Aster |
| Screen-derived text | Current session only | Cleared by **Clear Screen Context**; never written to settings | Redacted and included only in an answer request |
| Active-window metadata | Current session only | App name/identifier, title, bounds, display, timestamp; up to 12 local history entries | Not sent unless **Use active-window metadata in AI requests** is explicitly enabled |
| API key | User action required | OS secure credential store | Sent only from Rust to the chosen provider |
| Telemetry | Off | No telemetry collector is enabled | N/A |

## Visible indicators

The Context tab displays **MIC ON/OFF**, **SCREEN CONTEXT ON/OFF**, **SCREEN-SHARE MODE**, and **AI** state. Aster does not use deceptive indicators. Enabling screen context requires an explicit system capture selection each time.

The Assistant view also displays **Working in** with the current app and focused-window title when macOS Accessibility or the applicable platform API permits it. Clicking Aster does not replace the working context with Aster itself. The title is metadata, not inspected window contents; Aster does not collect fields, keystrokes, clipboard data, private message bodies, browser history, or screenshots from this service.

If macOS Accessibility permission is denied, the active-window service returns `accessibility_permission_required` and exposes only the front application metadata it can safely obtain from AppKit. It never prompts, changes system permissions, or works around the denial.

## Screen-share privacy

The **Screen-share privacy** controls leave Aster's native overlay visible on the local display. They do not hide the process or change endpoint-security, monitoring, DRM, examination, or proctoring behavior.

| Platform | Aster status | Implementation and limit |
| --- | --- | --- |
| Windows 10 version 2004+ | Supported | Calls and verifies `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` on Aster's top-level native window. It applies only to compatible DWM-composed capture paths. |
| macOS | Supported | Applies `NSWindowSharingNone` to Aster's native `NSWindow` handle and verifies the setting. On macOS 12.3+, the **Capture Privacy Test** verifies an app-owned ScreenCaptureKit stream excluding the overlay. |
| Linux | Unsupported | Aster detects the session/desktop but the current window backend has no documented cross-desktop equivalent. |

Unsupported systems show **Capture exclusion is not supported in this environment.** A successful Windows call, or a successful macOS app-owned test, does not imply universal invisibility: external hardware, unsupported recorders, remote monitoring, and other capture paths are outside its scope.

## Controls

- **Clear** removes conversation, transcript, response, and active screen context from the UI.
- **Clear Screen Context** removes cached OCR text immediately.
- **Stop** cancels a response as soon as its provider stream observes cancellation.
- Settings turn screen context, history, transcript retention, and telemetry on or off. The current implementation keeps retention local and non-persistent; raw audio/screenshots are never stored.

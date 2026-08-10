# Screen context

Screen context is disabled by default. When enabled, Aster captures only after the user selects **Capture screen context** and approves the system capture picker.

1. The WebView obtains a one-time `getDisplayMedia` video stream.
2. A single downscaled frame is rendered in memory.
3. Tesseract performs local English OCR and extracts at most 3,000 characters.
4. A structured context object records the user-approved source, title placeholder, text, and recognized technical topics.
5. The video tracks are stopped and the raster frame is discarded.

The current MVP cannot reliably inspect the foreground application's private title across all operating systems, so it labels the source as **User-approved screen capture** instead of guessing. The screen-derived context can be cleared immediately and is never persisted as an image.

If local OCR language data has not been cached, Tesseract may download language assets on first use. That does not upload the captured frame. This behavior should be replaced with bundled language data before a fully offline packaged release.

## Screen sharing is separate

Screen context and screen-share behavior are independent. Screen context uses a user-approved capture stream for OCR; it does not alter what another application can capture. Aster's overlay remains a separate native desktop window, not a DOM element inside a meeting or browser window.

## Overlay screen-share behavior

Aster queries the native capture-policy module and displays its exact result. The local **Run local window check** verifies that the overlay window exists, is visible locally, identifies the window label, and reports the applicable documented capture behavior. It does not inspect, alter, or try to bypass third-party capture, monitoring, or proctoring software.

| Platform | Mode shown by Aster | Behavior |
| --- | --- | --- |
| Windows 10 version 2004+ | Native exclusion | Aster applies `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` to its own top-level native HWND and reads the affinity back. If either call or verification fails, the UI reports exclusion as off. |
| macOS | Window sharing | Aster does not use `NSWindowSharingNone` as an exclusion claim. macOS does not provide the same documented per-window capture-exclusion mechanism used on Windows. Keep Aster visible locally and select a specific meeting/application window when possible; do not select **Entire Screen** if you do not want other windows included. Capture behavior depends on the meeting app. |
| Linux | Unsupported | Aster detects `XDG_SESSION_TYPE` and `XDG_CURRENT_DESKTOP`, then reports that capture exclusion is unsupported until a documented, desktop-specific API is implemented. |

Capture exclusion is limited to supported normal OS capture paths. It is not equivalent to invisibility from security software, operating-system monitoring, external recorders, or proctoring systems.

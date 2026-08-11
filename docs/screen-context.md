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

Aster queries the native `capture_policy` module and displays its exact result. The **Capture Privacy Test** only exercises Aster's own native-window and capture path; it never inspects, alters, or tries to bypass a third-party capture, monitoring, or proctoring application.

On macOS 12.3 or later, the test deliberately verifies an app-controlled stream, not an OS-wide guarantee:

1. Aster confirms that its overlay has a native `NSWindow` and temporarily adds a test marker to that overlay.
2. It obtains `SCShareableContent`, locates the matching `SCWindow` and the display containing it.
3. It creates `SCContentFilter(display:excludingWindows:)` and an Aster-owned `SCStream`.
4. It receives a frame, checks that the test marker is absent, stops the stream, and removes the marker.

Screen Recording permission, unavailable shareable content, or a missing frame produces **Not applicable** rather than a success claim. The test keeps its frame in memory only and does not persist a recording or screenshot.

| Platform | Mode shown by Aster | Behavior |
| --- | --- | --- |
| Windows 10 version 2004+ | Native exclusion | Aster applies `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` to its own top-level native HWND and reads the affinity back. If either call or verification fails, the UI reports exclusion as off. |
| macOS | Native exclusion | Aster applies `NSWindowSharingNone` to its native `NSWindow` handle and reads the setting back. If either call or verification fails, the UI reports exclusion as off. |
| Linux | Unsupported | Aster detects `XDG_SESSION_TYPE` and `XDG_CURRENT_DESKTOP`, then reports that capture exclusion is unsupported until a documented, desktop-specific API is implemented. |

Capture exclusion is limited to supported normal OS capture paths. It is not equivalent to invisibility from security software, operating-system monitoring, external recorders, or proctoring systems.

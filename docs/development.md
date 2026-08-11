# Development and packaging

## Local setup

Install Node.js 22+ and a current stable Rust toolchain. Then run:

```bash
npm install
npm run check
npm test
npm run dev
```

`npm run dev` starts Vite on port 1420 and launches the Tauri desktop process. `npm run build` validates TypeScript and creates the frontend bundle. `npm run package` invokes `tauri build` for the current operating system.

## Test coverage

Frontend unit tests cover context buffering/expiry, question detection, secret redaction, Mock AI streaming, Mock STT transcript events, and screen-context parsing/budgeting. Rust unit tests cover backend context sanitization. `npm run check` runs the TypeScript check plus `cargo check`.

Manual desktop smoke checks for each release:

1. Launch, move, resize, minimize, and restore the overlay.
2. Toggle always-on-top, opacity, theme, position, and shortcut.
3. Request a Mock answer; verify first chunks render before completion, Stop works, and copy/regenerate/clear work.
4. Confirm a cloud key is neither displayed nor written to settings JSON.
5. Test denied/disconnected microphone and capture permissions.
6. Enable screen context, choose a source, then clear it.
7. Open **Settings → Screen-share privacy** and run **Capture Privacy Test**. Confirm the overlay and native window are detected and that the UI's mode matches the returned native capability.
8. On macOS 12.3+, grant Screen Recording permission if requested, then run the test. A pass means only that Aster's own ScreenCaptureKit stream received a frame with the excluded-overlay test marker absent. It must still show **Window sharing recommended** for third-party capture.
9. On Windows 10 version 2004+, enable exclusion, verify the native `GetWindowDisplayAffinity` read-back succeeds, then test both window capture and display capture in a supported sharing app. Confirm the overlay remains visible locally and is absent only from the supported capture path. Repeat with exclusion off to confirm normal inclusion.
10. On Linux, confirm the detected session/desktop reports **Unsupported** unless a documented desktop-specific implementation has been added.

Automated coverage includes platform-default status, invalid-state protection, and the Windows implementation's `GetWindowDisplayAffinity` read-back after applying `WDA_EXCLUDEFROMCAPTURE`. Windows capture-app tests require a Windows desktop runner because they exercise OS compositor behavior. The macOS test is intentionally a manual ScreenCaptureKit diagnostic of Aster's own stream, because it may require Screen Recording permission; it never simulates or controls third-party sharing.

## Packaging matrix

- **macOS:** build `.app` and DMG on macOS; distribute signed/notarized artifacts for external users.
- **Windows:** build MSI/NSIS on Windows with appropriate code signing.
- **Linux:** build native package formats on the target distribution/CI image after installing WebKitGTK dependencies.

The repository config currently targets `app` and `dmg` because it was built on macOS. Adjust `bundle.targets` in `src-tauri/tauri.conf.json` from a target-appropriate build environment for Windows or Linux.

## Release hardening next

Before a broad release, add CI builds per OS, code signing/notarization, bundled OCR language data, a production native/cloud STT adapter, provider health probes, accessibility testing, and automated desktop UI tests.

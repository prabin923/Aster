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
7. Check Screen-share exclusion status. On unsupported macOS/Linux, verify the control is disabled and the unsupported message is visible while the local overlay remains visible.
8. On Windows 10 version 2004+, enable exclusion, verify the native `GetWindowDisplayAffinity` read-back succeeds, then test both window capture and display capture in a supported sharing app. Confirm the overlay remains visible locally and is absent only from the supported capture path. Repeat with exclusion off to confirm normal inclusion.

Automated coverage includes platform-default status and the Windows implementation verifies `GetWindowDisplayAffinity` immediately after applying `WDA_EXCLUDEFROMCAPTURE`. Windows capture-app tests require a Windows desktop runner because they exercise OS compositor behavior; macOS/Linux tests assert the honest unsupported state rather than simulating universal exclusion.

## Packaging matrix

- **macOS:** build `.app` and DMG on macOS; distribute signed/notarized artifacts for external users.
- **Windows:** build MSI/NSIS on Windows with appropriate code signing.
- **Linux:** build native package formats on the target distribution/CI image after installing WebKitGTK dependencies.

The repository config currently targets `app` and `dmg` because it was built on macOS. Adjust `bundle.targets` in `src-tauri/tauri.conf.json` from a target-appropriate build environment for Windows or Linux.

## Release hardening next

Before a broad release, add CI builds per OS, code signing/notarization, bundled OCR language data, a production native/cloud STT adapter, provider health probes, accessibility testing, and automated desktop UI tests.

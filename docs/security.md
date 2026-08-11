# Security

## Trust boundaries

- The React renderer is treated as untrusted for secrets.
- Rust validates settings and owns all provider HTTP requests.
- Capability configuration permits only required window, store, opener, and global-shortcut operations.
- There is no shell plugin, arbitrary filesystem access, system process discovery, or hidden-process behavior.

## Credentials

Provider keys are stored with Rust `keyring`, which maps to macOS Keychain, Windows Credential Manager, or a Linux Secret Service implementation when present. Aster does not serialize keys to the local settings file, display a stored key, or log it.

## Cloud data minimization

Before every request, both the frontend context manager and Rust backend redact common key/password/token assignments, bearer credentials, private-key blocks, and recognizable API-key prefixes. This is defense in depth, not a replacement for reviewing the context before sending it to a cloud provider.

## Resilience

Cloud requests have connection and total-request timeouts. Stream errors, invalid credentials, provider failures, and rate limits produce a recoverable error state. A small per-provider request limiter prevents accidental rapid submission. The mock provider remains available offline.

## Non-goals

Aster does not conceal itself from users, endpoint security, enterprise monitoring, exam/proctoring software, DRM, or screen capture software. It contains no process hiding, anti-debugging, DLL/code injection, browser or meeting-client modification, API hooking, security-software detection, or window/process spoofing.

On supported Windows versions, Aster invokes `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` for its top-level native window and verifies the state with `GetWindowDisplayAffinity`. On macOS, Aster applies `NSWindowSharingNone` to its native `NSWindow` handle and verifies the setting. It can also create and test an Aster-owned ScreenCaptureKit stream with the overlay excluded. Linux is capability-detected and unsupported by default. Capture exclusion is never represented as universal invisibility from security software or operating-system monitoring.

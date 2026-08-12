use super::{AppOwnedStreamStatus, CaptureMode, CaptureTestResult, PlatformDiagnostic};
use std::env;
use tauri::WebviewWindow;

pub fn name() -> &'static str { "Linux" }
pub fn mode() -> CaptureMode { CaptureMode::Unsupported }
pub fn is_capture_exclusion_supported() -> bool { false }
pub fn requires_overlay_marker() -> bool { false }
pub fn setup_window_behavior(_window: &WebviewWindow) {}
pub fn app_owned_stream_status() -> Option<AppOwnedStreamStatus> { None }

pub fn capability_message() -> String {
    let session = env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown session".to_string());
    let desktop = env::var("XDG_CURRENT_DESKTOP").unwrap_or_else(|_| "unknown desktop".to_string());
    format!("Capture exclusion is not supported in this environment. Detected session: {session}; desktop: {desktop}.")
}

pub fn is_enabled(_window: &WebviewWindow) -> Result<bool, String> { Ok(false) }
pub fn set_capture_exclusion(_window: &WebviewWindow, _enabled: bool) -> Result<bool, String> { Ok(false) }

pub fn run_diagnostic(window: Option<&WebviewWindow>, _marker_added: bool) -> PlatformDiagnostic {
    PlatformDiagnostic {
        result: CaptureTestResult::NotApplicable,
        native_window_detected: window.is_some_and(|window| window.is_visible().is_ok()),
        app_owned_stream: None,
        message: capability_message(),
    }
}

#[cfg(test)]
mod tests {
    use super::{is_capture_exclusion_supported, mode, CaptureMode};
    #[test]
    fn reports_unsupported_without_claiming_exclusion() {
        assert!(!is_capture_exclusion_supported());
        assert_eq!(mode(), CaptureMode::Unsupported);
    }
}

use super::CaptureMode;
use std::env;
use tauri::WebviewWindow;

pub fn name() -> &'static str { "Linux" }

pub fn mode() -> CaptureMode { CaptureMode::Unsupported }

pub fn is_capture_exclusion_supported() -> bool { false }

pub fn capability_message() -> String {
    let session = env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown session".to_string());
    let desktop = env::var("XDG_CURRENT_DESKTOP").unwrap_or_else(|_| "unknown desktop".to_string());
    format!("Capture exclusion is not supported in this environment. Detected session: {session}; desktop: {desktop}.")
}

pub fn is_enabled(_window: &WebviewWindow) -> Result<bool, String> { Ok(false) }

pub fn set_capture_exclusion(_window: &WebviewWindow, _enabled: bool) -> Result<bool, String> { Ok(false) }

#[cfg(test)]
mod tests {
    use super::{is_capture_exclusion_supported, mode, CaptureMode};

    #[test]
    fn reports_unsupported_without_claiming_exclusion() {
        assert!(!is_capture_exclusion_supported());
        assert_eq!(mode(), CaptureMode::Unsupported);
    }
}

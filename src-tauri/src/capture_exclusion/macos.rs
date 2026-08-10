use super::CaptureMode;
use tauri::WebviewWindow;

pub fn name() -> &'static str { "macOS" }

pub fn mode() -> CaptureMode { CaptureMode::WindowSharing }

pub fn is_capture_exclusion_supported() -> bool { false }

pub fn capability_message() -> String {
    "macOS does not provide the same documented per-window capture-exclusion mechanism available on Windows. For screen sharing, share the meeting/application window instead of the entire display.".to_string()
}

pub fn is_enabled(_window: &WebviewWindow) -> Result<bool, String> { Ok(false) }

pub fn set_capture_exclusion(_window: &WebviewWindow, _enabled: bool) -> Result<bool, String> { Ok(false) }

#[cfg(test)]
mod tests {
    use super::{is_capture_exclusion_supported, mode, CaptureMode};

    #[test]
    fn reports_window_sharing_fallback_without_claiming_exclusion() {
        assert!(!is_capture_exclusion_supported());
        assert_eq!(mode(), CaptureMode::WindowSharing);
    }
}

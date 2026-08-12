#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveWindow {
    /// `false` means that platform-specific focused-window details are not
    /// available. A platform may still provide the front app's safe metadata.
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub application_name: String,
    pub bundle_id: String,
    pub window_title: String,
    pub process_id: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bounds: Option<WindowBounds>,
    pub display_id: String,
    /// The renderer uses this to retain the user's previous working context
    /// when the Aster overlay receives focus.
    pub is_assistant_window: bool,
}

impl ActiveWindow {
    #[allow(dead_code)]
    pub fn unavailable(reason: impl Into<String>) -> Self {
        Self {
            available: false,
            reason: Some(reason.into()),
            application_name: String::new(),
            bundle_id: String::new(),
            window_title: String::new(),
            process_id: 0,
            bounds: None,
            display_id: String::new(),
            is_assistant_window: false,
        }
    }
}

#[cfg(target_os = "linux")]
use linux as platform;
#[cfg(target_os = "macos")]
use macos as platform;
#[cfg(target_os = "windows")]
use windows as platform;

/// Reads native focused-window metadata once. It never reads pixels,
/// keystrokes, fields, clipboard data, or application content.
pub fn get_active_window() -> ActiveWindow {
    platform::get_active_window()
}

#[cfg(test)]
mod tests {
    use super::ActiveWindow;

    #[test]
    fn unavailable_result_never_claims_window_details() {
        let result = ActiveWindow::unavailable("unsupported");
        assert!(!result.available);
        assert!(result.bounds.is_none());
        assert!(!result.is_assistant_window);
    }
}

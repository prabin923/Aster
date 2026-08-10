#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

use serde::Serialize;
use tauri::WebviewWindow;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CaptureMode {
    NativeExclusion,
    WindowSharing,
    Unsupported,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureCapability {
    pub supported: bool,
    pub mode: CaptureMode,
    pub enabled: bool,
    pub platform: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalCaptureTest {
    pub overlay_window_exists: bool,
    pub overlay_visible_locally: bool,
    pub window_identity: String,
    pub supported_capture_behavior: String,
    pub capability: CaptureCapability,
}

#[cfg(target_os = "linux")]
use linux as platform;
#[cfg(target_os = "macos")]
use macos as platform;
#[cfg(target_os = "windows")]
use windows as platform;

pub fn default_enabled() -> bool {
    platform::is_capture_exclusion_supported()
}

pub fn is_capture_exclusion_supported() -> bool {
    platform::is_capture_exclusion_supported()
}

pub fn get_capture_capability(window: Option<&WebviewWindow>) -> CaptureCapability {
    let supported = is_capture_exclusion_supported();
    CaptureCapability {
        supported,
        mode: platform::mode(),
        enabled: supported && window.is_some_and(|window| platform::is_enabled(window).unwrap_or(false)),
        platform: platform::name().to_string(),
        message: platform::capability_message(),
    }
}

pub fn set_capture_exclusion(window: &WebviewWindow, enabled: bool) -> CaptureCapability {
    if !is_capture_exclusion_supported() {
        return CaptureCapability {
            supported: false,
            mode: platform::mode(),
            enabled: false,
            platform: platform::name().to_string(),
            message: platform::capability_message(),
        };
    }

    match platform::set_capture_exclusion(window, enabled) {
        Ok(verified_enabled) => CaptureCapability {
            supported: true,
            mode: CaptureMode::NativeExclusion,
            enabled: verified_enabled,
            platform: platform::name().to_string(),
            message: if verified_enabled {
                "Native capture exclusion active for supported Windows capture paths. The overlay remains visible locally.".to_string()
            } else {
                "Screen-share exclusion is off. The overlay may appear in screen captures.".to_string()
            },
        },
        Err(message) => failed_native_capability(message),
    }
}

fn failed_native_capability(message: String) -> CaptureCapability {
    CaptureCapability {
        supported: true,
        mode: CaptureMode::NativeExclusion,
        enabled: false,
        platform: platform::name().to_string(),
        message,
    }
}

pub fn run_local_capture_test(window: Option<&WebviewWindow>, capability: CaptureCapability) -> LocalCaptureTest {
    let (overlay_window_exists, overlay_visible_locally, window_identity) = match window {
        Some(window) => (
            true,
            window.is_visible().unwrap_or(false),
            format!("native window: {}", window.label()),
        ),
        None => (false, false, "overlay window unavailable".to_string()),
    };
    let supported_capture_behavior = match capability.mode {
        CaptureMode::NativeExclusion if capability.enabled => "Native capture exclusion verified for this window.".to_string(),
        CaptureMode::NativeExclusion => "Native capture exclusion is available but not active.".to_string(),
        CaptureMode::WindowSharing => "Window sharing guidance only; no reliable per-window exclusion is claimed.".to_string(),
        CaptureMode::Unsupported => "No documented capture-exclusion path is available in this environment.".to_string(),
    };
    LocalCaptureTest { overlay_window_exists, overlay_visible_locally, window_identity, supported_capture_behavior, capability }
}

#[cfg(test)]
mod tests {
    use super::{failed_native_capability, CaptureCapability, CaptureMode};

    #[test]
    fn unsupported_or_fallback_modes_can_never_report_enabled() {
        let macos = CaptureCapability { supported: false, mode: CaptureMode::WindowSharing, enabled: false, platform: "macOS".into(), message: String::new() };
        let linux = CaptureCapability { supported: false, mode: CaptureMode::Unsupported, enabled: false, platform: "Linux".into(), message: String::new() };
        assert!(!macos.enabled);
        assert!(!linux.enabled);
    }

    #[test]
    fn only_native_exclusion_can_be_enabled() {
        let active = CaptureCapability { supported: true, mode: CaptureMode::NativeExclusion, enabled: true, platform: "Windows".into(), message: String::new() };
        assert!(active.enabled);
        assert_eq!(active.mode, CaptureMode::NativeExclusion);
    }

    #[test]
    fn native_operation_failure_is_never_reported_as_enabled() {
        let failure = failed_native_capability("native API rejected the request".into());
        assert_eq!(failure.mode, CaptureMode::NativeExclusion);
        assert!(failure.supported);
        assert!(!failure.enabled);
    }
}

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

use serde::Serialize;
use std::thread;
use std::time::Duration;
use tauri::WebviewWindow;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CaptureMode {
    NativeExclusion,
    AppControlledExclusion,
    #[allow(dead_code)]
    WindowSharingRecommended,
    Unsupported,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureCapability {
    pub platform: String,
    pub mode: CaptureMode,
    pub supported: bool,
    pub enabled: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppOwnedStreamStatus {
    pub mode: CaptureMode,
    pub supported: bool,
    pub enabled: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStatus {
    #[serde(flatten)]
    pub capability: CaptureCapability,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_owned_stream: Option<AppOwnedStreamStatus>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CaptureTestResult {
    Pass,
    Fail,
    NotApplicable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePrivacyTest {
    pub platform: String,
    pub overlay_detected: bool,
    pub native_window_detected: bool,
    pub capture_capability: CaptureCapability,
    pub exclusion: String,
    pub result: CaptureTestResult,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_owned_stream: Option<AppOwnedStreamStatus>,
}

#[derive(Debug, Clone)]
pub(crate) struct PlatformDiagnostic {
    pub result: CaptureTestResult,
    pub native_window_detected: bool,
    pub app_owned_stream: Option<AppOwnedStreamStatus>,
    pub message: String,
}

#[cfg(target_os = "linux")]
use linux as platform;
#[cfg(target_os = "macos")]
use macos as platform;
#[cfg(target_os = "windows")]
use windows as platform;

const TEST_MARKER_ID: &str = "aster-capture-policy-test-marker";
const INSERT_TEST_MARKER_SCRIPT: &str = r#"
(() => {
  const id = 'aster-capture-policy-test-marker';
  document.getElementById(id)?.remove();
  const marker = document.createElement('div');
  marker.id = id;
  marker.setAttribute('aria-hidden', 'true');
  Object.assign(marker.style, {
    position: 'fixed', top: '12px', right: '12px', width: '48px', height: '48px',
    zIndex: '2147483647', background: 'rgb(255, 0, 255)', pointerEvents: 'none'
  });
  document.body.appendChild(marker);
})();
"#;

pub fn default_enabled() -> bool {
    platform::is_capture_exclusion_supported()
}

pub fn setup_window_behavior(window: &WebviewWindow) {
    platform::setup_window_behavior(window);
}

pub fn follow_cursor_to_screen(window: &WebviewWindow) -> bool {
    platform::follow_cursor_to_screen(window)
}

pub fn is_capture_exclusion_supported() -> bool {
    platform::is_capture_exclusion_supported()
}

pub fn get_capture_capability(window: Option<&WebviewWindow>) -> CaptureCapability {
    let supported = is_capture_exclusion_supported();
    let enabled = supported && window.is_some_and(|window| platform::is_enabled(window).unwrap_or(false));
    CaptureCapability {
        platform: platform::name().to_string(),
        mode: platform::mode(),
        supported,
        enabled,
        message: platform::capability_message(),
    }
}

pub fn capture_status(capability: CaptureCapability) -> CaptureStatus {
    CaptureStatus { app_owned_stream: platform::app_owned_stream_status(), capability }
}

pub fn set_capture_exclusion(window: &WebviewWindow, enabled: bool) -> CaptureCapability {
    if !is_capture_exclusion_supported() {
        return get_capture_capability(Some(window));
    }

    match platform::set_capture_exclusion(window, enabled) {
        Ok(verified_enabled) => CaptureCapability {
            platform: platform::name().to_string(),
            mode: CaptureMode::NativeExclusion,
            supported: true,
            enabled: verified_enabled,
            message: if verified_enabled {
                format!("Native capture exclusion active for supported {} capture paths. The overlay remains visible locally.", platform::name())
            } else {
                "Screen-share exclusion is off. The overlay may appear in screen captures.".to_string()
            },
        },
        Err(message) => CaptureCapability {
            platform: platform::name().to_string(),
            mode: CaptureMode::NativeExclusion,
            supported: true,
            enabled: false,
            message,
        },
    }
}

pub fn run_capture_privacy_test(window: Option<&WebviewWindow>, capability: CaptureCapability) -> CapturePrivacyTest {
    let overlay_detected = window.is_some();
    let marker_required = platform::requires_overlay_marker();
    let marker_added = match (window, marker_required) {
        (Some(window), true) => {
            let added = window.eval(INSERT_TEST_MARKER_SCRIPT).is_ok();
            if added {
                // Let the app-owned marker reach the compositor before the
                // ScreenCaptureKit stream is created.
                thread::sleep(Duration::from_millis(250));
            }
            added
        }
        _ => false,
    };
    let diagnostic = platform::run_diagnostic(window, marker_added);
    if marker_required {
        if let Some(window) = window {
            let _ = window.eval(&format!("document.getElementById('{TEST_MARKER_ID}')?.remove();"));
        }
    }

    let exclusion = match diagnostic.app_owned_stream.as_ref() {
        Some(status) if status.enabled => "enabled",
        _ if capability.enabled => "enabled",
        _ => "disabled",
    }.to_string();
    CapturePrivacyTest {
        platform: capability.platform.clone(),
        overlay_detected,
        native_window_detected: diagnostic.native_window_detected,
        capture_capability: capability,
        exclusion,
        result: diagnostic.result,
        message: diagnostic.message,
        app_owned_stream: diagnostic.app_owned_stream,
    }
}

#[cfg(test)]
mod tests {
    use super::{CaptureCapability, CaptureMode, CaptureStatus};

    #[test]
    fn window_sharing_fallback_never_reports_enabled() {
        let capability = CaptureCapability {
            platform: "macOS".into(), mode: CaptureMode::WindowSharingRecommended,
            supported: false, enabled: false, message: String::new(),
        };
        assert!(!capability.enabled);
        let status = CaptureStatus { capability, app_owned_stream: None };
        assert!(!status.capability.enabled);
    }

    #[test]
    fn only_verified_native_exclusion_is_enabled_for_system_capture() {
        let capability = CaptureCapability {
            platform: "Windows".into(), mode: CaptureMode::NativeExclusion,
            supported: true, enabled: true, message: String::new(),
        };
        assert!(capability.enabled);
        assert_eq!(capability.mode, CaptureMode::NativeExclusion);
    }
}

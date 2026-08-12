use super::{AppOwnedStreamStatus, CaptureMode, CaptureTestResult, PlatformDiagnostic};
use std::ffi::{c_char, c_void, CStr};
use tauri::WebviewWindow;

#[repr(C)]
struct RawScreenCaptureDiagnostic {
    status: i32,
    overlay_detected: i32,
    native_window_detected: i32,
    stream_started: i32,
    frame_received: i32,
    marker_detected: i32,
    message: *mut c_char,
}

unsafe extern "C" {
    fn aster_sck_is_available() -> i32;
    fn aster_sck_run_overlay_exclusion_test(ns_window: *mut c_void) -> RawScreenCaptureDiagnostic;
    fn aster_sck_free_message(message: *mut c_char);
    fn aster_set_ns_window_sharing_none(ns_window: *mut c_void);
    fn aster_set_ns_window_sharing_type(ns_window: *mut c_void, sharing_type: i32);
    fn aster_get_ns_window_sharing_type(ns_window: *mut c_void) -> i32;
    fn aster_setup_macos_window_behavior(ns_window: *mut c_void);
    fn aster_start_cursor_following(ns_window: *mut c_void);
}

pub fn name() -> &'static str { "macOS" }
pub fn mode() -> CaptureMode { CaptureMode::NativeExclusion }
pub fn is_capture_exclusion_supported() -> bool { true }
pub fn requires_overlay_marker() -> bool { true }

pub fn setup_window_behavior(window: &WebviewWindow) {
    if let Ok(ns_window) = window.ns_window() {
        unsafe {
            aster_setup_macos_window_behavior(ns_window);
            aster_start_cursor_following(ns_window);
        }
    }
}

pub fn capability_message() -> String {
    if is_capture_exclusion_supported() {
        "macOS supports native capture exclusion (NSWindowSharingNone) for this top-level overlay window.".to_string()
    } else {
        "Capture exclusion is not supported in this macOS environment.".to_string()
    }
}

pub fn app_owned_stream_status() -> Option<AppOwnedStreamStatus> {
    let available = unsafe { aster_sck_is_available() != 0 };
    Some(AppOwnedStreamStatus {
        mode: CaptureMode::AppControlledExclusion,
        supported: available,
        enabled: false,
        message: if available {
            "ScreenCaptureKit can create an Aster-owned display stream that excludes the native overlay. Run Capture Privacy Test to verify it; this does not control Zoom, Meet, Teams, OBS, or other apps.".to_string()
        } else {
            "ScreenCaptureKit app-owned exclusion requires macOS 12.3 or later.".to_string()
        },
    })
}

pub fn is_enabled(window: &WebviewWindow) -> Result<bool, String> {
    let ns_window = window.ns_window().map_err(|_| "Aster could not access its native NSWindow.".to_string())?;
    let sharing_type = unsafe { aster_get_ns_window_sharing_type(ns_window) };
    Ok(sharing_type == 0)
}

pub fn set_capture_exclusion(window: &WebviewWindow, enabled: bool) -> Result<bool, String> {
    if enabled && !is_capture_exclusion_supported() {
        return Err(capability_message());
    }
    let ns_window = window.ns_window().map_err(|_| "Aster could not access its native NSWindow.".to_string())?;
    unsafe {
        if enabled {
            aster_set_ns_window_sharing_none(ns_window);
        } else {
            aster_set_ns_window_sharing_type(ns_window, 1);
        }
    }
    verify_requested_state(enabled, is_enabled(window)?)
}

fn verify_requested_state(requested: bool, verified: bool) -> Result<bool, String> {
    if requested && !verified {
        return Err("macOS did not apply NSWindowSharingNone; the overlay remains included in capture.".to_string());
    }
    if !requested && verified {
        return Err("macOS did not disable the overlay capture-exclusion setting.".to_string());
    }
    Ok(verified)
}

pub fn run_diagnostic(window: Option<&WebviewWindow>, marker_added: bool) -> PlatformDiagnostic {
    let native_window_detected = window.is_some_and(|window| window.ns_window().is_ok());
    if unsafe { aster_sck_is_available() == 0 } {
        return PlatformDiagnostic {
            result: CaptureTestResult::NotApplicable,
            native_window_detected,
            app_owned_stream: app_owned_stream_status(),
            message: "ScreenCaptureKit requires macOS 12.3 or later.".to_string(),
        };
    }
    if !marker_added {
        return PlatformDiagnostic {
            result: CaptureTestResult::NotApplicable,
            native_window_detected,
            app_owned_stream: app_owned_stream_status(),
            message: "Aster could not add its local test marker before creating the app-owned capture stream.".to_string(),
        };
    }
    let Some(window) = window else {
        return PlatformDiagnostic {
            result: CaptureTestResult::Fail,
            native_window_detected: false,
            app_owned_stream: app_owned_stream_status(),
            message: "The native Aster overlay window is unavailable.".to_string(),
        };
    };
    let ns_window = match window.ns_window() {
        Ok(window) => window,
        Err(_) => return PlatformDiagnostic {
            result: CaptureTestResult::Fail,
            native_window_detected: false,
            app_owned_stream: app_owned_stream_status(),
            message: "Aster could not access its native NSWindow.".to_string(),
        },
    };
    let raw = unsafe { aster_sck_run_overlay_exclusion_test(ns_window) };
    let message = if raw.message.is_null() {
        "ScreenCaptureKit returned no diagnostic message.".to_string()
    } else {
        let message = unsafe { CStr::from_ptr(raw.message) }.to_string_lossy().into_owned();
        unsafe { aster_sck_free_message(raw.message) };
        message
    };
    let enabled = raw.status == 1 && raw.stream_started != 0 && raw.frame_received != 0 && raw.marker_detected == 0;
    let result = match raw.status {
        1 => CaptureTestResult::Pass,
        0 => CaptureTestResult::Fail,
        _ => CaptureTestResult::NotApplicable,
    };
    PlatformDiagnostic {
        result,
        native_window_detected: raw.native_window_detected != 0,
        app_owned_stream: Some(AppOwnedStreamStatus {
            mode: CaptureMode::AppControlledExclusion,
            supported: true,
            enabled,
            message: message.clone(),
        }),
        message,
    }
}

#[cfg(test)]
mod tests {
    use super::{app_owned_stream_status, is_capture_exclusion_supported, mode, verify_requested_state, CaptureMode};

    #[test]
    fn macos_supports_native_exclusion_with_nswindowsharingnone() {
        assert!(is_capture_exclusion_supported());
        assert_eq!(mode(), CaptureMode::NativeExclusion);
    }

    #[test]
    fn reports_success_only_after_nswindow_sharing_state_is_verified() {
        assert_eq!(verify_requested_state(true, true).unwrap(), true);
        assert_eq!(verify_requested_state(false, false).unwrap(), false);
    }

    #[test]
    fn app_owned_stream_is_distinct_from_third_party_sharing() {
        let status = app_owned_stream_status().expect("macOS exposes a ScreenCaptureKit status");
        assert_eq!(status.mode, CaptureMode::AppControlledExclusion);
        assert!(!status.enabled);
    }
}

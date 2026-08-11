use super::{AppOwnedStreamStatus, CaptureMode, CaptureTestResult, PlatformDiagnostic};
use tauri::WebviewWindow;
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowDisplayAffinity, SetWindowDisplayAffinity, WINDOW_DISPLAY_AFFINITY,
    WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
};

const WINDOWS_10_2004_BUILD: u32 = 19_041;

#[repr(C)]
struct RtlOsVersionInfoW {
    size: u32,
    major: u32,
    minor: u32,
    build: u32,
    platform_id: u32,
    csd_version: [u16; 128],
}

#[link(name = "ntdll")]
unsafe extern "system" {
    fn RtlGetVersion(version: *mut RtlOsVersionInfoW) -> i32;
}

pub fn name() -> &'static str { "Windows" }
pub fn mode() -> CaptureMode { CaptureMode::NativeExclusion }
pub fn requires_overlay_marker() -> bool { false }
pub fn setup_window_behavior(_window: &WebviewWindow) {}
pub fn follow_cursor_to_screen(_window: &WebviewWindow) -> bool { false }
pub fn app_owned_stream_status() -> Option<AppOwnedStreamStatus> { None }

fn build_number() -> Option<u32> {
    let mut version = RtlOsVersionInfoW { size: std::mem::size_of::<RtlOsVersionInfoW>() as u32, major: 0, minor: 0, build: 0, platform_id: 0, csd_version: [0; 128] };
    let status = unsafe { RtlGetVersion(&mut version) };
    (status == 0 && version.major >= 10).then_some(version.build)
}

pub fn is_capture_exclusion_supported() -> bool {
    build_number().is_some_and(|build| build >= WINDOWS_10_2004_BUILD)
}

pub fn capability_message() -> String {
    if is_capture_exclusion_supported() {
        "Windows supports native capture exclusion for this top-level overlay window.".to_string()
    } else {
        "Capture exclusion is not supported in this Windows environment. Windows 10 version 2004 (build 19041) or later is required.".to_string()
    }
}

pub fn is_enabled(window: &WebviewWindow) -> Result<bool, String> {
    let hwnd = window.hwnd().map_err(|_| "Unable to access the native Windows overlay handle.".to_string())?;
    let mut affinity = WINDOW_DISPLAY_AFFINITY(0);
    unsafe { GetWindowDisplayAffinity(hwnd, &mut affinity) }
        .map_err(|_| "Windows could not read the overlay capture-exclusion state.".to_string())?;
    Ok(affinity == WDA_EXCLUDEFROMCAPTURE)
}

pub fn set_capture_exclusion(window: &WebviewWindow, enabled: bool) -> Result<bool, String> {
    if enabled && !is_capture_exclusion_supported() {
        return Err(capability_message());
    }
    let hwnd = window.hwnd().map_err(|_| "Unable to access the native Windows overlay handle.".to_string())?;
    let affinity = if enabled { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE };
    unsafe { SetWindowDisplayAffinity(hwnd, affinity) }
        .map_err(|_| "Windows rejected the screen-share exclusion request for this overlay.".to_string())?;
    verify_requested_state(enabled, is_enabled(window)?)
}

pub fn run_diagnostic(window: Option<&WebviewWindow>, _marker_added: bool) -> PlatformDiagnostic {
    let native_window_detected = window.is_some_and(|window| window.hwnd().is_ok());
    if !is_capture_exclusion_supported() {
        return PlatformDiagnostic { result: CaptureTestResult::NotApplicable, native_window_detected, app_owned_stream: None, message: capability_message() };
    }
    match window.and_then(|window| is_enabled(window).ok()) {
        Some(true) => PlatformDiagnostic { result: CaptureTestResult::Pass, native_window_detected, app_owned_stream: None, message: "WDA_EXCLUDEFROMCAPTURE is active and verified on Aster's native HWND.".to_string() },
        Some(false) => PlatformDiagnostic { result: CaptureTestResult::Fail, native_window_detected, app_owned_stream: None, message: "WDA_EXCLUDEFROMCAPTURE is not active for Aster's native HWND.".to_string() },
        None => PlatformDiagnostic { result: CaptureTestResult::Fail, native_window_detected, app_owned_stream: None, message: "Windows could not read the display-affinity state for Aster's native HWND.".to_string() },
    }
}

fn verify_requested_state(requested: bool, verified: bool) -> Result<bool, String> {
    if requested && !verified {
        return Err("Windows did not apply WDA_EXCLUDEFROMCAPTURE; the overlay remains included in capture.".to_string());
    }
    if !requested && verified {
        return Err("Windows did not disable the overlay capture-exclusion setting.".to_string());
    }
    Ok(verified)
}

#[cfg(test)]
mod tests {
    use super::{mode, verify_requested_state, CaptureMode};

    #[test]
    fn windows_uses_native_exclusion_mode() { assert_eq!(mode(), CaptureMode::NativeExclusion); }
    #[test]
    fn reports_success_only_after_windows_affinity_is_read_back() { assert_eq!(verify_requested_state(true, true).unwrap(), true); }
    #[test]
    fn reports_disable_only_after_windows_affinity_is_cleared() { assert_eq!(verify_requested_state(false, false).unwrap(), false); }
    #[test]
    fn reports_windows_api_or_read_back_failures_as_errors() {
        assert!(verify_requested_state(true, false).is_err());
        assert!(verify_requested_state(false, true).is_err());
    }
}

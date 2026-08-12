use super::{ActiveWindow, WindowBounds};
use std::ffi::{c_char, CStr};

#[repr(C)]
struct RawActiveWindow {
    available: i32,
    is_assistant_window: i32,
    process_id: u32,
    has_bounds: i32,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    application_name: *mut c_char,
    bundle_id: *mut c_char,
    window_title: *mut c_char,
    display_id: *mut c_char,
    reason: *mut c_char,
}

unsafe extern "C" {
    fn aster_get_active_window() -> RawActiveWindow;
    fn aster_active_window_free_result(result: RawActiveWindow);
}

fn string_from_native(value: *mut c_char) -> String {
    if value.is_null() {
        String::new()
    } else {
        unsafe { CStr::from_ptr(value).to_string_lossy().into_owned() }
    }
}

pub fn get_active_window() -> ActiveWindow {
    let raw = unsafe { aster_get_active_window() };
    let result = ActiveWindow {
        available: raw.available != 0,
        reason: {
            let reason = string_from_native(raw.reason);
            (!reason.trim().is_empty()).then_some(reason)
        },
        application_name: string_from_native(raw.application_name),
        bundle_id: string_from_native(raw.bundle_id),
        window_title: string_from_native(raw.window_title),
        process_id: raw.process_id,
        bounds: (raw.has_bounds != 0).then_some(WindowBounds {
            x: raw.x,
            y: raw.y,
            width: raw.width.max(0.0),
            height: raw.height.max(0.0),
        }),
        display_id: string_from_native(raw.display_id),
        is_assistant_window: raw.is_assistant_window != 0,
    };
    unsafe { aster_active_window_free_result(raw) };
    result
}

#[cfg(test)]
mod tests {
    use super::string_from_native;

    #[test]
    fn null_native_strings_are_safe() {
        assert!(string_from_native(std::ptr::null_mut()).is_empty());
    }
}

use super::{ActiveWindow, WindowBounds};
use std::path::Path;
use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HWND, RECT};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
    GetWindowThreadProcessId, MonitorFromWindow, MONITOR_DEFAULTTONEAREST,
};

fn window_text(hwnd: HWND) -> String {
    let length = unsafe { GetWindowTextLengthW(hwnd) }.max(0) as usize;
    let mut buffer = vec![0_u16; length.saturating_add(1).max(1)];
    let count = unsafe { GetWindowTextW(hwnd, &mut buffer) }.max(0) as usize;
    String::from_utf16_lossy(&buffer[..count])
}

fn executable_name(process_id: u32) -> String {
    let Ok(handle) = (unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) })
    else {
        return format!("Process {process_id}");
    };
    let mut path = vec![0_u16; 32_768];
    let mut length = path.len() as u32;
    let result = unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(path.as_mut_ptr()),
            &mut length,
        )
    };
    let _ = unsafe { CloseHandle(handle) };
    if result.is_err() || length == 0 {
        return format!("Process {process_id}");
    }
    let full_path = String::from_utf16_lossy(&path[..length as usize]);
    Path::new(&full_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(&full_path)
        .to_string()
}

pub fn get_active_window() -> ActiveWindow {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0 == 0 {
        return ActiveWindow::unavailable("Windows did not report a foreground window.");
    }
    let mut process_id = 0_u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut process_id)) };
    let mut rect = RECT::default();
    let bounds = unsafe { GetWindowRect(hwnd, &mut rect) }
        .ok()
        .map(|_| WindowBounds {
            x: rect.left as f64,
            y: rect.top as f64,
            width: (rect.right - rect.left).max(0) as f64,
            height: (rect.bottom - rect.top).max(0) as f64,
        });
    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    let application_name = executable_name(process_id);
    ActiveWindow {
        available: bounds.is_some(),
        reason: bounds
            .is_none()
            .then(|| "Windows could not read the foreground-window bounds.".to_string()),
        bundle_id: format!("windows:pid:{process_id}"),
        application_name,
        window_title: window_text(hwnd),
        process_id,
        bounds,
        display_id: format!("monitor:{:X}", monitor.0 as usize),
        is_assistant_window: process_id == std::process::id(),
    }
}

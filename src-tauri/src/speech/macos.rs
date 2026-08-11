use super::{NativeSpeechCapability, NativeSpeechEvent};
use std::ffi::{c_char, c_int, CStr};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

type NativeSpeechCallback = extern "C" fn(kind: c_int, text: *const c_char);

unsafe extern "C" {
    fn aster_native_speech_is_available() -> c_int;
    fn aster_native_speech_set_callback(callback: Option<NativeSpeechCallback>);
    fn aster_native_speech_start() -> c_int;
    fn aster_native_speech_stop();
}

static APP_HANDLE: OnceLock<Mutex<Option<AppHandle>>> = OnceLock::new();

fn app_handle_slot() -> &'static Mutex<Option<AppHandle>> {
    APP_HANDLE.get_or_init(|| Mutex::new(None))
}

fn event_kind(kind: c_int) -> &'static str {
    match kind {
        1 => "partial",
        2 => "final",
        3 => "error",
        _ => "status",
    }
}

extern "C" fn on_native_speech_event(kind: c_int, text: *const c_char) {
    let text = if text.is_null() {
        String::new()
    } else {
        // The Objective-C helper invokes this callback synchronously and the
        // native string remains valid for the duration of the callback.
        unsafe { CStr::from_ptr(text) }.to_string_lossy().into_owned()
    };
    if let Ok(handle) = app_handle_slot().lock() {
        if let Some(app) = handle.as_ref() {
            let _ = app.emit("aster://native-speech", NativeSpeechEvent {
                kind: event_kind(kind).into(),
                text,
            });
        }
    }
}

pub fn capability() -> NativeSpeechCapability {
    let supported = unsafe { aster_native_speech_is_available() != 0 };
    NativeSpeechCapability {
        supported,
        provider: "native".into(),
        message: if supported {
            "Native macOS speech recognition is available. Aster will request Microphone and Speech Recognition permission when you start listening.".into()
        } else {
            "Native macOS speech recognition requires macOS 10.15 or later.".into()
        },
    }
}

pub fn start(app: AppHandle) -> Result<(), String> {
    if !capability().supported {
        return Err(capability().message);
    }
    *app_handle_slot()
        .lock()
        .map_err(|_| "Native speech state is unavailable.".to_string())? = Some(app);
    unsafe {
        aster_native_speech_set_callback(Some(on_native_speech_event));
        if aster_native_speech_start() == 0 {
            return Err("Native macOS speech recognition could not start.".to_string());
        }
    }
    Ok(())
}

pub fn stop() -> Result<(), String> {
    unsafe { aster_native_speech_stop() };
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::event_kind;

    #[test]
    fn maps_native_callback_kinds_without_claiming_success() {
        assert_eq!(event_kind(1), "partial");
        assert_eq!(event_kind(2), "final");
        assert_eq!(event_kind(3), "error");
    }
}

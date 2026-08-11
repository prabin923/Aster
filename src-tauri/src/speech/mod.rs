#[cfg(target_os = "macos")]
mod macos;

use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSpeechCapability {
    pub supported: bool,
    pub provider: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSpeechEvent {
    pub kind: String,
    pub text: String,
}

#[cfg(target_os = "macos")]
pub fn capability() -> NativeSpeechCapability {
    macos::capability()
}

#[cfg(not(target_os = "macos"))]
pub fn capability() -> NativeSpeechCapability {
    NativeSpeechCapability {
        supported: false,
        provider: "native".into(),
        message: "Native speech recognition is currently available on macOS only. Select Browser or Mock on this system.".into(),
    }
}

#[cfg(target_os = "macos")]
pub fn start(app: AppHandle) -> Result<(), String> {
    macos::start(app)
}

#[cfg(not(target_os = "macos"))]
pub fn start(_app: AppHandle) -> Result<(), String> {
    Err(capability().message)
}

#[cfg(target_os = "macos")]
pub fn stop() -> Result<(), String> {
    macos::stop()
}

#[cfg(not(target_os = "macos"))]
pub fn stop() -> Result<(), String> {
    Ok(())
}

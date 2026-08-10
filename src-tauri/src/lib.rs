mod capture_exclusion;
mod models;
mod providers;
mod security;
mod store;

use capture_exclusion::{CaptureCapability, LocalCaptureTest};
use models::{AiStreamEvent, AppSettings, GenerationRequest, ProviderStatus};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State};

struct AppState {
    settings: Mutex<AppSettings>,
    capture_capability: Mutex<CaptureCapability>,
    cancelled: Arc<Mutex<HashSet<String>>>,
    recent_requests: Mutex<HashMap<String, Instant>>,
}

fn apply_window_settings(app: &AppHandle, settings: &AppSettings) -> CaptureCapability {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(settings.general.always_on_top);
        apply_window_position(&window, &settings.general.position);
        return capture_exclusion::set_capture_exclusion(&window, settings.general.screen_share_exclusion);
    }
    CaptureCapability {
        supported: false,
        mode: capture_exclusion::CaptureMode::Unsupported,
        enabled: false,
        platform: std::env::consts::OS.to_string(),
        message: "Capture exclusion is not supported because the native overlay window is unavailable.".to_string(),
    }
}

fn apply_window_position(window: &tauri::WebviewWindow, position: &str) {
    let monitor = window.current_monitor().ok().flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let (Some(monitor), Ok(size)) = (monitor, window.outer_size()) else { return };
    let area = monitor.work_area();
    let margin = 20_i32;
    let right = area.position.x + area.size.width.saturating_sub(size.width) as i32 - margin;
    let bottom = area.position.y + area.size.height.saturating_sub(size.height) as i32 - margin;
    let (x, y) = match position {
        "top-left" => (area.position.x + margin, area.position.y + margin),
        "bottom-left" => (area.position.x + margin, bottom),
        "bottom-right" => (right, bottom),
        "center" => (
            area.position.x + (area.size.width.saturating_sub(size.width) / 2) as i32,
            area.position.y + (area.size.height.saturating_sub(size.height) / 2) as i32,
        ),
        _ => (right, area.position.y + margin),
    };
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> AppSettings {
    state.settings.lock().map(|settings| settings.clone()).unwrap_or_default()
}

#[tauri::command]
fn save_settings(app: AppHandle, state: State<'_, AppState>, mut settings: AppSettings) -> Result<AppSettings, String> {
    settings.general.overlay_opacity = settings.general.overlay_opacity.clamp(0.55, 1.0);
    settings.ai.temperature = settings.ai.temperature.clamp(0.0, 1.0);
    settings.ai.max_output = settings.ai.max_output.clamp(64, 2_048);
    if !capture_exclusion::default_enabled() {
        settings.general.screen_share_exclusion = false;
    }
    if settings.ai.provider == "gemini" && settings.ai.model.trim().is_empty() {
        settings.ai.model = "gemini-3.6-flash".to_string();
    }
    let capture_capability = apply_window_settings(&app, &settings);
    store::save_settings(&app, &settings)?;
    *state.settings.lock().map_err(|_| "Settings state is unavailable.".to_string())? = settings.clone();
    *state.capture_capability.lock().map_err(|_| "Capture-exclusion state is unavailable.".to_string())? = capture_capability;
    Ok(settings)
}

#[tauri::command]
fn save_provider_key(provider: String, api_key: String) -> Result<(), String> {
    if !matches!(provider.as_str(), "openai" | "gemini" | "claude") {
        return Err("This provider does not use a cloud API key.".to_string());
    }
    security::store_provider_key(&provider, &api_key)
}

#[tauri::command]
fn delete_provider_key(provider: String) -> Result<(), String> {
    security::delete_provider_key(&provider)
}

#[tauri::command]
fn provider_status(state: State<'_, AppState>) -> ProviderStatus {
    let settings = state.settings.lock().map(|settings| settings.clone()).unwrap_or_default();
    let provider = settings.ai.provider;
    if provider == "mock" {
        return ProviderStatus { provider, configured: true, connected: true, message: "Local mock provider ready".into() };
    }
    match security::get_provider_key(&provider) {
        Ok(Some(_)) => ProviderStatus { provider, configured: true, connected: false, message: "API key is stored securely".into() },
        Ok(None) => ProviderStatus { provider, configured: false, connected: false, message: "Add an API key in Settings".into() },
        Err(_) => ProviderStatus { provider, configured: false, connected: false, message: "Secure credential storage is unavailable".into() },
    }
}

#[tauri::command]
async fn health_check(state: State<'_, AppState>) -> Result<ProviderStatus, String> {
    let settings = state.settings.lock().map(|settings| settings.clone()).unwrap_or_default();
    let provider = settings.ai.provider;
    if provider == "mock" {
        return Ok(ProviderStatus { provider, configured: true, connected: true, message: "Local mock provider ready".into() });
    }
    let key = match security::get_provider_key(&provider) {
        Ok(Some(key)) => key,
        Ok(None) => return Ok(ProviderStatus { provider, configured: false, connected: false, message: "Add an API key in Settings".into() }),
        Err(_) => return Ok(ProviderStatus { provider, configured: false, connected: false, message: "Secure credential storage is unavailable".into() }),
    };
    match providers::health_check(&provider, Some(key)).await {
        Ok(()) => {
            let message = format!("{provider} connection verified");
            Ok(ProviderStatus { provider, configured: true, connected: true, message })
        }
        Err(message) => Ok(ProviderStatus { provider, configured: true, connected: false, message }),
    }
}

#[tauri::command]
fn get_capture_capability(state: State<'_, AppState>) -> CaptureCapability {
    state.capture_capability.lock().map(|capability| capability.clone()).unwrap_or(CaptureCapability {
        supported: false,
        mode: capture_exclusion::CaptureMode::Unsupported,
        enabled: false,
        platform: std::env::consts::OS.to_string(),
        message: "Capture exclusion is not supported because its status is unavailable.".to_string(),
    })
}

#[tauri::command]
fn is_capture_exclusion_supported() -> bool {
    capture_exclusion::is_capture_exclusion_supported()
}

#[tauri::command]
fn set_capture_exclusion(app: AppHandle, state: State<'_, AppState>, enabled: bool) -> Result<CaptureCapability, String> {
    let window = app.get_webview_window("main").ok_or_else(|| "Overlay window is unavailable.".to_string())?;
    let capability = capture_exclusion::set_capture_exclusion(&window, enabled);
    let mut settings = state.settings.lock().map_err(|_| "Settings state is unavailable.".to_string())?;
    settings.general.screen_share_exclusion = capability.enabled;
    store::save_settings(&app, &settings)?;
    *state.capture_capability.lock().map_err(|_| "Capture-exclusion state is unavailable.".to_string())? = capability.clone();
    Ok(capability)
}

#[tauri::command]
fn run_local_capture_test(app: AppHandle, state: State<'_, AppState>) -> LocalCaptureTest {
    let window = app.get_webview_window("main");
    let capability = state.capture_capability.lock().map(|capability| capability.clone())
        .unwrap_or_else(|_| capture_exclusion::get_capture_capability(window.as_ref()));
    capture_exclusion::run_local_capture_test(window.as_ref(), capability)
}

#[tauri::command]
fn toggle_overlay(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or_else(|| "Overlay window is unavailable.".to_string())?;
    if window.is_visible().map_err(|_| "Unable to read overlay visibility.".to_string())? {
        window.hide().map_err(|_| "Unable to hide overlay.".to_string())?;
    } else {
        window.show().map_err(|_| "Unable to show overlay.".to_string())?;
        window.set_focus().map_err(|_| "Unable to focus overlay.".to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn start_generation(app: AppHandle, state: State<'_, AppState>, request: GenerationRequest) -> Result<(), String> {
    if request.context.current_question.trim().is_empty() {
        return Err("Add a question before requesting an answer.".to_string());
    }
    let settings = state.settings.lock().map(|settings| settings.clone()).map_err(|_| "Settings state is unavailable.".to_string())?;
    let now = Instant::now();
    {
        let mut recent = state.recent_requests.lock().map_err(|_| "Request limiter is unavailable.".to_string())?;
        if let Some(previous) = recent.get(&settings.ai.provider) {
            if now.duration_since(*previous) < Duration::from_millis(300) {
                return Err("Please wait a moment before sending another request.".to_string());
            }
        }
        recent.insert(settings.ai.provider.clone(), now);
    }
    let api_key = if settings.ai.provider == "mock" { None } else { security::get_provider_key(&settings.ai.provider)? };
    let request_id = request.request_id.clone();
    let cancelled = state.cancelled.clone();
    let context = security::sanitize_context(&request.context);
    tauri::async_runtime::spawn(async move {
        let result = providers::stream_response(app.clone(), request_id.clone(), settings.ai, context, api_key, cancelled).await;
        if let Err(error) = result {
            let _ = app.emit("aster://ai-stream", AiStreamEvent { request_id, delta: String::new(), done: true, error: Some(error) });
        }
    });
    Ok(())
}

#[tauri::command]
fn cancel_generation(state: State<'_, AppState>, request_id: String) {
    if let Ok(mut cancelled) = state.cancelled.lock() {
        cancelled.insert(request_id);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::default().build())
        .setup(|app| {
            let settings = store::load_settings(&app.handle());
            let capture_capability = apply_window_settings(&app.handle(), &settings);
            app.manage(AppState {
                settings: Mutex::new(settings),
                capture_capability: Mutex::new(capture_capability),
                cancelled: Arc::new(Mutex::new(HashSet::new())),
                recent_requests: Mutex::new(HashMap::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            save_provider_key,
            delete_provider_key,
            provider_status,
            health_check,
            get_capture_capability,
            is_capture_exclusion_supported,
            set_capture_exclusion,
            run_local_capture_test,
            toggle_overlay,
            start_generation,
            cancel_generation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

mod capture_policy;
mod models;
mod providers;
mod security;
mod speech;
mod store;

use capture_policy::{CaptureCapability, CapturePrivacyTest, CaptureStatus};
use models::{AiStreamEvent, AppSettings, GenerationRequest, ProviderStatus};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, State};

const EXPANDED_MIN_WIDTH: u32 = 390;
const EXPANDED_MIN_HEIGHT: u32 = 520;
const COLLAPSED_MIN_WIDTH: u32 = 280;
const COLLAPSED_HEIGHT: u32 = 64;

#[derive(Default)]
struct OverlayWindowState {
    collapsed: bool,
    expanded_size: Option<PhysicalSize<u32>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OverlayCollapseStatus {
    collapsed: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OverlayDisplayMove {
    moved: bool,
    display: String,
}

struct AppState {
    settings: Mutex<AppSettings>,
    capture_status: Mutex<CaptureStatus>,
    overlay_window: Mutex<OverlayWindowState>,
    session_provider_keys: Mutex<HashMap<String, String>>,
    cancelled: Arc<Mutex<HashSet<String>>>,
    recent_requests: Mutex<HashMap<String, Instant>>,
}

fn session_provider_key(state: &AppState, provider: &str) -> Result<Option<String>, String> {
    state
        .session_provider_keys
        .lock()
        .map_err(|_| "Session credential state is unavailable.".to_string())
        .map(|keys| keys.get(provider).cloned())
}

fn effective_provider_key(state: &AppState, provider: &str) -> Result<(Option<String>, &'static str), String> {
    if let Some(key) = session_provider_key(state, provider)? {
        return Ok((Some(key), "session"));
    }
    Ok((security::get_provider_key(provider)?, "secure"))
}

fn apply_window_settings(app: &AppHandle, settings: &AppSettings) -> CaptureStatus {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(settings.general.always_on_top);
        capture_policy::setup_window_behavior(&window);
        apply_window_position(&window, &settings.general.position);
        return capture_policy::capture_status(capture_policy::set_capture_exclusion(&window, settings.general.screen_share_exclusion));
    }
    capture_policy::capture_status(CaptureCapability {
        supported: false,
        mode: capture_policy::CaptureMode::Unsupported,
        enabled: false,
        platform: std::env::consts::OS.to_string(),
        message: "Capture exclusion is not supported because the native overlay window is unavailable.".to_string(),
    })
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
    if !capture_policy::default_enabled() {
        settings.general.screen_share_exclusion = false;
    }
    if settings.ai.provider == "gemini" && settings.ai.model.trim().is_empty() {
        settings.ai.model = "gemini-3.6-flash".to_string();
    }
    let capture_status = apply_window_settings(&app, &settings);
    store::save_settings(&app, &settings)?;
    *state.settings.lock().map_err(|_| "Settings state is unavailable.".to_string())? = settings.clone();
    *state.capture_status.lock().map_err(|_| "Capture-policy state is unavailable.".to_string())? = capture_status;
    Ok(settings)
}

#[tauri::command]
fn save_provider_key(state: State<'_, AppState>, provider: String, api_key: String) -> Result<ProviderStatus, String> {
    if !matches!(provider.as_str(), "openai" | "gemini" | "claude") {
        return Err("This provider does not use a cloud API key.".to_string());
    }
    let key = api_key.trim();
    if key.is_empty() {
        return Err("API key cannot be empty.".to_string());
    }
    let retained_securely = matches!(security::store_provider_key(&provider, key), Ok(()))
        && matches!(security::get_provider_key(&provider), Ok(Some(_)));
    if retained_securely {
        state.session_provider_keys.lock()
            .map_err(|_| "Session credential state is unavailable.".to_string())?
            .remove(&provider);
        return Ok(ProviderStatus {
            provider,
            configured: true,
            connected: false,
            credential_storage: "secure".into(),
            message: "API key was stored and verified in native secure storage.".into(),
        });
    }
    // A successful legacy Keychain write can still be unreadable immediately
    // afterwards. In either failure mode, retain the credential only in the
    // Rust process so cloud requests can proceed without writing a fallback
    // secret to disk.
    state.session_provider_keys.lock()
        .map_err(|_| "Session credential state is unavailable.".to_string())?
        .insert(provider.clone(), key.to_string());
    Ok(ProviderStatus {
        provider,
        configured: true,
        connected: false,
        credential_storage: "session".into(),
        message: "macOS Keychain is unavailable. The API key is available only for this Aster session and will be discarded when the app closes.".into(),
    })
}

#[tauri::command]
fn delete_provider_key(state: State<'_, AppState>, provider: String) -> Result<(), String> {
    let removed_session_key = state.session_provider_keys.lock()
        .map_err(|_| "Session credential state is unavailable.".to_string())?
        .remove(&provider)
        .is_some();
    match security::delete_provider_key(&provider) {
        Ok(()) => Ok(()),
        Err(_) if removed_session_key => Ok(()),
        Err(error) => Err(error),
    }
}

#[tauri::command]
fn provider_status(state: State<'_, AppState>) -> ProviderStatus {
    let settings = state.settings.lock().map(|settings| settings.clone()).unwrap_or_default();
    let provider = settings.ai.provider;
    if provider == "mock" {
        return ProviderStatus { provider, configured: true, connected: true, credential_storage: "none".into(), message: "Local mock provider ready".into() };
    }
    match effective_provider_key(&state, &provider) {
        Ok((Some(_), "session")) => ProviderStatus { provider, configured: true, connected: false, credential_storage: "session".into(), message: "API key is available only for this Aster session.".into() },
        Ok((Some(_), _)) => ProviderStatus { provider, configured: true, connected: false, credential_storage: "secure".into(), message: "API key is stored securely".into() },
        Ok((None, _)) => ProviderStatus { provider, configured: false, connected: false, credential_storage: "none".into(), message: "Add an API key in Settings".into() },
        Err(_) => ProviderStatus { provider, configured: false, connected: false, credential_storage: "none".into(), message: "Secure credential storage is unavailable".into() },
    }
}

#[tauri::command]
async fn health_check(state: State<'_, AppState>) -> Result<ProviderStatus, String> {
    let settings = state.settings.lock().map(|settings| settings.clone()).unwrap_or_default();
    let provider = settings.ai.provider;
    if provider == "mock" {
        return Ok(ProviderStatus { provider, configured: true, connected: true, credential_storage: "none".into(), message: "Local mock provider ready".into() });
    }
    let (key, storage) = match effective_provider_key(&state, &provider) {
        Ok((Some(key), storage)) => (key, storage),
        Ok((None, _)) => return Ok(ProviderStatus { provider, configured: false, connected: false, credential_storage: "none".into(), message: "Add an API key in Settings".into() }),
        Err(_) => return Ok(ProviderStatus { provider, configured: false, connected: false, credential_storage: "none".into(), message: "Secure credential storage is unavailable".into() }),
    };
    match providers::health_check(&provider, Some(key)).await {
        Ok(()) => {
            let message = format!("{provider} connection verified");
            Ok(ProviderStatus { provider, configured: true, connected: true, credential_storage: storage.into(), message })
        }
        Err(message) => Ok(ProviderStatus { provider, configured: true, connected: false, credential_storage: storage.into(), message }),
    }
}

#[tauri::command]
fn get_capture_capability(state: State<'_, AppState>) -> CaptureCapability {
    state.capture_status.lock().map(|status| status.capability.clone()).unwrap_or(CaptureCapability {
        supported: false,
        mode: capture_policy::CaptureMode::Unsupported,
        enabled: false,
        platform: std::env::consts::OS.to_string(),
        message: "Capture exclusion is not supported because its status is unavailable.".to_string(),
    })
}

#[tauri::command]
fn get_capture_status(state: State<'_, AppState>) -> CaptureStatus {
    state.capture_status.lock().map(|status| status.clone()).unwrap_or_else(|_| capture_policy::capture_status(CaptureCapability {
        supported: false,
        mode: capture_policy::CaptureMode::Unsupported,
        enabled: false,
        platform: std::env::consts::OS.to_string(),
        message: "Capture exclusion is not supported because its status is unavailable.".to_string(),
    }))
}

#[tauri::command]
fn is_capture_exclusion_supported() -> bool {
    capture_policy::is_capture_exclusion_supported()
}

#[tauri::command]
fn get_native_speech_capability() -> speech::NativeSpeechCapability {
    speech::capability()
}

#[tauri::command]
fn start_native_speech(app: AppHandle) -> Result<(), String> {
    speech::start(app)
}

#[tauri::command]
fn stop_native_speech() -> Result<(), String> {
    speech::stop()
}

#[tauri::command]
fn set_capture_exclusion(app: AppHandle, state: State<'_, AppState>, enabled: bool) -> Result<CaptureCapability, String> {
    let window = app.get_webview_window("main").ok_or_else(|| "Overlay window is unavailable.".to_string())?;
    let capability = capture_policy::set_capture_exclusion(&window, enabled);
    let mut settings = state.settings.lock().map_err(|_| "Settings state is unavailable.".to_string())?;
    settings.general.screen_share_exclusion = capability.enabled;
    store::save_settings(&app, &settings)?;
    *state.capture_status.lock().map_err(|_| "Capture-policy state is unavailable.".to_string())? = capture_policy::capture_status(capability.clone());
    Ok(capability)
}

#[tauri::command]
async fn run_capture_privacy_test(app: AppHandle, state: State<'_, AppState>) -> Result<CapturePrivacyTest, String> {
    let window = app.get_webview_window("main").ok_or_else(|| "Overlay window is unavailable.".to_string())?;
    let capability = state.capture_status.lock()
        .map(|status| status.capability.clone())
        .unwrap_or_else(|_| capture_policy::get_capture_capability(Some(&window)));
    let test_window = window.clone();
    let test = tauri::async_runtime::spawn_blocking(move || capture_policy::run_capture_privacy_test(Some(&test_window), capability))
        .await
        .map_err(|_| "Capture Privacy Test did not complete.".to_string())?;
    let status = CaptureStatus { capability: test.capture_capability.clone(), app_owned_stream: test.app_owned_stream.clone() };
    *state.capture_status.lock().map_err(|_| "Capture-policy state is unavailable.".to_string())? = status;
    Ok(test)
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
fn start_window_drag(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or_else(|| "Overlay window is unavailable.".to_string())?;
    window.start_dragging().map_err(|_| "Aster could not start dragging.".to_string())
}

#[tauri::command]
fn minimize_overlay_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or_else(|| "Overlay window is unavailable.".to_string())?;
    window.minimize().map_err(|_| "Aster could not minimize.".to_string())
}

#[tauri::command]
fn close_overlay_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or_else(|| "Overlay window is unavailable.".to_string())?;
    window.close().map_err(|_| "Aster could not close.".to_string())
}

#[tauri::command]
fn toggle_overlay_collapse(app: AppHandle, state: State<'_, AppState>) -> Result<OverlayCollapseStatus, String> {
    let window = app.get_webview_window("main").ok_or_else(|| "Overlay window is unavailable.".to_string())?;
    let mut overlay = state.overlay_window.lock().map_err(|_| "Overlay window state is unavailable.".to_string())?;
    if overlay.collapsed {
        let size = overlay.expanded_size.take().unwrap_or(PhysicalSize::new(440, 720));
        window.set_min_size(Some(PhysicalSize::new(EXPANDED_MIN_WIDTH, EXPANDED_MIN_HEIGHT)))
            .map_err(|_| "Unable to restore Aster's minimum window size.".to_string())?;
        window.set_resizable(true).map_err(|_| "Unable to make Aster resizable.".to_string())?;
        window.set_size(PhysicalSize::new(size.width.max(EXPANDED_MIN_WIDTH), size.height.max(EXPANDED_MIN_HEIGHT)))
            .map_err(|_| "Unable to expand Aster.".to_string())?;
        overlay.collapsed = false;
    } else {
        let size = window.outer_size().map_err(|_| "Unable to read Aster's current size.".to_string())?;
        overlay.expanded_size = Some(size);
        window.set_min_size(Some(PhysicalSize::new(COLLAPSED_MIN_WIDTH, COLLAPSED_HEIGHT)))
            .map_err(|_| "Unable to set Aster's collapsed size.".to_string())?;
        window.set_size(PhysicalSize::new(size.width.max(COLLAPSED_MIN_WIDTH), COLLAPSED_HEIGHT))
            .map_err(|_| "Unable to collapse Aster.".to_string())?;
        window.set_resizable(false).map_err(|_| "Unable to compact Aster.".to_string())?;
        overlay.collapsed = true;
    }
    Ok(OverlayCollapseStatus { collapsed: overlay.collapsed })
}

fn monitors_match(left: &Monitor, right: &Monitor) -> bool {
    let left_area = left.work_area();
    let right_area = right.work_area();
    left_area.position == right_area.position && left_area.size == right_area.size
}

fn move_window_to_monitor(window: &tauri::WebviewWindow, source: &Monitor, target: &Monitor) -> Result<(), String> {
    let position = window.outer_position().map_err(|_| "Unable to read Aster's position.".to_string())?;
    let size = window.outer_size().map_err(|_| "Unable to read Aster's size.".to_string())?;
    let source_area = source.work_area();
    let target_area = target.work_area();
    let source_x_span = source_area.size.width.saturating_sub(size.width) as i32;
    let source_y_span = source_area.size.height.saturating_sub(size.height) as i32;
    let target_x_span = target_area.size.width.saturating_sub(size.width) as i32;
    let target_y_span = target_area.size.height.saturating_sub(size.height) as i32;
    let source_x_offset = (position.x - source_area.position.x).clamp(0, source_x_span.max(0));
    let source_y_offset = (position.y - source_area.position.y).clamp(0, source_y_span.max(0));
    let x_ratio = if source_x_span > 0 { source_x_offset as f64 / source_x_span as f64 } else { 0.0 };
    let y_ratio = if source_y_span > 0 { source_y_offset as f64 / source_y_span as f64 } else { 0.0 };
    let target_x = target_area.position.x + (x_ratio * target_x_span.max(0) as f64).round() as i32;
    let target_y = target_area.position.y + (y_ratio * target_y_span.max(0) as f64).round() as i32;
    window.set_position(PhysicalPosition::new(target_x, target_y))
        .map_err(|_| "Unable to move Aster to another display.".to_string())
}

#[tauri::command]
fn move_overlay_to_next_display(app: AppHandle) -> Result<OverlayDisplayMove, String> {
    let window = app.get_webview_window("main").ok_or_else(|| "Overlay window is unavailable.".to_string())?;
    let monitors = window.available_monitors().map_err(|_| "Unable to read connected displays.".to_string())?;
    if monitors.len() < 2 {
        return Ok(OverlayDisplayMove { moved: false, display: "Only one display is connected.".into() });
    }
    let current = window.current_monitor().ok().flatten().unwrap_or_else(|| monitors[0].clone());
    let current_index = monitors.iter().position(|monitor| monitors_match(monitor, &current)).unwrap_or(0);
    let target = &monitors[(current_index + 1) % monitors.len()];
    move_window_to_monitor(&window, &current, target)?;
    Ok(OverlayDisplayMove {
        moved: true,
        display: target.name().cloned().unwrap_or_else(|| "Next display".into()),
    })
}

#[tauri::command]
fn follow_overlay_cursor_display(app: AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main").ok_or_else(|| "Overlay window is unavailable.".to_string())?;
    if !window.is_visible().map_err(|_| "Unable to read Aster's visibility.".to_string())? {
        return Ok(false);
    }
    Ok(capture_policy::follow_cursor_to_screen(&window))
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
    let api_key = if settings.ai.provider == "mock" { None } else { effective_provider_key(&state, &settings.ai.provider)?.0 };
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
            let capture_status = apply_window_settings(&app.handle(), &settings);
            app.manage(AppState {
                settings: Mutex::new(settings),
                capture_status: Mutex::new(capture_status),
                overlay_window: Mutex::new(OverlayWindowState::default()),
                session_provider_keys: Mutex::new(HashMap::new()),
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
            get_capture_status,
            is_capture_exclusion_supported,
            get_native_speech_capability,
            start_native_speech,
            stop_native_speech,
            set_capture_exclusion,
            run_capture_privacy_test,
            toggle_overlay,
            toggle_overlay_collapse,
            move_overlay_to_next_display,
            follow_overlay_cursor_display,
            start_window_drag,
            minimize_overlay_window,
            close_overlay_window,
            start_generation,
            cancel_generation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod overlay_window_tests {
    use super::{COLLAPSED_HEIGHT, COLLAPSED_MIN_WIDTH, EXPANDED_MIN_HEIGHT, EXPANDED_MIN_WIDTH};

    #[test]
    fn compact_window_dimensions_preserve_a_usable_drag_handle() {
        assert!(COLLAPSED_HEIGHT >= 60);
        assert!(COLLAPSED_MIN_WIDTH < EXPANDED_MIN_WIDTH);
        assert!(COLLAPSED_HEIGHT < EXPANDED_MIN_HEIGHT);
    }
}

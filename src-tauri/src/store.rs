use crate::models::AppSettings;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|_| "Unable to access the application settings directory.".to_string())?;
    fs::create_dir_all(&directory).map_err(|_| "Unable to create the application settings directory.".to_string())?;
    Ok(directory.join("settings.json"))
}

pub fn load_settings(app: &AppHandle) -> AppSettings {
    let Ok(path) = settings_path(app) else {
        return AppSettings::default();
    };
    fs::read_to_string(path)
        .ok()
        .and_then(|contents| serde_json::from_str::<Value>(&contents).ok())
        .map(migrate_settings)
        .and_then(|contents| serde_json::from_value(contents).ok())
        .unwrap_or_default()
}

fn migrate_settings(mut value: Value) -> Value {
    let Some(general) = value.get_mut("general").and_then(Value::as_object_mut) else { return value };
    if !general.contains_key("screenShareExclusion") {
        let requested_exclusion = general.remove("includeOverlayInScreenShare")
            .and_then(|include| include.as_bool().map(|value| !value))
            .unwrap_or_else(crate::capture_exclusion::default_enabled);
        let exclusion = requested_exclusion && crate::capture_exclusion::default_enabled();
        general.insert("screenShareExclusion".to_string(), Value::Bool(exclusion));
    }
    value
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let contents = serde_json::to_string_pretty(settings).map_err(|_| "Unable to serialize settings.".to_string())?;
    fs::write(path, contents).map_err(|_| "Unable to save settings.".to_string())
}

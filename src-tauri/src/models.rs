use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub general: GeneralSettings,
    pub audio: AudioSettings,
    pub screen: ScreenSettings,
    pub ai: AiSettings,
    pub privacy: PrivacySettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            general: GeneralSettings {
                theme: "dark".into(),
                overlay_opacity: 0.98,
                always_on_top: true,
                position: "top-right".into(),
                shortcut: "CommandOrControl+Space".into(),
                screen_share_exclusion: crate::capture_policy::default_enabled(),
            },
            audio: AudioSettings {
                input_device: "default".into(),
                stt_provider: "mock".into(),
                auto_listening: false,
                retain_transcript: false,
            },
            screen: ScreenSettings {
                enabled: false,
                capture_behavior: "on-demand".into(),
                ocr_enabled: true,
                retain_context: false,
            },
            ai: AiSettings {
                provider: "mock".into(),
                model: "aster-mock-stream".into(),
                temperature: 0.35,
                max_output: 500,
                streaming: true,
            },
            privacy: PrivacySettings {
                conversation_history: false,
                telemetry: false,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    pub theme: String,
    pub overlay_opacity: f64,
    pub always_on_top: bool,
    pub position: String,
    pub shortcut: String,
    pub screen_share_exclusion: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSettings {
    pub input_device: String,
    pub stt_provider: String,
    pub auto_listening: bool,
    pub retain_transcript: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenSettings {
    pub enabled: bool,
    pub capture_behavior: String,
    pub ocr_enabled: bool,
    pub retain_context: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub provider: String,
    pub model: String,
    pub temperature: f32,
    pub max_output: u32,
    pub streaming: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacySettings {
    pub conversation_history: bool,
    pub telemetry: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StructuredContext {
    pub current_question: String,
    pub recent_transcript: Vec<String>,
    pub conversation_summary: String,
    pub screen_context: ScreenContext,
    pub task_context: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScreenContext {
    pub application: String,
    pub window_title: String,
    pub visible_text: String,
    pub detected_topics: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationRequest {
    pub request_id: String,
    pub context: StructuredContext,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamEvent {
    pub request_id: String,
    pub delta: String,
    pub done: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub provider: String,
    pub configured: bool,
    pub connected: bool,
    pub credential_storage: String,
    pub message: String,
}

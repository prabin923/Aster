use crate::models::{ScreenContext, StructuredContext};
use keyring::Entry;
use regex::Regex;

const KEYRING_SERVICE: &str = "com.aster.native-realtime-assistant";

fn storage_error(action: &str, error: impl std::fmt::Display) -> String {
    #[cfg(target_os = "macos")]
    {
        format!(
            "macOS Keychain could not {action}: {error}. Open Keychain Access, unlock the login keychain, then retry. Aster will not save API keys outside secure storage."
        )
    }
    #[cfg(not(target_os = "macos"))]
    {
        format!("Secure credential storage could not {action}: {error}.")
    }
}

fn entry(provider: &str) -> Result<Entry, String> {
    let account = format!("provider:{}", provider.trim().to_ascii_lowercase());
    Entry::new(KEYRING_SERVICE, &account)
        .map_err(|error| storage_error("initialize", error))
}

pub fn store_provider_key(provider: &str, value: &str) -> Result<(), String> {
    let key = value.trim();
    if key.is_empty() {
        return Err("API key cannot be empty.".to_string());
    }
    entry(provider)?
        .set_password(key)
        .map_err(|error| storage_error("save this API key", error))
}

pub fn get_provider_key(provider: &str) -> Result<Option<String>, String> {
    match entry(provider)?.get_password() {
        Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
        Ok(_) => Ok(None),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(storage_error("read this API key", error)),
    }
}

pub fn delete_provider_key(provider: &str) -> Result<(), String> {
    match entry(provider)?.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(storage_error("remove this API key", error)),
    }
}

pub fn redact_text(value: &str) -> String {
    let patterns = [
        r#"(?i)(api[_-]?key|token|password|secret)\s*[:=]\s*['\"]?[^\s,'\";]+"#,
        r"\b(?:sk|rk|AIza)[A-Za-z0-9_\-]{16,}\b",
        r"-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----",
        r"(?i)authorization:\s*bearer\s+[A-Za-z0-9._\-]+",
    ];
    patterns.iter().fold(value.to_string(), |acc, pattern| {
        Regex::new(pattern)
            .map(|regex| regex.replace_all(&acc, "[REDACTED]").to_string())
            .unwrap_or(acc)
    })
}

pub fn sanitize_context(context: &StructuredContext) -> StructuredContext {
    StructuredContext {
        current_question: redact_text(&context.current_question),
        recent_transcript: context.recent_transcript.iter().map(|item| redact_text(item)).collect(),
        conversation_summary: redact_text(&context.conversation_summary),
        screen_context: ScreenContext {
            application: redact_text(&context.screen_context.application),
            window_title: redact_text(&context.screen_context.window_title),
            visible_text: redact_text(&context.screen_context.visible_text),
            detected_topics: context.screen_context.detected_topics.iter().map(|item| redact_text(item)).collect(),
        },
        task_context: redact_text(&context.task_context),
    }
}

#[cfg(test)]
mod tests {
    use super::{redact_text, sanitize_context, storage_error};
    use crate::models::{ScreenContext, StructuredContext};

    #[test]
    fn redacts_sensitive_values_before_a_provider_request() {
        let value = "api_key=super-secret-value-123456789 Authorization: Bearer abc.def.ghi";
        assert!(!redact_text(value).contains("super-secret"));
        assert!(!redact_text(value).contains("abc.def.ghi"));
    }

    #[test]
    fn sanitizes_all_structured_context_fields() {
        let context = StructuredContext {
            current_question: "password: do-not-send".into(),
            recent_transcript: vec!["token=private-value".into()],
            conversation_summary: String::new(),
            screen_context: ScreenContext { visible_text: "AIzaThisIsAnExampleSecretValue123456".into(), ..Default::default() },
            task_context: String::new(),
        };
        let safe = sanitize_context(&context);
        assert_eq!(safe.current_question, "[REDACTED]");
        assert_eq!(safe.recent_transcript[0], "[REDACTED]");
        assert_eq!(safe.screen_context.visible_text, "[REDACTED]");
    }

    #[test]
    fn secure_storage_errors_do_not_echo_a_credential() {
        let message = storage_error("save this API key", "Keychain authorization failed");
        assert!(message.contains("Keychain"));
        assert!(!message.contains("AIza"));
    }
}

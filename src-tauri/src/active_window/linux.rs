use super::ActiveWindow;
use std::env;

pub fn get_active_window() -> ActiveWindow {
    let session = env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".to_string());
    let desktop = env::var("XDG_CURRENT_DESKTOP").unwrap_or_else(|_| "unknown".to_string());
    ActiveWindow::unavailable(format!(
        "Active-window context is unsupported in this Linux environment (session: {session}; desktop: {desktop})."
    ))
}

#[cfg(test)]
mod tests {
    use super::get_active_window;

    #[test]
    fn linux_fallback_never_invents_a_foreground_window() {
        let result = get_active_window();
        assert!(!result.available);
        assert!(result.application_name.is_empty());
    }
}

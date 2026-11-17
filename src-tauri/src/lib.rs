mod commands;

use std::collections::HashMap;
use std::process::Child;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tokio_util::sync::CancellationToken;

pub(crate) struct RuntimeState {
    pub requests: Arc<Mutex<HashMap<String, CancellationToken>>>,
    pub shortcut: Mutex<Option<Shortcut>>,
    pub llama_servers: Mutex<HashMap<String, Child>>,
}

impl Default for RuntimeState {
    fn default() -> Self {
        Self {
            requests: Arc::new(Mutex::new(HashMap::new())),
            shortcut: Mutex::new(None),
            llama_servers: Mutex::new(HashMap::new()),
        }
    }
}

impl Drop for RuntimeState {
    fn drop(&mut self) {
        if let Ok(servers) = self.llama_servers.get_mut() {
            for child in servers.values_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

pub fn run() {
    let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    tauri::Builder::default()
        .manage(RuntimeState::default())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, pressed, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let matches_active = app
                        .state::<RuntimeState>()
                        .shortcut
                        .lock()
                        .map(|active| active.as_ref() == Some(pressed))
                        .unwrap_or(false);
                    if matches_active {
                        toggle_main_window(app);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            commands::images::cleanup_expired_handoff_images();
            let active = if app.global_shortcut().register(shortcut.clone()).is_ok() {
                Some(shortcut)
            } else {
                None
            };
            *app.state::<RuntimeState>()
                .shortcut
                .lock()
                .map_err(|_| std::io::Error::other("Shortcut state is unavailable."))? = active;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::provider::provider_complete,
            commands::provider::provider_stream,
            commands::provider::cancel_provider_request,
            commands::provider::ollama_list_models,
            commands::provider::custom_list_models,
            commands::provider::provider_list_models,
            commands::provider::ollama_model_capabilities,
            commands::provider::ollama_pull_model,
            commands::system::system_resource_snapshot,
            commands::llamacpp::llama_cache_types,
            commands::llamacpp::llama_server_start,
            commands::llamacpp::llama_server_stop,
            commands::llamacpp::llama_server_is_running,
            commands::images::stage_handoff_image,
            commands::secrets::provider_set_secret,
            commands::secrets::provider_secret_exists,
            commands::secrets::provider_delete_secret,
            commands::storage::storage_read,
            commands::storage::storage_write,
            commands::storage::skills_list,
            commands::storage::skills_read,
            commands::storage::skills_write,
            commands::storage::skills_delete,
            commands::storage::skills_seed_if_empty,
            commands::system::clipboard_write_text,
            commands::system::set_global_shortcut,
            commands::system::window_minimize,
            commands::system::window_toggle_maximize,
            commands::system::window_close,
            commands::system::window_is_maximized
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Lunaris");
}

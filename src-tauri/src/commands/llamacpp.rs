use std::path::Path;
use std::process::{Command, Stdio};

use tauri::State;
use tokio::time::{sleep, Duration};

use crate::RuntimeState;

fn help_text(executable_path: &str) -> Result<String, String> {
    let executable = Path::new(executable_path.trim());
    if !executable.is_file() {
        return Err("Choose an existing llama-server executable first.".into());
    }
    let output = Command::new(executable)
        .arg("--help")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|_| "Could not read options from the selected llama-server executable.".to_string())?;
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    let has_k = text.lines().any(|line| line.contains("--cache-type-k") && !line.contains("--cache-type-k-draft"));
    let has_v = text.lines().any(|line| line.contains("--cache-type-v") && !line.contains("--cache-type-v-draft"));
    if !has_k || !has_v {
        return Err("This llama-server build does not report separate K and V cache-type options.".into());
    }
    Ok(text)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamaCacheTypes {
    key: Vec<String>,
    value: Vec<String>,
}

fn cache_options_from_help(help: &str) -> LlamaCacheTypes {
    let mut values = LlamaCacheTypes { key: Vec::new(), value: Vec::new() };
    let lines = help.lines().collect::<Vec<_>>();
    for (index, line) in lines.iter().enumerate().filter(|(_, line)| {
        (line.contains("--cache-type-k") && !line.contains("--cache-type-k-draft"))
            || (line.contains("--cache-type-v") && !line.contains("--cache-type-v-draft"))
    }) {
        let mut description = (*line).to_owned();
        for next in lines.iter().skip(index + 1).take(4) {
            if next.trim_start().starts_with('-') && !next.contains("allowed values:") { break; }
            description.push(' ');
            description.push_str(next);
            if next.contains("allowed values:") { break; }
        }
        let Some((_, rest)) = description.split_once("allowed values:") else { continue };
        let value_text = rest.split(['(', ')']).next().unwrap_or_default();
        let target = if line.contains("--cache-type-k") { &mut values.key } else { &mut values.value };
        for value in value_text.split(',').map(str::trim).filter(|value| !value.is_empty()) {
            if value.chars().all(|character| character.is_ascii_alphanumeric() || character == '_')
                && !target.iter().any(|existing| existing == value)
            {
                target.push(value.to_owned());
            }
        }
    }
    values
}

fn is_server_process_alive(state: &RuntimeState, role: &str) -> Result<bool, String> {
    let mut servers = state.llama_servers.lock().map_err(|_| "Local model server state is unavailable.".to_string())?;
    let Some(child) = servers.get_mut(role) else { return Ok(false) };
    if child.try_wait().map_err(|_| "Could not inspect the llama-server process.".to_string())?.is_some() {
        servers.remove(role);
        return Ok(false);
    }
    Ok(true)
}

fn stop_server_process(state: &RuntimeState, role: &str) {
    if let Ok(mut servers) = state.llama_servers.lock() {
        if let Some(mut child) = servers.remove(role) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn spawn_server_process(
    state: &RuntimeState,
    role: &str,
    executable_path: &str,
    model_path: &str,
    model_name: &str,
    port: u16,
    context_length: u32,
    cache_type_k: &str,
    cache_type_v: &str,
) -> Result<u32, String> {
    let mut servers = state.llama_servers.lock().map_err(|_| "Local model server state is unavailable.".to_string())?;
    if let Some(existing) = servers.get_mut(role) {
        if existing.try_wait().map_err(|_| "Could not inspect the existing llama-server process.".to_string())?.is_none() {
            return Err(format!("A llama.cpp server is already running for the {role}. Stop it before changing its model or cache settings."));
        }
        servers.remove(role);
    }

    let mut command = Command::new(executable_path);
    command
        .arg("--host").arg("127.0.0.1")
        .arg("--port").arg(port.to_string())
        .arg("--model").arg(model_path)
        .arg("--alias").arg(model_name)
        .arg("--ctx-size").arg(context_length.to_string())
        .arg("--cache-type-k").arg(cache_type_k)
        .arg("--cache-type-v").arg(cache_type_v)
        .arg("--parallel").arg("1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let child = command.spawn().map_err(|_| "Could not start llama-server. Check the executable and model file.".to_string())?;
    let process_id = child.id();
    servers.insert(role.to_owned(), child);
    Ok(process_id)
}

#[tauri::command]
pub fn llama_cache_types(executable_path: String) -> Result<LlamaCacheTypes, String> {
    let help = help_text(&executable_path)?;
    let options = cache_options_from_help(&help);
    if options.key.is_empty() || options.value.is_empty() {
        return Err("This llama-server build did not list supported KV cache types.".into());
    }
    Ok(options)
}

#[tauri::command]
pub async fn llama_server_start(
    state: State<'_, RuntimeState>,
    role: String,
    executable_path: String,
    model_path: String,
    model_name: String,
    port: u16,
    context_length: u32,
    cache_type_k: String,
    cache_type_v: String,
) -> Result<u32, String> {
    if !matches!(role.as_str(), "architect" | "executor") {
        return Err("Unknown model role.".into());
    }
    if !(1024..=65535).contains(&port) {
        return Err("Choose a local server port between 1024 and 65535.".into());
    }
    if !(128..=2_000_000).contains(&context_length) {
        return Err("Context length must be between 128 and 2,000,000 tokens.".into());
    }
    if model_name.trim().is_empty() {
        return Err("Enter the model name that the local server should expose.".into());
    }
    let model = Path::new(model_path.trim());
    if !model.is_file() {
        return Err("Choose an existing GGUF model file first.".into());
    }
    let help = help_text(&executable_path)?;
    let supported = cache_options_from_help(&help);
    if !supported.key.contains(&cache_type_k) || !supported.value.contains(&cache_type_v) {
        return Err("This llama-server build does not advertise the selected K/V cache type. Detect its supported types and choose again.".into());
    }

    let process_id = spawn_server_process(
        &state,
        &role,
        executable_path.trim(),
        model.to_str().ok_or_else(|| "The GGUF model path is not valid Unicode.".to_string())?,
        model_name.trim(),
        port,
        context_length,
        &cache_type_k,
        &cache_type_v,
    )?;

    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(1))
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|_| "Could not initialize the local server health check.".to_string())?;
    let health_url = format!("http://127.0.0.1:{port}/health");
    for _ in 0..180 {
        if !is_server_process_alive(&state, &role)? {
            return Err("llama-server stopped before it became ready.".into());
        }
        if let Ok(response) = client.get(&health_url).send().await {
            if response.status().is_success() {
                return Ok(process_id);
            }
        }
        sleep(Duration::from_millis(500)).await;
    }
    stop_server_process(&state, &role);
    Err("llama-server did not become ready within 90 seconds; the process was stopped.".into())
}

#[tauri::command]
pub fn llama_server_stop(state: State<'_, RuntimeState>, role: String) -> Result<bool, String> {
    let mut servers = state.llama_servers.lock().map_err(|_| "Local model server state is unavailable.".to_string())?;
    let Some(mut child) = servers.remove(&role) else { return Ok(false) };
    child.kill().map_err(|_| "Could not stop the llama-server process.".to_string())?;
    let _ = child.wait();
    Ok(true)
}

#[tauri::command]
pub fn llama_server_is_running(state: State<'_, RuntimeState>, role: String) -> Result<bool, String> {
    is_server_process_alive(&state, &role)
}


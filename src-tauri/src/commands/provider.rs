use std::time::Duration;

use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use reqwest::{redirect::Policy, Client, Method, Response};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;
use url::Url;

use crate::commands::secrets::load_secret;
use crate::RuntimeState;

const RESPONSE_LIMIT: usize = 8 * 1024 * 1024;
const STREAM_EVENT: &str = "lunaris://provider-stream";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRequest {
    pub request_id: Option<String>,
    pub role: String,
    pub provider: String,
    pub model: String,
    pub base_url: Option<String>,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamEvent {
    request_id: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    chunk: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OllamaTags {
    #[serde(default)]
    models: Vec<OllamaModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModel {
    pub name: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub modified_at: Option<String>,
    #[serde(default)]
    pub details: Option<OllamaModelDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaModelDetails {
    pub family: Option<String>,
    pub parameter_size: Option<String>,
    pub quantization_level: Option<String>,
}

fn normalized_provider(provider: &str) -> Result<&str, String> {
    match provider {
        "ollama" | "llamacpp" | "openrouter" | "openai" | "anthropic" | "custom" => Ok(provider),
        _ => Err("Unsupported AI provider.".into()),
    }
}

fn provider_url(provider: &str, base_url: Option<&str>) -> Result<Url, String> {
    let default = match provider {
        "ollama" => Some("http://localhost:11434"),
        "llamacpp" => Some("http://127.0.0.1:8081/v1"),
        "openrouter" => Some("https://openrouter.ai/api/v1"),
        "openai" => Some("https://api.openai.com/v1"),
        "anthropic" => Some("https://api.anthropic.com/v1"),
        "custom" => None,
        _ => return Err("Unsupported AI provider.".into()),
    };
    let raw = base_url
        .filter(|value| !value.trim().is_empty())
        .or(default)
        .ok_or_else(|| "Enter a base URL for the custom provider.".to_string())?;
    let mut url = Url::parse(raw.trim()).map_err(|_| "The provider URL is invalid.".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("Provider URLs must use HTTP or HTTPS and include a host.".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Do not put credentials in the provider URL; save them in provider settings.".into());
    }
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

fn endpoint(provider: &str, base_url: Option<&str>) -> Result<Url, String> {
    let mut url = provider_url(provider, base_url)?;
    let path = url.path().trim_end_matches('/').to_owned();
    let path = if provider == "ollama" {
        let base = path
            .strip_suffix("/api/chat")
            .or_else(|| path.strip_suffix("/api/tags"))
            .or_else(|| path.strip_suffix("/api"))
            .unwrap_or(&path);
        format!("{base}/api/chat")
    } else if provider == "anthropic" {
        if path.ends_with("/messages") {
            path
        } else if path.is_empty() {
            "/v1/messages".to_owned()
        } else {
            format!("{path}/messages")
        }
    } else if path.ends_with("/chat/completions") {
        path
    } else {
        format!("{path}/chat/completions")
    };
    url.set_path(&path);
    Ok(url)
}

fn client(timeout: Option<Duration>) -> Result<Client, String> {
    let mut builder = Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .read_timeout(Duration::from_secs(60))
        .redirect(Policy::none())
        .user_agent(concat!("Lunaris/", env!("CARGO_PKG_VERSION")));
    if let Some(timeout) = timeout {
        builder = builder.timeout(timeout);
    }
    builder
        .build()
        .map_err(|_| "Could not initialize the network client.".into())
}

fn build_body(request: &ProviderRequest, streaming: bool) -> Result<Value, String> {
    let mut body = request.payload.clone();
    let object = body
        .as_object_mut()
        .ok_or_else(|| "Provider request payload must be a JSON object.".to_string())?;
    object.insert("model".into(), Value::String(request.model.clone()));
    object.insert("stream".into(), Value::Bool(streaming));
    if request.provider == "anthropic" {
        object.remove("response_format");
        if !object.contains_key("max_tokens") {
            object.insert("max_tokens".into(), json!(4096));
        }
    } else if request.provider == "ollama" {
        let temperature = object.remove("temperature");
        let max_tokens = object.remove("max_tokens");
        let context_length = object.remove("num_ctx");
        if temperature.is_some() || max_tokens.is_some() || context_length.is_some() {
            let options = object.entry("options").or_insert_with(|| json!({}));
            let options = options
                .as_object_mut()
                .ok_or_else(|| "Ollama options must be a JSON object.".to_string())?;
            if let Some(temperature) = temperature {
                options.insert("temperature".into(), temperature);
            }
            if let Some(max_tokens) = max_tokens {
                options.insert("num_predict".into(), max_tokens);
            }
            if let Some(context_length) = context_length {
                options.insert("num_ctx".into(), context_length);
            }
        }
    }
    let size = serde_json::to_vec(&body)
        .map_err(|_| "Could not encode the provider request.".to_string())?
        .len();
    if size > 64 * 1024 * 1024 {
        return Err("Provider request payloads must be smaller than 64 MB.".into());
    }
    Ok(body)
}

async fn send_request(request: &ProviderRequest, streaming: bool) -> Result<Response, String> {
    let provider = normalized_provider(&request.provider)?;
    if !matches!(request.role.as_str(), "architect" | "executor") {
        return Err("Unknown provider role.".into());
    }
    if request.model.trim().is_empty() {
        return Err("Select a model before sending a provider request.".into());
    }
    let url = endpoint(provider, request.base_url.as_deref())?;
    let body = build_body(request, streaming)?;
    let secret = if matches!(provider, "ollama" | "llamacpp") {
        None
    } else {
        load_secret(&request.role, provider)?
    };
    if !matches!(provider, "ollama" | "llamacpp" | "custom") && secret.is_none() {
        return Err("No API key is saved for this provider and role.".into());
    }
    if secret.is_some()
        && url.scheme() != "https"
        && !matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"))
    {
        return Err("API keys require HTTPS unless the provider is on this computer.".into());
    }

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if provider == "anthropic" {
        let mut key = HeaderValue::from_str(secret.as_deref().unwrap_or_default())
            .map_err(|_| "The saved API key contains invalid header characters.".to_string())?;
        key.set_sensitive(true);
        headers.insert("x-api-key", key);
        headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
    } else if let Some(secret) = secret.as_deref() {
        let mut value = HeaderValue::from_str(&format!("Bearer {secret}"))
            .map_err(|_| "The saved API key contains invalid header characters.".to_string())?;
        value.set_sensitive(true);
        headers.insert("authorization", value);
    }
    if provider == "openrouter" {
        headers.insert("http-referer", HeaderValue::from_static("https://lunaris.app"));
        headers.insert("x-title", HeaderValue::from_static("Lunaris"));
    }

    client(if streaming { None } else { Some(Duration::from_secs(240)) })?
        .request(Method::POST, url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "The provider request timed out.".to_string()
            } else if error.is_connect() {
                "Could not connect to the provider. Check its URL and network status.".to_string()
            } else {
                "The provider request failed before a response was received.".to_string()
            }
        })
}

async fn response_error(response: Response) -> String {
    let status = response.status();
    let mut stream = response.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(Ok(chunk)) = stream.next().await {
        if bytes.len().saturating_add(chunk.len()) > 16 * 1024 {
            break;
        }
        bytes.extend_from_slice(&chunk);
    }
    let detail = serde_json::from_slice::<Value>(&bytes).ok().and_then(|body| {
        body.get("error")
            .and_then(|error| error.get("message").and_then(Value::as_str).or_else(|| error.as_str()))
            .or_else(|| body.get("message").and_then(Value::as_str))
            .map(|message| message.chars().take(500).collect::<String>())
    });
    match detail.filter(|message| !message.trim().is_empty()) {
        Some(message) => format!("Provider returned HTTP {}: {message}", status.as_u16()),
        None => format!("Provider returned HTTP {}.", status.as_u16()),
    }
}

async fn bounded_json(response: Response) -> Result<Value, String> {
    let status = response.status();
    if !status.is_success() {
        return Err(response_error(response).await);
    }
    if response.content_length().is_some_and(|length| length > RESPONSE_LIMIT as u64) {
        return Err("The provider response exceeded the 8 MB limit.".into());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "Could not read the provider response.".to_string())?;
        if bytes.len().saturating_add(chunk.len()) > RESPONSE_LIMIT {
            return Err("The provider response exceeded the 8 MB limit.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "The provider returned invalid JSON.".into())
}

#[tauri::command]
pub async fn provider_complete(request: ProviderRequest) -> Result<Value, String> {
    let response = send_request(&request, false).await?;
    bounded_json(response).await
}

#[tauri::command]
pub async fn provider_stream(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    mut request: ProviderRequest,
) -> Result<(), String> {
    let request_id = request
        .request_id
        .take()
        .filter(|id| !id.trim().is_empty() && id.len() <= 128)
        .ok_or_else(|| "Streaming requests require a valid request ID.".to_string())?;
    let token = CancellationToken::new();
    {
        let mut requests = state
            .requests
            .lock()
            .map_err(|_| "Request state is unavailable.".to_string())?;
        if requests.contains_key(&request_id) {
            return Err("A request with this ID is already running.".into());
        }
        requests.insert(request_id.clone(), token.clone());
    }

    let result = stream_inner(&app, &request_id, &request, &token).await;
    if let Ok(mut requests) = state.requests.lock() {
        requests.remove(&request_id);
    }
    match result {
        Ok(()) if token.is_cancelled() => {
            let _ = app.emit(STREAM_EVENT, StreamEvent {
                request_id,
                kind: "cancelled",
                chunk: None,
                message: None,
            });
            Ok(())
        }
        Ok(()) => {
            let _ = app.emit(STREAM_EVENT, StreamEvent {
                request_id,
                kind: "done",
                chunk: None,
                message: None,
            });
            Ok(())
        }
        Err(_error) if token.is_cancelled() => {
            let _ = app.emit(STREAM_EVENT, StreamEvent {
                request_id,
                kind: "cancelled",
                chunk: None,
                message: None,
            });
            Ok(())
        }
        Err(error) => {
            let _ = app.emit(STREAM_EVENT, StreamEvent {
                request_id,
                kind: "error",
                chunk: None,
                message: Some(error.clone()),
            });
            Err(error)
        }
    }
}

async fn stream_inner(
    app: &AppHandle,
    request_id: &str,
    request: &ProviderRequest,
    token: &CancellationToken,
) -> Result<(), String> {
    let response = tokio::select! {
        _ = token.cancelled() => return Ok(()),
        response = send_request(request, true) => response?,
    };
    if !response.status().is_success() {
        return tokio::select! {
            _ = token.cancelled() => Ok(()),
            error = response_error(response) => Err(error),
        };
    }
    let mut stream = response.bytes_stream();
    let mut received = 0usize;
    let mut pending = Vec::<u8>::new();
    loop {
        let next = tokio::select! {
            _ = token.cancelled() => return Ok(()),
            item = stream.next() => item,
        };
        let Some(item) = next else { break };
        let chunk = item.map_err(|_| "The provider stream ended unexpectedly.".to_string())?;
        received = received.saturating_add(chunk.len());
        if received > 64 * 1024 * 1024 {
            return Err("The provider stream exceeded the 64 MB limit.".into());
        }
        pending.extend_from_slice(&chunk);
        match std::str::from_utf8(&pending) {
            Ok(text) => {
                emit_stream_chunk(app, request_id, text.to_owned())?;
                pending.clear();
            }
            Err(error) if error.error_len().is_none() => {
                let valid = error.valid_up_to();
                if valid > 0 {
                    let text = std::str::from_utf8(&pending[..valid])
                        .map_err(|_| "Provider stream contained invalid text.".to_string())?
                        .to_owned();
                    pending.drain(..valid);
                    emit_stream_chunk(app, request_id, text)?;
                }
            }
            Err(_) => {
                let text = String::from_utf8_lossy(&pending).into_owned();
                pending.clear();
                emit_stream_chunk(app, request_id, text)?;
            }
        }
    }
    if !pending.is_empty() && !token.is_cancelled() {
        emit_stream_chunk(app, request_id, String::from_utf8_lossy(&pending).into_owned())?;
    }
    Ok(())
}

fn emit_stream_chunk(app: &AppHandle, request_id: &str, chunk: String) -> Result<(), String> {
    if chunk.is_empty() {
        return Ok(());
    }
    app.emit(
        STREAM_EVENT,
        StreamEvent {
            request_id: request_id.to_string(),
            kind: "chunk",
            chunk: Some(chunk),
            message: None,
        },
    )
    .map_err(|_| "Could not deliver provider output to the app.".to_string())
}

#[tauri::command]
pub fn cancel_provider_request(
    state: State<'_, RuntimeState>,
    request_id: String,
) -> Result<bool, String> {
    let requests = state
        .requests
        .lock()
        .map_err(|_| "Request state is unavailable.".to_string())?;
    if let Some(token) = requests.get(&request_id) {
        token.cancel();
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn ollama_list_models(base_url: Option<String>) -> Result<Vec<OllamaModel>, String> {
    let mut url = endpoint("ollama", base_url.as_deref())?;
    let path = url.path().strip_suffix("/api/chat").unwrap_or("").to_owned();
    url.set_path(&format!("{path}/api/tags"));
    let response = client(Some(Duration::from_secs(10)))?
        .get(url)
        .send()
        .await
        .map_err(|_| "Could not connect to Ollama at the configured URL.".to_string())?;
    if !response.status().is_success() {
        return Err(format!("Ollama returned HTTP {}.", response.status().as_u16()));
    }
    let data: OllamaTags = serde_json::from_value(bounded_json(response).await?)
        .map_err(|_| "Ollama returned an invalid model list.".to_string())?;
    let mut models = data.models;
    models.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(models)
}

#[derive(Debug, Deserialize)]
struct CompatibleModelsResponse {
    #[serde(default)]
    data: Vec<CompatibleModel>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibleModel {
    pub id: String,
    #[serde(default, alias = "display_name")]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default, alias = "context_length")]
    pub context_length: Option<u64>,
    #[serde(default)]
    pub architecture: Option<ModelArchitecture>,
    #[serde(default, alias = "supported_parameters")]
    pub supported_parameters: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelArchitecture {
    #[serde(default, alias = "input_modalities")]
    pub input_modalities: Vec<String>,
    #[serde(default, alias = "output_modalities")]
    pub output_modalities: Vec<String>,
}

#[tauri::command]
pub async fn provider_list_models(
    role: String,
    provider: String,
    base_url: Option<String>,
) -> Result<Vec<CompatibleModel>, String> {
    if !matches!(role.as_str(), "architect" | "executor") {
        return Err("Unknown provider role.".into());
    }
    let provider = normalized_provider(&provider)?;
    if provider == "ollama" {
        return Ok(ollama_list_models(base_url).await?.into_iter().map(|model| CompatibleModel {
            id: model.name.clone(),
            name: Some(model.name),
            description: None,
            context_length: None,
            architecture: None,
            supported_parameters: Vec::new(),
        }).collect());
    }

    let mut url = provider_url(provider, base_url.as_deref())?;
    let root = url.path().trim_end_matches('/').to_owned();
    let path = if root.ends_with("/models") { root } else { format!("{root}/models") };
    url.set_path(&path);
    let secret = if matches!(provider, "llamacpp" | "custom") { load_secret(&role, provider)? } else { Some(load_secret(&role, provider)?.ok_or_else(|| format!("Save an API key for {} before browsing its models.", provider))?) };
    if secret.is_some() && url.scheme() != "https" && !matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1")) {
        return Err("API keys require HTTPS unless the provider is on this computer.".into());
    }

    let mut request = client(Some(Duration::from_secs(20)))?.get(url);
    if provider == "anthropic" {
        if let Some(secret) = secret {
            let mut key = HeaderValue::from_str(&secret).map_err(|_| "The saved API key contains invalid header characters.".to_string())?;
            key.set_sensitive(true);
            request = request.header("x-api-key", key).header("anthropic-version", "2023-06-01");
        }
    } else if let Some(secret) = secret {
        let mut value = HeaderValue::from_str(&format!("Bearer {secret}"))
            .map_err(|_| "The saved API key contains invalid header characters.".to_string())?;
        value.set_sensitive(true);
        request = request.header("authorization", value);
    }
    if provider == "openrouter" {
        request = request.header("http-referer", "https://lunaris.app").header("x-title", "Lunaris");
    }

    let response = request.send().await.map_err(|_| format!("Could not reach the {provider} model catalog."))?;
    if !response.status().is_success() {
        return Err(format!("{provider} returned HTTP {} while listing models.", response.status().as_u16()));
    }
    let data: CompatibleModelsResponse = serde_json::from_value(bounded_json(response).await?)
        .map_err(|_| format!("{provider} returned an unsupported model list. Configure an OpenAI-compatible /models endpoint."))?;
    Ok(data.data.into_iter().filter(|model| !model.id.trim().is_empty()).collect())
}

#[tauri::command]
pub async fn custom_list_models(role: String, base_url: String) -> Result<Vec<CompatibleModel>, String> {
    if !matches!(role.as_str(), "architect" | "executor") {
        return Err("Unknown provider role.".into());
    }
    let mut url = provider_url("custom", Some(&base_url))?;
    let root = url.path().trim_end_matches('/');
    url.set_path(&format!("{root}/models"));
    let secret = load_secret(&role, "custom")?;
    if secret.is_some() && url.scheme() != "https" && !matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1")) {
        return Err("API keys require HTTPS unless the provider is on this computer.".into());
    }
    let mut request = client(Some(Duration::from_secs(15)))?.get(url);
    if let Some(secret) = secret {
        let mut value = HeaderValue::from_str(&format!("Bearer {secret}"))
            .map_err(|_| "The saved API key contains invalid header characters.".to_string())?;
        value.set_sensitive(true);
        request = request.header("authorization", value);
    }
    let response = request.send().await.map_err(|_| "Could not connect to the OpenAI-compatible endpoint. Check its URL and that it exposes GET /models.".to_string())?;
    if !response.status().is_success() {
        return Err(format!("The custom endpoint returned HTTP {} for its model list.", response.status().as_u16()));
    }
    let data: CompatibleModelsResponse = serde_json::from_value(bounded_json(response).await?)
        .map_err(|_| "The custom endpoint returned an invalid OpenAI-compatible model list.".to_string())?;
    Ok(data.data.into_iter().filter(|model| !model.id.trim().is_empty()).collect())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OllamaPullEvent {
    request_id: String,
    model: String,
    status: String,
    completed: Option<u64>,
    total: Option<u64>,
    message: Option<String>,
}

#[tauri::command]
pub async fn ollama_pull_model(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    base_url: Option<String>,
    model: String,
    request_id: String,
) -> Result<(), String> {
    let model = model.trim().to_owned();
    let request_id = request_id.trim().to_owned();
    if model.is_empty() || model.len() > 256 || request_id.is_empty() || request_id.len() > 128 {
        return Err("Enter a valid Ollama model name.".into());
    }
    let token = CancellationToken::new();
    {
        let mut requests = state.requests.lock().map_err(|_| "Request state is unavailable.".to_string())?;
        if requests.contains_key(&request_id) { return Err("A model download with this ID is already running.".into()); }
        requests.insert(request_id.clone(), token.clone());
    }
    let result = async {
        let mut url = provider_url("ollama", base_url.as_deref())?;
        let path = url.path().trim_end_matches('/');
        let root = path.strip_suffix("/api/chat").or_else(|| path.strip_suffix("/api/tags")).or_else(|| path.strip_suffix("/api")).unwrap_or(path);
        url.set_path(&format!("{root}/api/pull"));
        let response = tokio::select! {
            _ = token.cancelled() => return Ok(()),
            response = client(None)?.post(url).json(&json!({"name": model, "stream": true})).send() => response.map_err(|_| "Could not connect to Ollama to download the model.".to_string())?,
        };
        if !response.status().is_success() { return Err(format!("Ollama returned HTTP {} while starting the download.", response.status().as_u16())); }
        let mut stream = response.bytes_stream();
        let mut pending = Vec::<u8>::new();
        let mut download_complete = false;
        loop {
            let next = tokio::select! { _ = token.cancelled() => return Ok(()), item = stream.next() => item };
            let Some(chunk) = next else { break };
            pending.extend_from_slice(&chunk.map_err(|_| "Ollama download progress stream ended unexpectedly.".to_string())?);
            if pending.len() > RESPONSE_LIMIT { return Err("Ollama download status exceeded the response limit.".into()); }
            while let Some(newline) = pending.iter().position(|byte| *byte == b'\n') {
                let line = pending.drain(..=newline).take(newline).collect::<Vec<_>>();
                if line.is_empty() { continue; }
                let event: Value = serde_json::from_slice(&line).map_err(|_| "Ollama returned invalid download progress.".to_string())?;
                let status = event.get("status").and_then(Value::as_str).unwrap_or("Downloading").to_owned();
                let completed = event.get("completed").and_then(Value::as_u64);
                let total = event.get("total").and_then(Value::as_u64);
                let message = event.get("error").and_then(Value::as_str).map(str::to_owned);
                let kind = if message.is_some() { "error" } else if status == "success" { "completed" } else { "progress" };
                app.emit("lunaris://ollama-pull", OllamaPullEvent { request_id: request_id.clone(), model: model.clone(), status, completed, total, message }).map_err(|_| "Could not update model download progress.".to_string())?;
                if kind == "error" { return Err("Ollama could not download this model.".into()); }
                if kind == "completed" { download_complete = true; }
            }
        }
        if !pending.is_empty() {
            let event: Value = serde_json::from_slice(&pending).map_err(|_| "Ollama returned incomplete download progress.".to_string())?;
            if event.get("error").is_some() { return Err("Ollama could not download this model.".into()); }
            app.emit("lunaris://ollama-pull", OllamaPullEvent { request_id: request_id.clone(), model: model.clone(), status: "success".into(), completed: None, total: None, message: None }).map_err(|_| "Could not update model download progress.".to_string())?;
            download_complete = true;
        }
        if !download_complete && !token.is_cancelled() { return Err("Ollama ended the model download before reporting success.".into()); }
        Ok(())
    }.await;
    if let Ok(mut requests) = state.requests.lock() { requests.remove(&request_id); }
    result
}

#[derive(Debug, Deserialize)]
struct OllamaShowResponse {
    #[serde(default)]
    capabilities: Vec<String>,
}

#[tauri::command]
pub async fn ollama_model_capabilities(
    base_url: Option<String>,
    model: String,
) -> Result<Vec<String>, String> {
    if model.trim().is_empty() {
        return Err("Select an Ollama model before checking its capabilities.".into());
    }
    let mut url = endpoint("ollama", base_url.as_deref())?;
    let path = url.path().strip_suffix("/api/chat").unwrap_or("").to_owned();
    url.set_path(&format!("{path}/api/show"));
    let response = client(Some(Duration::from_secs(10)))?
        .post(url)
        .json(&json!({ "model": model }))
        .send()
        .await
        .map_err(|_| "Could not connect to Ollama to check model capabilities.".to_string())?;
    if !response.status().is_success() {
        return Err(format!("Ollama could not inspect model '{}': HTTP {}.", model, response.status().as_u16()));
    }
    let data: OllamaShowResponse = serde_json::from_value(bounded_json(response).await?)
        .map_err(|_| "Ollama returned invalid model capability data.".to_string())?;
    Ok(data.capabilities)
}

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use url::Url;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolHealthResult {
    pub status: String,
    pub detail: String,
    pub checked_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub http_status: Option<u16>,
}

fn now_label() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|duration| duration.as_secs().to_string()).unwrap_or_else(|_| "unknown".into())
}

fn result(status: &str, detail: impl Into<String>, http_status: Option<u16>) -> ToolHealthResult {
    ToolHealthResult { status: status.into(), detail: detail.into(), checked_at: now_label(), http_status }
}

fn command_token(value: &str) -> &str {
    let value = value.trim();
    if let Some(quoted) = value.strip_prefix('"') {
        if let Some(end) = quoted.find('"') {
            return &quoted[..end];
        }
    }
    value.split_whitespace().next().unwrap_or("")
}

fn executable_exists(program: &str) -> Option<PathBuf> {
    let path = Path::new(program);
    if path.is_absolute() || path.components().count() > 1 {
        return path.is_file().then(|| path.to_path_buf());
    }
    let search = std::env::var_os("PATH")?;
    for directory in std::env::split_paths(&search) {
        let candidate = directory.join(program);
        if candidate.is_file() { return Some(candidate); }
        #[cfg(windows)]
        for extension in [".exe", ".cmd", ".bat"] {
            let candidate = directory.join(format!("{program}{extension}"));
            if candidate.is_file() { return Some(candidate); }
        }
    }
    None
}

#[tauri::command]
pub async fn check_tool_health(kind: String, connection_kind: Option<String>, location: String) -> ToolHealthResult {
    let target = location.trim();
    if target.is_empty() {
        return result("invalid", "Add a location before checking this entry.", None);
    }
    match kind.as_str() {
        "application" => {
            if Path::new(target).is_file() {
                result("available", "The configured application file exists. Lunaris did not launch it.", None)
            } else {
                result("missing", "No file exists at this application path. Check the saved location.", None)
            }
        }
        "mcp" => match connection_kind.as_deref() {
            Some("stdio") => {
                let token = command_token(target);
                if token.is_empty() { return result("invalid", "Enter a command or executable path.", None); }
                match executable_exists(token) {
                    Some(path) => result("available", format!("The configured executable exists at {}. Lunaris did not run it or initialize the MCP server.", path.display()), None),
                    None => result("missing", "The executable was not found on PATH or at the configured path. Lunaris did not run the command.", None),
                }
            }
            Some("url") => {
                let parsed = match Url::parse(target) {
                    Ok(value) => value,
                    Err(_) => return result("invalid", "Enter a valid HTTP or HTTPS endpoint URL.", None),
                };
                if !["http", "https"].contains(&parsed.scheme()) || !parsed.username().is_empty() || parsed.password().is_some() {
                    return result("invalid", "Only HTTP(S) endpoints without embedded credentials can be checked.", None);
                }
                let client = match reqwest::Client::builder().timeout(Duration::from_secs(4)).redirect(reqwest::redirect::Policy::none()).build() {
                    Ok(client) => client,
                    Err(_) => return result("unhealthy", "Could not create the endpoint health-check client.", None),
                };
                match client.get(parsed).send().await {
                    Ok(response) => {
                        let status = response.status();
                        if status.is_server_error() {
                            result("unhealthy", format!("The endpoint responded with HTTP {}.", status.as_u16()), Some(status.as_u16()))
                        } else {
                            result("reachable", format!("The endpoint responded with HTTP {}. This checks reachability only; Lunaris did not call an MCP tool.", status.as_u16()), Some(status.as_u16()))
                        }
                    }
                    Err(error) if error.is_timeout() => result("timeout", "The endpoint did not respond within four seconds.", None),
                    Err(_) => result("unhealthy", "The endpoint could not be reached. Check the URL and whether the server is running.", None),
                }
            }
            _ => result("invalid", "Choose an MCP connection kind before checking it.", None),
        },
        _ => result("invalid", "Unsupported tool entry type.", None),
    }
}

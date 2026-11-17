use keyring::Entry;
use serde::Serialize;

const SERVICE: &str = "com.lunaris.app";

#[derive(Serialize)]
pub struct SecretStatus {
    pub exists: bool,
}

fn entry(role: &str, provider: &str) -> Result<Entry, String> {
    let role = role.trim().to_ascii_lowercase();
    let provider = provider.trim().to_ascii_lowercase();
    if !matches!(role.as_str(), "architect" | "executor") {
        return Err("Unknown provider role.".into());
    }
    if provider.is_empty()
        || provider.len() > 48
        || !provider
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err("Invalid provider identifier.".into());
    }
    Entry::new(SERVICE, &format!("{role}/{provider}"))
        .map_err(|_| "The Windows credential store could not be opened.".into())
}

#[tauri::command]
pub fn provider_set_secret(role: String, provider: String, secret: String) -> Result<(), String> {
    if secret.trim().is_empty() {
        return provider_delete_secret(role, provider);
    }
    entry(&role, &provider)?
        .set_password(&secret)
        .map_err(|_| "The credential could not be saved to the system credential store.".into())
}

#[tauri::command]
pub fn provider_secret_exists(role: String, provider: String) -> Result<SecretStatus, String> {
    let exists = match entry(&role, &provider)?.get_password() {
        Ok(_) => true,
        Err(keyring::Error::NoEntry) => false,
        Err(_) => return Err("The system credential store could not be read.".into()),
    };
    Ok(SecretStatus { exists })
}

#[tauri::command]
pub fn provider_delete_secret(role: String, provider: String) -> Result<(), String> {
    match entry(&role, &provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("The credential could not be removed from the system credential store.".into()),
    }
}

pub(crate) fn load_secret(role: &str, provider: &str) -> Result<Option<String>, String> {
    match entry(role, provider)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("The system credential store could not be read.".into()),
    }
}

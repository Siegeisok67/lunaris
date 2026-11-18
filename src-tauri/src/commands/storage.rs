use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

const MAX_SKILL_BYTES: usize = 512 * 1024;
const MAX_COLLECTION_BYTES: u64 = 32 * 1024 * 1024;
static STORAGE_WRITE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFile {
    pub id: String,
    pub content: String,
}

fn app_root(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    if let Some(app_data) = std::env::var_os("APPDATA") {
        return Ok(PathBuf::from(app_data).join("Lunaris"));
    }
    app.path()
        .app_data_dir()
        .map_err(|_| "Could not locate the Lunaris application data directory.".into())
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|_| "Could not create the Lunaris data directory.".to_string())
}

fn storage_file(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    let file = match key {
        "settings" => "settings.json",
        "history" => "history.json",
        "memory" => "memory.json",
        _ => return Err("Unknown storage collection.".into()),
    };
    let root = app_root(app)?;
    ensure_dir(&root)?;
    Ok(root.join(file))
}

fn skill_id(id: &str) -> Result<&str, String> {
    let id = id.trim();
    if id.is_empty()
        || id.len() > 64
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err("Skill IDs may contain only lowercase letters, numbers, and hyphens.".into());
    }
    Ok(id)
}

fn skills_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app_root(app)?.join("skills");
    ensure_dir(&path)?;
    Ok(path)
}

fn skill_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(skills_dir(app)?.join(format!("{}.md", skill_id(id)?)))
}

#[tauri::command]
pub fn storage_read(app: AppHandle, key: String) -> Result<Option<Value>, String> {
    let path = storage_file(&app, &key)?;
    if !path.exists() {
        return Ok(None);
    }
    let file_size = fs::metadata(&path)
        .map_err(|_| "Could not inspect saved Lunaris data.".to_string())?
        .len();
    if file_size > MAX_COLLECTION_BYTES {
        return Err("Saved Lunaris data exceeds the 32 MB collection limit.".into());
    }
    let content = fs::read_to_string(path)
        .map_err(|_| "Could not read the saved Lunaris data.".to_string())?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|_| "Saved Lunaris data is invalid JSON.".into())
}

#[tauri::command]
pub fn storage_write(app: AppHandle, key: String, value: Value) -> Result<(), String> {
    let path = storage_file(&app, &key)?;
    let content = serde_json::to_vec_pretty(&value)
        .map_err(|_| "Could not encode Lunaris data.".to_string())?;
    if content.len() as u64 > MAX_COLLECTION_BYTES {
        return Err("Lunaris data collections must be smaller than 32 MB.".into());
    }
    atomic_write(&path, &content)
}

#[tauri::command]
pub fn skills_list(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = skills_dir(&app)?;
    let mut ids = fs::read_dir(dir)
        .map_err(|_| "Could not list installed skills.".to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
                return None;
            }
            path.file_stem()
                .and_then(|stem| stem.to_str())
                .filter(|id| skill_id(id).is_ok())
                .map(str::to_owned)
        })
        .collect::<Vec<_>>();
    ids.sort_unstable();
    Ok(ids)
}

#[tauri::command]
pub fn skills_read(app: AppHandle, id: String) -> Result<Option<SkillFile>, String> {
    let path = skill_path(&app, &id)?;
    if !path.exists() {
        return Ok(None);
    }
    if fs::metadata(&path)
        .map_err(|_| "Could not inspect this skill file.".to_string())?
        .len() > MAX_SKILL_BYTES as u64
    {
        return Err("Skill files must be smaller than 512 KB.".into());
    }
    let content = fs::read_to_string(path)
        .map_err(|_| "Could not read this skill file.".to_string())?;
    Ok(Some(SkillFile { id: skill_id(&id)?.to_owned(), content }))
}

#[tauri::command]
pub fn skills_write(app: AppHandle, id: String, content: String) -> Result<(), String> {
    let id = skill_id(&id)?.to_owned();
    if content.len() > MAX_SKILL_BYTES {
        return Err("Skill files must be smaller than 512 KB.".into());
    }
    atomic_write(&skill_path(&app, &id)?, content.as_bytes())
}

#[tauri::command]
pub fn skills_delete(app: AppHandle, id: String) -> Result<(), String> {
    let path = skill_path(&app, &id)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("Could not delete this skill file.".into()),
    }
}

#[tauri::command]
pub fn skills_seed_if_empty(app: AppHandle, skills: Vec<SkillFile>) -> Result<bool, String> {
    let dir = skills_dir(&app)?;
    let marker = app_root(&app)?.join("skills-initialized");
    if marker.exists() {
        return Ok(false);
    }
    let existing = fs::read_dir(&dir)
        .map_err(|_| "Could not inspect the skill library.".to_string())?
        .filter_map(Result::ok)
        .any(|entry| entry.path().extension().and_then(|ext| ext.to_str()) == Some("md"));
    if existing {
        atomic_write(&marker, b"1")?;
        return Ok(false);
    }
    if skills.is_empty() {
        return Err("No bundled skills were provided for the first launch.".into());
    }
    for skill in &skills {
        skill_id(&skill.id)?;
        if skill.content.len() > MAX_SKILL_BYTES {
            return Err(format!("The bundled skill {} is too large.", skill.id));
        }
    }
    for skill in skills {
        let id = skill_id(&skill.id)?.to_owned();
        atomic_write(&dir.join(format!("{id}.md")), skill.content.as_bytes())?;
    }
    atomic_write(&marker, b"1")?;
    Ok(true)
}

fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let _write_guard = STORAGE_WRITE_LOCK
        .lock()
        .map_err(|_| "Lunaris storage is temporarily unavailable.".to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "Invalid Lunaris data path.".to_string())?;
    ensure_dir(parent)?;
    let mut temp = path.to_path_buf();
    temp.set_extension(format!("{}.tmp", path.extension().and_then(|ext| ext.to_str()).unwrap_or("data")));
    fs::write(&temp, data).map_err(|_| "Could not write Lunaris data.".to_string())?;
    fs::rename(&temp, path).map_err(|_| {
        let _ = fs::remove_file(&temp);
        "Could not finish saving Lunaris data.".to_string()
    })
}

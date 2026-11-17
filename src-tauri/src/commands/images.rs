use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;

const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;
const MAX_ENCODED_BYTES: usize = 12 * 1024 * 1024;
const HANDOFF_TTL: Duration = Duration::from_secs(7 * 24 * 60 * 60);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedHandoffImage {
    pub name: String,
    pub path: String,
}

fn valid_handoff_id(value: &str) -> bool {
    value.len() == 36
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
}

fn image_extension(mime_type: &str) -> Result<&'static str, String> {
    match mime_type {
        "image/png" => Ok("png"),
        "image/jpeg" => Ok("jpg"),
        "image/webp" => Ok("webp"),
        _ => Err("Only PNG, JPEG, and WebP handoff images are supported.".into()),
    }
}

fn matches_image_type(bytes: &[u8], mime_type: &str) -> bool {
    match mime_type {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/webp" => {
            bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP"
        }
        _ => false,
    }
}

fn safe_stem(name: &str) -> String {
    let leaf = name.rsplit(['/', '\\']).next().unwrap_or("reference");
    let stem = Path::new(leaf)
        .file_stem()
        .and_then(|part| part.to_str())
        .unwrap_or("reference");
    let mut clean = stem
        .chars()
        .filter_map(|character| {
            if character.is_ascii_alphanumeric() {
                Some(character.to_ascii_lowercase())
            } else if character == '-' || character == '_' {
                Some('-')
            } else {
                None
            }
        })
        .take(32)
        .collect::<String>();
    while clean.starts_with('-') {
        clean.remove(0);
    }
    while clean.ends_with('-') {
        clean.pop();
    }
    if clean.is_empty() {
        "reference".into()
    } else {
        clean
    }
}

fn handoff_root() -> std::path::PathBuf {
    std::env::temp_dir().join("Lunaris").join("handoff")
}

fn clean_expired(root: &Path, now: SystemTime, keep: &Path) {
    let Ok(entries) = fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path == keep || !path.is_dir() {
            continue;
        }
        let stale = fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age > HANDOFF_TTL);
        if stale {
            let _ = fs::remove_dir_all(path);
        }
    }
}

pub fn cleanup_expired_handoff_images() {
    clean_expired(&handoff_root(), SystemTime::now(), Path::new(""));
}

#[tauri::command]
pub fn stage_handoff_image(
    handoff_id: String,
    index: usize,
    name: String,
    mime_type: String,
    base64_data: String,
) -> Result<StagedHandoffImage, String> {
    if !valid_handoff_id(&handoff_id) {
        return Err("The image handoff identifier is invalid.".into());
    }
    if !(1..=5).contains(&index) {
        return Err("Image references must be numbered from 1 to 5.".into());
    }
    if base64_data.len() > MAX_ENCODED_BYTES {
        return Err("Each handoff image must be smaller than 8 MB.".into());
    }
    let extension = image_extension(&mime_type)?;
    let bytes = STANDARD
        .decode(base64_data)
        .map_err(|_| "The image data could not be decoded for handoff.".to_string())?;
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES || !matches_image_type(&bytes, &mime_type) {
        return Err("The image data does not match its PNG, JPEG, or WebP type.".into());
    }

    let root = handoff_root();
    fs::create_dir_all(&root).map_err(|_| "Could not prepare the temporary image handoff folder.".to_string())?;
    let folder = root.join(&handoff_id);
    fs::create_dir_all(&folder).map_err(|_| "Could not create the temporary image handoff folder.".to_string())?;
    clean_expired(&root, SystemTime::now(), &folder);

    let file_name = format!("reference-{index:02}-{}.{}", safe_stem(&name), extension);
    let path = folder.join(&file_name);
    fs::write(&path, bytes).map_err(|_| "Could not write a temporary image handoff file.".to_string())?;
    Ok(StagedHandoffImage {
        name: file_name,
        path: path.to_string_lossy().into_owned(),
    })
}

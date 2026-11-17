use std::str::FromStr;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::RuntimeState;

fn hidden_command(program: &str) -> Command {
    let command = Command::new(program);
    #[cfg(windows)]
    {
        let mut command = command;
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
        return command;
    }
    #[cfg(not(windows))]
    command
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessResource {
    pid: u32,
    name: String,
    ram_bytes: Option<u64>,
    vram_bytes: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSnapshot {
    sampled_at: String,
    ram_total_bytes: Option<u64>,
    ram_used_bytes: Option<u64>,
    gpu_name: Option<String>,
    vram_total_bytes: Option<u64>,
    vram_used_bytes: Option<u64>,
    processes: Vec<ProcessResource>,
    availability: ResourceAvailability,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResourceAvailability {
    ram: Option<String>,
    gpu: Option<String>,
    process_gpu: Option<String>,
}

#[cfg(windows)]
fn memory_status() -> Option<(u64, u64)> {
    #[repr(C)]
    struct MemoryStatusEx {
        length: u32,
        memory_load: u32,
        total_physical: u64,
        available_physical: u64,
        total_page_file: u64,
        available_page_file: u64,
        total_virtual: u64,
        available_virtual: u64,
        available_extended_virtual: u64,
    }
    #[link(name = "kernel32")]
    unsafe extern "system" { fn GlobalMemoryStatusEx(status: *mut MemoryStatusEx) -> i32; }
    let mut status = MemoryStatusEx { length: std::mem::size_of::<MemoryStatusEx>() as u32, memory_load: 0, total_physical: 0, available_physical: 0, total_page_file: 0, available_page_file: 0, total_virtual: 0, available_virtual: 0, available_extended_virtual: 0 };
    if unsafe { GlobalMemoryStatusEx(&mut status) } == 0 { return None; }
    Some((status.total_physical, status.total_physical.saturating_sub(status.available_physical)))
}

#[cfg(not(any(windows, target_os = "linux")))]
fn memory_status() -> Option<(u64, u64)> { None }

#[cfg(target_os = "linux")]
fn linux_memory_status() -> Option<(u64, u64)> {
    let contents = std::fs::read_to_string("/proc/meminfo").ok()?;
    let mut total_kb = None;
    let mut available_kb = None;
    for line in contents.lines() {
        let (key, value) = line.split_once(':')?;
        let amount = value.split_whitespace().next()?.parse::<u64>().ok()?;
        match key {
            "MemTotal" => total_kb = Some(amount),
            "MemAvailable" => available_kb = Some(amount),
            _ => {}
        }
        if total_kb.is_some() && available_kb.is_some() { break; }
    }
    let total = total_kb?.saturating_mul(1024);
    let available = available_kb?.saturating_mul(1024);
    Some((total, total.saturating_sub(available)))
}

fn csv_fields(line: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '"' if quoted && chars.peek() == Some(&'"') => { field.push('"'); chars.next(); }
            '"' => quoted = !quoted,
            ',' if !quoted => { fields.push(field.trim().to_owned()); field.clear(); }
            _ => field.push(ch),
        }
    }
    fields.push(field.trim().to_owned());
    fields
}

fn nvidia_output(args: &[&str]) -> Result<String, String> {
    let output = hidden_command("nvidia-smi").args(args).stdout(Stdio::piped()).stderr(Stdio::null()).output()
        .map_err(|_| "NVIDIA GPU counters unavailable (nvidia-smi was not found).".to_string())?;
    if !output.status.success() { return Err("NVIDIA GPU counters are unavailable from the installed driver.".into()); }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn gpu_resources() -> Result<(String, u64, u64, Vec<(u32, u64)>), String> {
    let summary = nvidia_output(&["--query-gpu=name,memory.total,memory.used", "--format=csv,noheader,nounits"])?;
    let row = summary.lines().next().ok_or_else(|| "GPU counters returned no adapters.".to_string())?;
    let fields = csv_fields(row);
    if fields.len() < 3 { return Err("GPU counters returned incomplete adapter data.".into()); }
    let total_mb = fields[1].parse::<u64>().map_err(|_| "GPU memory total was unavailable.".to_string())?;
    let used_mb = fields[2].parse::<u64>().map_err(|_| "GPU memory usage was unavailable.".to_string())?;
    let mut processes = Vec::new();
    if let Ok(output) = nvidia_output(&["--query-compute-apps=pid,used_gpu_memory", "--format=csv,noheader,nounits"]) {
        for line in output.lines() {
            let values = csv_fields(line);
            if values.len() >= 2 {
                if let (Ok(pid), Ok(mb)) = (values[0].parse::<u32>(), values[1].parse::<u64>()) { processes.push((pid, mb.saturating_mul(1024 * 1024))); }
            }
        }
    }
    Ok((fields[0].clone(), total_mb * 1024 * 1024, used_mb * 1024 * 1024, processes))
}

fn process_resources(gpu: &[(u32, u64)]) -> (Vec<ProcessResource>, Option<String>) {
    #[cfg(windows)]
    let output = hidden_command("tasklist").args(["/FO", "CSV", "/NH"]).stdout(Stdio::piped()).stderr(Stdio::null()).output();
    #[cfg(target_os = "linux")]
    let output = Command::new("ps").args(["-eo", "pid=,comm=,rss=", "--sort=-rss"]).stdout(Stdio::piped()).stderr(Stdio::null()).output();
    #[cfg(not(any(windows, target_os = "linux")))]
    let output: Result<std::process::Output, std::io::Error> = Err(std::io::Error::other("Windows process counters unavailable"));
    let Ok(output) = output else { return (Vec::new(), Some("Per-process RAM counters are unavailable.".into())); };
    let mut rows = Vec::new();
    #[cfg(windows)]
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let values = csv_fields(line);
        if values.len() < 5 { continue; }
        let (Ok(pid), Some(memory)) = (values[1].parse::<u32>(), values[4].split_whitespace().next().and_then(|value| value.replace(',', "").parse::<u64>().ok())) else { continue; };
        rows.push(ProcessResource { pid, name: values[0].clone(), ram_bytes: Some(memory.saturating_mul(1024)), vram_bytes: gpu.iter().find(|(gpu_pid, _)| *gpu_pid == pid).map(|(_, bytes)| *bytes) });
    }
    #[cfg(target_os = "linux")]
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let mut values = line.split_whitespace();
        let (Some(pid), Some(memory), Some(name)) = (values.next().and_then(|value| value.parse::<u32>().ok()), line.split_whitespace().last().and_then(|value| value.parse::<u64>().ok()), values.next()) else { continue; };
        rows.push(ProcessResource { pid, name: name.to_owned(), ram_bytes: Some(memory.saturating_mul(1024)), vram_bytes: gpu.iter().find(|(gpu_pid, _)| *gpu_pid == pid).map(|(_, bytes)| *bytes) });
    }
    rows.sort_by_key(|row| std::cmp::Reverse(row.ram_bytes.unwrap_or_default()));
    rows.truncate(30);
    (rows, None)
}

#[tauri::command]
pub fn system_resource_snapshot() -> ResourceSnapshot {
    let sampled_at = SystemTime::now().duration_since(UNIX_EPOCH).map(|duration| duration.as_millis().to_string()).unwrap_or_default();
    #[cfg(windows)]
    let ram = memory_status();
    #[cfg(target_os = "linux")]
    let ram = linux_memory_status();
    #[cfg(not(any(windows, target_os = "linux")))]
    let ram: Option<(u64, u64)> = memory_status();
    let gpu = gpu_resources();
    let gpu_processes = gpu.as_ref().map(|data| data.3.as_slice()).unwrap_or_default();
    let (processes, process_error) = process_resources(gpu_processes);
    ResourceSnapshot {
        sampled_at,
        ram_total_bytes: ram.map(|memory| memory.0),
        ram_used_bytes: ram.map(|memory| memory.1),
        gpu_name: gpu.as_ref().ok().map(|data| data.0.clone()),
        vram_total_bytes: gpu.as_ref().ok().map(|data| data.1),
        vram_used_bytes: gpu.as_ref().ok().map(|data| data.2),
        processes,
        availability: ResourceAvailability {
            ram: ram.is_none().then(|| "Physical memory counters are unavailable.".into()),
            gpu: gpu.as_ref().err().cloned(),
            process_gpu: process_error
                .or_else(|| gpu.as_ref().err().cloned())
                .or_else(|| gpu_processes.is_empty().then(|| "Per-process VRAM counters are unavailable for this driver or display mode.".into())),
        },
    }
}

#[tauri::command]
pub fn clipboard_write_text(app: AppHandle, text: String) -> Result<(), String> {
    if text.len() > 16 * 1024 * 1024 {
        return Err("Clipboard text must be smaller than 16 MB.".into());
    }
    app.clipboard()
        .write_text(text)
        .map_err(|_| "Could not write to the system clipboard.".into())
}

#[tauri::command]
pub fn set_global_shortcut(
    app: AppHandle,
    state: State<'_, RuntimeState>,
    shortcut: String,
) -> Result<(), String> {
    let shortcut = Shortcut::from_str(shortcut.trim())
        .map_err(|_| "Shortcut format is invalid. Use modifier+key, such as Alt+Space.".to_string())?;
    let mut registered = state
        .shortcut
        .lock()
        .map_err(|_| "Shortcut state is unavailable.".to_string())?;
    if registered.as_ref() == Some(&shortcut) {
        return Ok(());
    }
    app.global_shortcut()
        .register(shortcut.clone())
        .map_err(|error| format!("Could not register this global shortcut: {error}"))?;
    if let Some(previous) = registered.as_ref() {
        if app.global_shortcut().unregister(previous.clone()).is_err() {
            let _ = app.global_shortcut().unregister(shortcut.clone());
            return Err("Could not release the previous global shortcut.".into());
        }
    }
    *registered = Some(shortcut);
    Ok(())
}

#[tauri::command]
pub fn window_minimize(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|_| "Could not minimize the Lunaris window.".into())
}

#[tauri::command]
pub fn window_toggle_maximize(window: tauri::WebviewWindow) -> Result<bool, String> {
    if window
        .is_maximized()
        .map_err(|_| "Could not read window state.".to_string())?
    {
        window
            .unmaximize()
            .map_err(|_| "Could not restore the Lunaris window.".to_string())?;
        Ok(false)
    } else {
        window
            .maximize()
            .map_err(|_| "Could not maximize the Lunaris window.".to_string())?;
        Ok(true)
    }
}

#[tauri::command]
pub fn window_close(window: tauri::WebviewWindow) -> Result<(), String> {
    window.close().map_err(|_| "Could not close the Lunaris window.".into())
}

#[tauri::command]
pub fn window_is_maximized(window: tauri::WebviewWindow) -> Result<bool, String> {
    window
        .is_maximized()
        .map_err(|_| "Could not read window state.".into())
}

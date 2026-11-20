// No console ("cmd") window in release builds: without this the Rust
// binary runs as a console-subsystem app, Windows shows a cmd window,
// and closing it kills the whole app. Debug keeps the console.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! SMAILWOLF M3 Pro Driver — Tauri 2 shell (Windows-only).
//!
//! The Rust backend owns ONLY: fixed main window, system tray + tray popup,
//! autostart, JSON persistence, native notifications.
//! HID stays in the frontend (WebHID via WebView2) — this backend never
//! touches the mouse protocol. Protocol bytes in `src/lib/hid.ts` are
//! live-proven and must not change.

mod store;

use std::sync::Mutex;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WindowEvent};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

/// Design size the UI is built for. The window is this big on large
/// screens and scales DOWN to fit smaller monitors — never fullscreen,
/// always a floating rectangle (Ethan's hard rule).
/// v3.0.5: 16:9 (1280x720) — the old 1280x1024 was 5:4, nearly square;
/// Ethan wants a proper wide rectangle (x720, landscape — NOT portrait).
const DESIGN_W: f64 = 1280.0;
const DESIGN_H: f64 = 720.0;
/// Smallest the window may shrink to (scale 0.5 -> 640x360). Below that
/// the UI would be unreadable; the window just fits as well as it can.
const MIN_SCALE: f64 = 0.5;
/// Horizontal margin so the fitted window isn't flush to the screen edges.
const EDGE_MARGIN: f64 = 16.0;
/// Tray popup size (must match `tray-popup` in tauri.conf.json).
const POPUP_W: u32 = 300;
const POPUP_H: u32 = 240;
const POPUP_MARGIN: i32 = 8;
/// Approx. Windows taskbar height, so the popup sits just above it.
const TASKBAR_RESERVE: i32 = 48;

/// Low-battery notification body (exact wording Ethan specified).
const LOW_BATTERY_BODY: &str = "Your mouse has 20% battery left, please charge it";

/// Fit scale for the primary monitor: the largest scale (<= 1) that fits
/// the design size inside the monitor's work area (taskbar reserved).
/// Returns 1.0 when the monitor is big enough or can't be read.
fn fit_scale(app: &tauri::AppHandle) -> f64 {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return 1.0;
    };
    let sf = monitor.scale_factor();
    if sf <= 0.0 {
        return 1.0;
    }
    let size = monitor.size();
    let avail_w = size.width as f64 / sf - EDGE_MARGIN * 2.0;
    let avail_h = size.height as f64 / sf - TASKBAR_RESERVE as f64 - EDGE_MARGIN;
    (avail_w / DESIGN_W)
        .min(avail_h / DESIGN_H)
        .min(1.0)
        .clamp(MIN_SCALE, 1.0)
}

/// Size the main window to the fitted size and lock it there
/// (min = max = fitted, no resize/maximize). Only touches the window when
/// the size actually changed, so focus re-fits never flicker. Returns the
/// scale used. `center_window` only on the initial fit — re-fits must not
/// yank a window the user dragged somewhere.
fn fit_main_window(app: &tauri::AppHandle, center_window: bool) -> f64 {
    let scale = fit_scale(app);
    let Some(main) = app.get_webview_window("main") else {
        return scale;
    };
    let w = (DESIGN_W * scale).round();
    let h = (DESIGN_H * scale).round();
    let sf = main.scale_factor().unwrap_or(1.0);
    let cur = main
        .inner_size()
        .map(|s| s.to_logical::<f64>(sf))
        .ok();
    let needs_resize = cur
        .map(|s| (s.width - w).abs() > 2.0 || (s.height - h).abs() > 2.0)
        .unwrap_or(true);
    if needs_resize {
        // Tauri 2.12 has NO set_inner_size: set_size sizes the OUTER
        // window (decorations included), while set_min/max_size are
        // INNER sizes (verified in tauri 2.12.5 source). Measure the
        // decoration delta (outer - inner) and add it to the fitted
        // content size, so the CONTENT area ends up exactly fitted.
        // Fallback (delta unreadable): use the fitted size as the outer
        // size — the frontend zoom still fits the content, just with a
        // small margin.
        let delta = (|| {
            let outer = main.outer_size().ok()?.to_logical::<f64>(sf);
            let inner = main.inner_size().ok()?.to_logical::<f64>(sf);
            Some((outer.width - inner.width, outer.height - inner.height))
        })()
        .unwrap_or((0.0, 0.0));
        let outer_w = (w + delta.0).round();
        let outer_h = (h + delta.1).round();
        let size = Some(Size::Logical(LogicalSize::new(w, h)));
        let _ = main.set_min_size(size);
        let _ = main.set_max_size(size);
        let _ = main.set_size(Size::Logical(LogicalSize::new(outer_w, outer_h)));
        if center_window {
            let _ = main.center();
        }
    }
    scale
}

// ---------------------------------------------------------------------------
// Autostart (tauri-plugin-autostart v2)
// ---------------------------------------------------------------------------

/// Current autostart state (Windows: Run registry key via the plugin).
#[tauri::command]
fn autostart_get(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch()
        .is_enabled()
        .map_err(|e| format!("autostart check failed: {e}"))
}

/// Turn autostart on/off. Called by the Other-section toggle (later workstream).
#[tauri::command]
fn autostart_set(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let launcher = app.autolaunch();
    if enabled {
        launcher
            .enable()
            .map_err(|e| format!("autostart enable failed: {e}"))
    } else {
        launcher
            .disable()
            .map_err(|e| format!("autostart disable failed: {e}"))
    }
}

// ---------------------------------------------------------------------------
// Native notification
// ---------------------------------------------------------------------------

/// Fire the Windows low-battery notification (called by the battery workstream).
#[tauri::command]
fn notify_low_battery(app: tauri::AppHandle) -> Result<(), String> {
    app.notification()
        .builder()
        .title("Low mouse battery")
        .body(LOW_BATTERY_BODY)
        .show()
        .map_err(|e| format!("notification failed: {e}"))
}

// ---------------------------------------------------------------------------
// Tray actions (also callable from the tray popup frontend)
// ---------------------------------------------------------------------------

/// Show + focus the main window (tray left-click / "Open interface" button).
#[tauri::command]
fn tray_show_main(app: tauri::AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or("main window not found")?;
    win.unminimize()
        .map_err(|e| format!("unminimize failed: {e}"))?;
    win.show().map_err(|e| format!("show failed: {e}"))?;
    win.set_focus().map_err(|e| format!("focus failed: {e}"))?;
    Ok(())
}

/// Quit the whole app ("Quit app" button).
#[tauri::command]
fn tray_quit(app: tauri::AppHandle) {
    app.exit(0);
}

// ---------------------------------------------------------------------------
// Self-update (v3.0.9 — silent in-client updater, redesign 2026-11-19 §n)
// ---------------------------------------------------------------------------

/// Progress event payload, emitted as `update-progress` while downloading.
/// `total` is 0 when the server sent no Content-Length.
#[derive(Clone, serde::Serialize)]
struct UpdateProgress {
    downloaded: u64,
    total: u64,
}

/// Result of a finished download: where the installer is cached on disk.
#[derive(serde::Serialize)]
struct UpdateDownloaded {
    path: String,
    size: u64,
    cached: bool,
}

/// Where finished downloads live: %LOCALAPPDATA%\<identifier>\updates\.
/// Ethan's rule: Close = no update, the file stays cached here.
fn updates_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("local data dir unavailable: {e}"))?
        .join("updates");
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create updates dir: {e}"))?;
    Ok(dir)
}

/// A setup is real only if it is at least 1 MB — anything tiny is an error
/// page that got saved instead of the installer (same guard as v3.0.6).
const MIN_SETUP_BYTES: u64 = 1_000_000;

/// Delete a file or directory tree, ignoring every individual failure.
/// The running WebView2 profile holds locks on some files, so a strict
/// remove_dir_all would stop at the first locked file and leave the rest.
/// Best effort removes the most it can; the new installer replaces program
/// files + shortcuts on top.
fn remove_best_effort(path: &std::path::Path) {
    if path.is_symlink() || path.is_file() {
        let _ = std::fs::remove_file(path);
        return;
    }
    if path.is_dir() {
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                remove_best_effort(&entry.path());
            }
        }
        let _ = std::fs::remove_dir(path);
    }
}

/// Silent in-client download (replaces v3.0.6's curl.exe — the CMD window
/// Ethan saw during updates came from curl). Runs in-process with reqwest's
/// blocking client, streams the file to the %LOCALAPPDATA% cache in 64 KB
/// reads, and emits `update-progress` events so the frontend progress bar
/// moves with the real download. Sync fn: Tauri runs it on its thread pool,
/// so the blocking download is fine.
/// If the exact installer file is already cached (same version = same
/// filename) and passes the size check, it returns immediately without
/// re-downloading — Close-then-reopen is instant.
#[tauri::command]
fn download_update(app: tauri::AppHandle, url: String, filename: String) -> Result<UpdateDownloaded, String> {
    use std::io::{Read, Write};
    if filename.contains(['/', '\\']) || filename == ".." || filename.is_empty() {
        return Err("Invalid installer file name.".to_string());
    }
    let dir = updates_dir(&app)?;
    let dest = dir.join(&filename);
    if let Ok(meta) = std::fs::metadata(&dest) {
        if meta.len() >= MIN_SETUP_BYTES {
            return Ok(UpdateDownloaded {
                path: dest.to_string_lossy().into_owned(),
                size: meta.len(),
                cached: true,
            });
        }
        let _ = std::fs::remove_file(&dest);
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(900))
        .build()
        .map_err(|e| format!("Could not start the download: {e}"))?;
    let mut resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("Download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download failed: the server answered {}.", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);
    let mut file =
        std::fs::File::create(&dest).map_err(|e| format!("Could not save the download: {e}"))?;
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    let mut buf = [0u8; 65536];
    loop {
        match resp.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                if let Err(e) = file.write_all(&buf[..n]) {
                    drop(file);
                    let _ = std::fs::remove_file(&dest);
                    return Err(format!("Could not save the download: {e}"));
                }
                downloaded += n as u64;
                // Emit at most every 512 KB (or at 100%) so the frontend
                // isn't flooded with an event per 64 KB read.
                if downloaded - last_emit >= 512 * 1024 || (total > 0 && downloaded >= total) {
                    last_emit = downloaded;
                    let _ = app.emit("update-progress", UpdateProgress { downloaded, total });
                }
            }
            Err(e) => {
                drop(file);
                let _ = std::fs::remove_file(&dest);
                return Err(format!("Download failed: {e}"));
            }
        }
    }
    drop(file);
    let _ = app.emit("update-progress", UpdateProgress { downloaded, total });
    let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    if size < MIN_SETUP_BYTES {
        let _ = std::fs::remove_file(&dest);
        return Err(format!(
            "Downloaded file is only {size} bytes — the link may have changed, retry or open on GitHub."
        ));
    }
    // Prune cached installers of OTHER versions so the cache never piles up.
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file()
                && p != dest
                && p.file_name()
                    .map(|n| n.to_string_lossy().ends_with("-setup.exe"))
                    .unwrap_or(false)
            {
                let _ = std::fs::remove_file(&p);
            }
        }
    }
    Ok(UpdateDownloaded {
        path: dest.to_string_lossy().into_owned(),
        size,
        cached: false,
    })
}

/// Finish the update after the download: wipe the old client data when the
/// user confirmed (Ethan's "XÁC NHẬN"), then launch the new installer and
/// quit this process entirely so the installer can replace the running exe.
/// The installer is spawned with CREATE_NO_WINDOW on Windows — no console
/// window, ever. On success this never returns (app.exit ends the process).
/// Wipe scope: the whole app-data dir (store.json — battery state, flags)
/// plus everything under the local-data dir EXCEPT updates/ (the installer
/// itself lives there). Locked WebView2 profile files may survive the wipe
/// — they are inert cache; the new install starts with fresh settings from
/// the wiped store, and the installer replaces program files + shortcuts.
#[tauri::command]
fn finish_update(app: tauri::AppHandle, filename: String, wipe: bool) -> Result<(), String> {
    if filename.contains(['/', '\\']) || filename == ".." || filename.is_empty() {
        return Err("Invalid installer file name.".to_string());
    }
    let installer = updates_dir(&app)?.join(&filename);
    if !installer.is_file() {
        return Err("Downloaded installer not found — download it again.".to_string());
    }
    if wipe {
        if let Ok(dir) = app.path().app_data_dir() {
            remove_best_effort(&dir);
        }
        if let Ok(dir) = app.path().app_local_data_dir() {
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    if entry.file_name() == "updates" {
                        continue;
                    }
                    remove_best_effort(&entry.path());
                }
            }
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new(&installer)
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|e| format!("Could not open the installer: {e}"))?;
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new(&installer)
            .spawn()
            .map_err(|e| format!("Could not open the installer: {e}"))?;
    }
    app.exit(0);
    Ok(())
}

// ---------------------------------------------------------------------------
// Tray popup positioning
// ---------------------------------------------------------------------------

/// Bottom-right of the primary monitor, just above the taskbar.
fn popup_position(app: &tauri::AppHandle) -> Position {
    let fallback = Position::Physical(PhysicalPosition::new(0, 0));
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return fallback;
    };
    let size = monitor.size();
    let pos = monitor.position();
    let x = pos.x + size.width as i32 - POPUP_W as i32 - POPUP_MARGIN;
    let y = pos.y + size.height as i32 - POPUP_H as i32 - POPUP_MARGIN - TASKBAR_RESERVE;
    Position::Physical(PhysicalPosition::new(x.max(pos.x), y.max(pos.y)))
}

fn show_tray_popup(app: &tauri::AppHandle) {
    let Some(popup) = app.get_webview_window("tray-popup") else {
        return;
    };
    if let Err(e) = popup.set_position(popup_position(app)) {
        eprintln!("[tray] set_position failed: {e}");
    }
    let _ = popup.show();
    let _ = popup.set_focus();
}

fn main() {
    tauri::Builder::default()
        // Single instance: a second launch (double-click, installer
        // auto-run, autostart) focuses the existing window instead of
        // opening a duplicate main window.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_notification::init())
        .manage(store::StoreLock(Mutex::new(())))
        .invoke_handler(tauri::generate_handler![
            autostart_get,
            autostart_set,
            store::store_get,
            store::store_set,
            notify_low_battery,
            tray_show_main,
            tray_quit,
            download_update,
            finish_update,
        ])
        .setup(|app| {
            // --- Adaptive main window (v3.0.3): fit the design size to
            //     the monitor — 1280x720 on big screens, scaled down on
            //     smaller laptops. NEVER fullscreen: always a floating
            //     rectangle. The window starts hidden (tauri.conf.json)
            //     so a small screen never flashes the full-size frame.
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_resizable(false);
                let _ = main.set_maximizable(false);
                fit_main_window(app.handle(), true);
                // Close button hides to tray instead of quitting, so the
                // tray icon stays alive; real quit is via the tray popup.
                let win = main.clone();
                let app_handle = app.handle().clone();
                main.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        let _ = win.hide();
                    }
                    // Monitor changed (resolution / DPI / moved to another
                    // screen): re-fit immediately so the frame always fits.
                    WindowEvent::ScaleFactorChanged { .. } => {
                        fit_main_window(&app_handle, false);
                    }
                    WindowEvent::Focused(true) => {
                        fit_main_window(&app_handle, false);
                    }
                    _ => {}
                });
                let _ = main.show();
            }

            // --- Tray popup: auto-hide when it loses focus.
            if let Some(popup) = app.get_webview_window("tray-popup") {
                let win = popup.clone();
                popup.on_window_event(move |event| {
                    if let WindowEvent::Focused(false) = event {
                        let _ = win.hide();
                    }
                });
            }

            // --- Autostart default ON (Ethan: "open automatically when the PC
            //     starts"). Enabled once, on first run only — afterwards the
            //     user's toggle choice is respected, never overwritten.
            let app_handle = app.handle().clone();
            if store::get_value(&app_handle, "autostart-initialized-v1").is_none() {
                if let Err(e) = app_handle.autolaunch().enable() {
                    eprintln!("[autostart] first-run enable failed: {e}");
                }
                let _ = store::set_value(&app_handle, "autostart-initialized-v1", "1".to_string());
            }

            // --- System tray icon (neon brand logo).
            let icon = app
                .default_window_icon()
                .cloned()
                .expect("app icon missing — check src-tauri/icons");
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .tooltip("SMAILWOLF M3 Pro Driver")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let _ = tray_show_main(tray.app_handle().clone());
                    }
                    TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } => {
                        let _ = tray_show_main(tray.app_handle().clone());
                    }
                    // Right-click opens the custom tray popup window
                    // (not a native menu) near the system tray.
                    TrayIconEvent::Click {
                        button: MouseButton::Right,
                        button_state: MouseButtonState::Up,
                        ..
                    } => show_tray_popup(tray.app_handle()),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

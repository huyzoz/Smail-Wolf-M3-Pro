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
use tauri::{LogicalSize, Manager, PhysicalPosition, Position, Size, WindowEvent};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_notification::NotificationExt;

/// Fixed main-window size — absolute, no resize, no maximize.
const MAIN_W: f64 = 1280.0;
const MAIN_H: f64 = 1024.0;
/// Tray popup size (must match `tray-popup` in tauri.conf.json).
const POPUP_W: u32 = 300;
const POPUP_H: u32 = 240;
const POPUP_MARGIN: i32 = 8;
/// Approx. Windows taskbar height, so the popup sits just above it.
const TASKBAR_RESERVE: i32 = 48;

/// Low-battery notification body (exact wording Ethan specified).
const LOW_BATTERY_BODY: &str = "Chuột của bạn còn 20% pin, vui lòng sạc pin";

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
        .title("Pin chuột yếu")
        .body(LOW_BATTERY_BODY)
        .show()
        .map_err(|e| format!("notification failed: {e}"))
}

// ---------------------------------------------------------------------------
// Tray actions (also callable from the tray popup frontend)
// ---------------------------------------------------------------------------

/// Show + focus the main window (tray left-click / "Mở giao diện" button).
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

/// Quit the whole app ("Thoát chương trình" button).
#[tauri::command]
fn tray_quit(app: tauri::AppHandle) {
    app.exit(0);
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
        ])
        .setup(|app| {
            // --- Fixed main window: enforce at runtime too (belt + braces
            //     with tauri.conf.json min/max + resizable/maximizable false).
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_resizable(false);
                let _ = main.set_maximizable(false);
                let fixed = Some(Size::Logical(LogicalSize::new(MAIN_W, MAIN_H)));
                let _ = main.set_min_size(fixed);
                let _ = main.set_max_size(fixed);
                // Close button hides to tray instead of quitting, so the
                // tray icon stays alive; real quit is via the tray popup.
                let win = main.clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.hide();
                    }
                });
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

            // --- Autostart default ON (Ethan: "tự động mở khi máy khởi
            //     động"). Enabled once, on first run only — afterwards the
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

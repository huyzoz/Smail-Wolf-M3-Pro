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
const LOW_BATTERY_BODY: &str = "Chuột của bạn còn 20% pin, vui lòng sạc pin";

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

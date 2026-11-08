/**
 * Tauri bridge — src/lib/tauri.ts
 *
 * Thin typed wrappers around the Rust commands registered in
 * `src-tauri/src/main.rs` / `src-tauri/src/store.rs`.
 *
 * Every function is safe to call in web dev mode: when NOT running under
 * Tauri, store calls fall back to localStorage and the rest become no-ops
 * (returning sensible defaults) instead of crashing.
 */

import { invoke } from '@tauri-apps/api/core';

/** True only inside the Tauri WebView2 shell (not in `npm run dev` browser). */
export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  );
}

// ---------------------------------------------------------------------------
// Autostart — Rust commands: autostart_get() -> bool,
// autostart_set(enabled: bool) -> ()
// Default ON (first run enables it in Rust setup; the Other-section toggle
// will call autostart_set and this getter to reflect state).
// ---------------------------------------------------------------------------

export async function autostartGet(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>('autostart_get');
}

export async function autostartSet(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  await invoke('autostart_set', { enabled });
}

// ---------------------------------------------------------------------------
// Key/value store — Rust commands: store_get(key) -> string | null,
// store_set(key, value) -> (). Backed by store.json in the Tauri app-data
// dir; localStorage fallback when running in a plain browser.
// ---------------------------------------------------------------------------

export async function storeGet(key: string): Promise<string | null> {
  if (!isTauri()) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return invoke<string | null>('store_get', { key });
}

export async function storeSet(key: string, value: string): Promise<void> {
  if (!isTauri()) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable — ignore */
    }
    return;
  }
  await invoke('store_set', { key, value });
}

// ---------------------------------------------------------------------------
// Battery state — CONTRACT (do not change key/shape; the battery workstream
// depends on it). Key: "battery-state-v1".
// Shape: { remaining_mah, last_polling_rate, updated_at (unix seconds),
//          charging, low_notified, saver }
// Usable capacity is 400 mAh (500 mAh cell x 0.8 efficiency) — see
// TrayPopupPage for the % derivation.
// ---------------------------------------------------------------------------

export const BATTERY_STATE_KEY = 'battery-state-v1';
/** Usable capacity (mAh) the % is computed from. */
export const BATTERY_USABLE_MAH = 400;

export interface BatteryState {
  remaining_mah: number;
  last_polling_rate: number;
  updated_at: number;
  charging: boolean;
  low_notified: boolean;
  saver: boolean;
}

export async function getBatteryState(): Promise<BatteryState | null> {
  const raw = await storeGet(BATTERY_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BatteryState;
  } catch {
    return null;
  }
}

export async function setBatteryState(state: BatteryState): Promise<void> {
  await storeSet(BATTERY_STATE_KEY, JSON.stringify(state));
}

/** Battery % from stored state; 100 when no state exists yet. */
export function batteryPercent(state: BatteryState | null): number {
  if (!state) return 100;
  return Math.max(0, Math.min(100, Math.round((state.remaining_mah / BATTERY_USABLE_MAH) * 100)));
}

/** Battery % with 1 decimal — display only, so the drain is visible (see battery.ts percentOfPrecise). */
export function batteryPercentPrecise(state: BatteryState | null): number {
  if (!state) return 100;
  return Math.max(0, Math.min(100, Math.round((state.remaining_mah / BATTERY_USABLE_MAH) * 1000) / 10));
}

// ---------------------------------------------------------------------------
// Native notification — Rust command: notify_low_battery() -> ()
// Fires the Windows notification "Chuột của bạn còn 20% pin, vui lòng sạc pin".
// Called by the battery workstream, not by UI code directly.
// ---------------------------------------------------------------------------

export async function notifyLowBattery(): Promise<void> {
  if (!isTauri()) return;
  await invoke('notify_low_battery');
}

// ---------------------------------------------------------------------------
// Tray actions — Rust commands: tray_show_main() -> (), tray_quit() -> ()
// ---------------------------------------------------------------------------

/** Show + focus the main window (tray left-click / "Mở giao diện"). */
export async function trayShowMain(): Promise<void> {
  if (!isTauri()) return;
  await invoke('tray_show_main');
}

/** Quit the whole app ("Thoát chương trình"). */
export async function trayQuit(): Promise<void> {
  if (!isTauri()) return;
  await invoke('tray_quit');
}

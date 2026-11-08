/**
 * Pin (mô phỏng) — src/lib/battery.ts
 *
 * PURE logic, no UI, no storage, no HID. The firmware reports only a
 * coarse 100%-until-low value (report 48) and the mouse has NO fuel-gauge
 * chip — the LED is the only true indicator. So the % shown anywhere in
 * this app is an HONEST ESTIMATE, always labelled "ước tính", never
 * presented as a hardware reading.
 *
 * Model (from the measured protocol + Ethan's live readings):
 * - Cell 500 mAh, usable 400 mAh (efficiency 0.8).
 * - Drain by polling rate (measured live): 125 Hz → 3 mA, 250 Hz → 5 mA,
 *   500 Hz → 8 mA, 1000 Hz → 14 mA.
 * - Runtime = 400 / current: 133.3 h / 80 h / 50 h / 28.6 h.
 * - Charging (wired, VID 43172): see CHARGE_MA assumption below.
 *
 * Persistence: state lives under key "battery-state-v1" (see tauri.ts).
 * The % is NEVER reset to 100% or 0% on restart/reboot — on load, the
 * elapsed real time since `updated_at` is applied (drain or charge) and
 * the resulting value shows immediately.
 */
import { POLLING_24G, POLLING_WIRED } from './hid';
import type { BatteryState } from './tauri';

export type { BatteryState };

/** Cell capacity as printed on the battery. */
export const CAPACITY_MAH = 500;
/** Usable capacity: 500 mAh x 0.8 efficiency. % = remaining / 400. */
export const USABLE_MAH = 400;
/** Drain current (mA) by polling rate (Hz). */
export const DRAIN_MA: Record<number, number> = {
  125: 3,
  250: 5,
  500: 8,
  1000: 14,
};
/**
 * CHARGE ASSUMPTION (documented, not measured): wired charging is assumed
 * at 150 mA (0.3C of the 500 mAh cell). A full usable charge (0 → 400 mAh)
 * therefore takes ~2.7 h (400 / 150). The real charge current was never
 * measured — the firmware reports no charge current, and the charge flag
 * (report 48 byte 8) stayed 0 even while the LED showed solid red charging.
 * If Ethan ever measures a real charge time, update this one constant.
 */
export const CHARGE_MA = 150;
/** % at/below which the low-battery notification fires (once per cycle). */
export const LOW_PCT = 20;
/** % above which the low-battery flag resets (hysteresis, avoids flapping). */
export const LOW_RESET_PCT = 25;
/** Persist at most this often during the 1 s tick (seconds). */
export const PERSIST_EVERY_S = 10;

/** Polling rate (Hz) for a report-rate index on the given transport. */
export function rateHz(index: number, isWired: boolean): number {
  const list = isWired ? POLLING_WIRED : POLLING_24G;
  return list[index] ?? list[0] ?? 125;
}

/** Report-rate index for a polling rate on the given transport. */
export function indexForHz(hz: number, isWired: boolean): number {
  const list = isWired ? POLLING_WIRED : POLLING_24G;
  const i = list.indexOf(hz);
  return i >= 0 ? i : list.length - 1;
}

/** Drain current (mA) at a polling rate; unknown rates fall back to 1000 Hz. */
export function drainMaAt(hz: number): number {
  return DRAIN_MA[hz] ?? DRAIN_MA[1000] ?? 14;
}

/** Estimated runtime (hours) from a full usable charge at a polling rate. */
export function runtimeHours(hz: number): number {
  return USABLE_MAH / drainMaAt(hz);
}

/** % (0–100, rounded) from a state. */
export function percentOf(state: BatteryState | null): number {
  if (!state) return 100;
  return Math.max(0, Math.min(100, Math.round((state.remaining_mah / USABLE_MAH) * 100)));
}

/**
 * % with 1 decimal (0–100.0) — for DISPLAY only, so the drain is actually
 * visible: at 125 Hz (3 mA) the % drops 0.1 every ~8 min, 1 mAh every
 * ~20 min. The integer % would sit at 100% for the first 13 hours.
 * Logic (low-battery threshold, saver) keeps using integer percentOf.
 */
export function percentOfPrecise(state: BatteryState | null): number {
  if (!state) return 100;
  return Math.max(0, Math.min(100, Math.round((state.remaining_mah / USABLE_MAH) * 1000) / 10));
}

/** Fresh state: full usable charge. Used ONLY on first run (no saved state). */
export function defaultState(nowSeconds: number, pollingRateHz = 125): BatteryState {
  return {
    remaining_mah: USABLE_MAH,
    last_polling_rate: pollingRateHz,
    updated_at: nowSeconds,
    charging: false,
    low_notified: false,
    saver: false,
  };
}

function clampMah(mah: number): number {
  return Math.max(0, Math.min(USABLE_MAH, mah));
}

/**
 * Drain `seconds` at `pollingRateHz`: remaining -= current/3600 mAh per s.
 * `updated_at` advances by `seconds` so elapsed-time accounting stays exact.
 * Pure — returns a new state, never mutates.
 */
export function tick(
  state: BatteryState,
  seconds: number,
  pollingRateHz: number,
): BatteryState {
  if (seconds <= 0) return { ...state };
  const drain = (drainMaAt(pollingRateHz) * seconds) / 3600;
  return {
    ...state,
    remaining_mah: clampMah(state.remaining_mah - drain),
    last_polling_rate: pollingRateHz,
    updated_at: state.updated_at + seconds,
  };
}

/**
 * Charge `seconds` at CHARGE_MA (150 mA): remaining += 150/3600 mAh per s,
 * capped at 400 mAh. Pure — returns a new state, never mutates.
 */
export function chargeTick(state: BatteryState, seconds: number): BatteryState {
  if (seconds <= 0) return { ...state };
  const gain = (CHARGE_MA * seconds) / 3600;
  return {
    ...state,
    remaining_mah: clampMah(state.remaining_mah + gain),
    updated_at: state.updated_at + seconds,
  };
}

/**
 * On startup, apply the real time elapsed since `updated_at`:
 * - saved charging=true → assume it KEPT charging at 150 mA the whole
 *   time the app was closed (until full, capped at 400 mAh). This is an
 *   assumption: the app cannot know whether the cable stayed plugged in
 *   while it was closed; it only knows the mouse was wired when it last
 *   ran. If the cable was unplugged, the % will read high until the next
 *   drain catches up — the "ước tính" label is there for exactly this.
 * - discharging → drain the elapsed seconds at `last_polling_rate`.
 * The result is NEVER reset to 100% or 0%: a saved 80% stays ~80%
 * (minus/plus only the elapsed-time change).
 */
export function loadWithElapsed(
  saved: BatteryState,
  nowSeconds: number,
): BatteryState {
  const elapsed = Math.max(0, nowSeconds - saved.updated_at);
  if (elapsed === 0) return { ...saved };
  if (saved.charging) return chargeTick(saved, elapsed);
  return tick(saved, elapsed, saved.last_polling_rate);
}

/**
 * Should the low-battery notification fire on this tick?
 * Fires only on a DOWNWARD crossing of 20% and only once per discharge
 * cycle (`low_notified` gates it). Callers reset `low_notified` when
 * charging starts or % rises above 25%.
 */
export function shouldNotifyLow(
  prevPct: number,
  nextPct: number,
  state: BatteryState,
): boolean {
  return prevPct > LOW_PCT && nextPct <= LOW_PCT && !state.low_notified;
}

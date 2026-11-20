/**
 * TrayPopupPage — the custom tray popup window (Tauri label "tray-popup",
 * opened by right-clicking the tray icon). Rendered via the `?tray=1`
 * branch in src/main.tsx; it is a SEPARATE window from the main app, so
 * it has no MouseProvider — it reads the persisted `battery-state-v1`
 * store every 1 s and applies elapsed time in-memory (display only, no
 * writes) so the % keeps moving even while this popup is open.
 *
 * v3.1: real simulated % (see src/lib/battery.ts) + "estimated" label.
 * Yellow bar when battery saver is on. Layout unchanged: iOS-style bar
 * with % inside, "Open interface" / separator / "Quit app".
 *
 * Design: navy #17172B + paper text + orange #EA580C (design system tokens
 * from index.css). 44px touch targets, real press feedback (150ms, never
 * instant), reduced-motion respected, NO dimming anywhere.
 */
import { useEffect, useState } from 'react';
import {
  batteryPercentPrecise,
  getBatteryState,
  trayQuit,
  trayShowMain,
  type BatteryState,
} from '../lib/tauri';
import { loadWithElapsed, drainMaAt, runtimeHours } from '../lib/battery';

const LOW_PCT = 20;

export default function TrayPopupPage() {
  const [state, setState] = useState<BatteryState | null>(null);

  // Read persisted state on mount + every 1 s; apply elapsed time
  // in-memory so the displayed % tracks drain/charge while open.
  useEffect(() => {
    let alive = true;
    const refresh = (): void => {
      void getBatteryState().then((s) => {
        if (!alive) return;
        setState(s ? loadWithElapsed(s, Math.floor(Date.now() / 1000)) : null);
      });
    };
    refresh();
    const id = setInterval(refresh, 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const pct = batteryPercentPrecise(state);
  const pctInt = Math.round(pct);
  const low = pctInt <= LOW_PCT;
  const charging = state?.charging ?? false;
  const saver = state?.saver ?? false;
  const hz = state?.last_polling_rate ?? 125;
  const rateLine = state
    ? charging
      ? `Charging +150 mA · ${state.remaining_mah.toFixed(1)} mAh`
      : `−${drainMaAt(hz)} mA · ${state.remaining_mah.toFixed(1)} mAh left · ≈${Math.round(runtimeHours(hz) * (pct / 100))} h`
    : 'No battery data yet — showing the default 100%';

  return (
    <div
      className="flex h-screen w-screen flex-col justify-between p-3"
      style={{ background: 'var(--navy)', color: 'var(--paper-on-navy)' }}
      role="dialog"
      aria-label="SMAILWOLF M3 Pro — mouse battery"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-display text-base font-semibold tracking-wide">
          SMAILWOLF M3 PRO
        </span>
        <span
          className="rounded-full px-2 py-1 text-xs font-semibold"
          style={{
            background: charging ? 'var(--ok)' : low ? 'var(--danger)' : saver ? '#eab308' : 'var(--accent)',
            color: '#ffffff',
          }}
        >
          {charging ? 'Charging' : low ? 'Low battery' : saver ? 'Battery saver' : 'Mouse battery'}
        </span>
      </div>

      {/* iOS-style battery bar — % INSIDE the bar (1 decimal so you can see the battery drop) */}
      <div className="flex flex-col gap-1.5">
        <div
          className="relative h-10 w-full overflow-hidden rounded-xl border-2"
          style={{ borderColor: 'var(--line-navy)', background: 'var(--navy-2)' }}
          role="progressbar"
          aria-valuenow={pctInt}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Mouse battery ${pct.toFixed(1)} percent (estimated)`}
        >
          <div
            className="h-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{
              width: `${pct}%`,
              background: low ? 'var(--danger)' : saver ? '#eab308' : 'var(--accent)',
            }}
          />
          <span className="font-display absolute inset-0 flex items-center justify-center text-lg font-semibold tracking-wider text-white">
            {pct.toFixed(1)}%
          </span>
        </div>
        <p className="text-center text-xs" style={{ color: 'var(--muted-on-navy)' }}>
          {rateLine} · estimated
        </p>
      </div>

      {/* Actions — 44px targets, visible press feedback, no dimming */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void trayShowMain()}
          className="font-display min-h-[44px] w-full rounded-xl text-base font-semibold tracking-wide transition-transform duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none"
          style={{ background: 'var(--accent)', color: '#ffffff' }}
        >
          Open interface
        </button>
        <div
          className="mx-2 h-px"
          style={{ background: 'var(--line-navy)' }}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={() => void trayQuit()}
          className="min-h-[44px] w-full rounded-xl text-base font-medium transition-transform duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none"
          style={{ background: 'var(--navy-3)', color: 'var(--paper-on-navy)' }}
        >
          Quit app
        </button>
      </div>
    </div>
  );
}

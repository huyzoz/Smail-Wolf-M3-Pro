/**
 * TopBar v2.5 — per Ethan's request: ONLY the logo + connection cluster remain.
 * - FW + Battery REMOVED from the topbar (already in the 4 docks below).
 * - Connection mode icons: Wifi = 2.4G, Cable (ethernet) = wired, Bluetooth =
 *   Bluetooth. (The app only reaches the mouse via cable/2.4G through the WebHID vendor
 *   filter — the Bluetooth branch is ready for a future BT path.)
 * - The "Disconnect" button asks for confirmation: "Do you want to disconnect from this
 *   device?" — Disconnect / Cancel (no longer disconnects immediately).
 * - v2.5: the Demo/Live connect buttons were REMOVED from the topbar — the device picker
 *   (DevicePicker) handles connecting; by the time the topbar shows, you're connected.
 *   All "not connected" branches in the topbar have been cleaned up.
 * Nav removed in v2.2, folded into the 4-item menu in the left panel (LeftPanel).
 * Below is a mono annotation strip in blueprint style (only on screens ≥1536px).
 */
import { useEffect, useRef, useState } from 'react';
import { Bluetooth, Cable, Power, RefreshCw, Wifi } from 'lucide-react';
import { useMouse } from '../store';
import { ConfirmModal } from './ui';
import { ThemeToggle } from './ThemeToggle';
import { brandLogoSrc } from '../lib/brand';
import { FALLBACK_APP_VERSION, currentAppVersion } from '../lib/updater';

export function TopBar(): React.JSX.Element {
  const { mode, connected, busy, wired, deviceLabel, disconnect, refresh, theme } = useMouse();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  // v3.0.11 — Color Bar Sweep (Ethan): every ~24s the mode pill runs a
  // cycle — a 3-bar colour band (violet → rose → orange, ui-ux-pro-max
  // gaming palette) sweeps L→R over the icons, the 3 modes appear as text
  // fading in blur → sharp (active highlighted), then the band sweeps back
  // R→L and the icons return. Transform/opacity only, never blocks input
  // (pill is display-only), first run ~6s after connect, static under
  // reduced-motion. Phase is exposed as data-sweep for the probe.
  type SweepPhase = 'idle' | 'sweep-in' | 'text' | 'sweep-out';
  const [sweep, setSweep] = useState<SweepPhase>('idle');
  const sweepTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    if (!connected) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const SWEEP_FIRST_MS = 6000;
    const SWEEP_IN_MS = 900;
    const TEXT_MS = 2200;
    const SWEEP_OUT_MS = 600;
    const CYCLE_MS = 24000;
    let cancelled = false;
    const at = (fn: () => void, ms: number): void => {
      sweepTimers.current.push(
        setTimeout(() => {
          if (!cancelled) fn();
        }, ms),
      );
    };
    const cycle = (startIn: number): void => {
      at(() => setSweep('sweep-in'), startIn);
      at(() => setSweep('text'), startIn + SWEEP_IN_MS);
      at(() => setSweep('sweep-out'), startIn + SWEEP_IN_MS + TEXT_MS);
      at(() => setSweep('idle'), startIn + SWEEP_IN_MS + TEXT_MS + SWEEP_OUT_MS);
      at(() => cycle(CYCLE_MS), startIn + CYCLE_MS);
    };
    cycle(SWEEP_FIRST_MS);
    return () => {
      cancelled = true;
      sweepTimers.current.forEach(clearTimeout);
      sweepTimers.current = [];
    };
  }, [connected]);
  // Real app version (Tauri getVersion(), fallback = bump-script constant) —
  // the old hardcoded "v3.0.0" lied on every release after v3.0.0.
  const [appVersion, setAppVersion] = useState(FALLBACK_APP_VERSION);
  useEffect(() => {
    let alive = true;
    void currentAppVersion().then((v) => {
      if (alive) setAppVersion(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  // Current connection mode: wired → Cable, 2.4G → Wifi, Bluetooth → Bluetooth.
  // (FW + Battery no longer show in the topbar — they're in the 4 docks below.)
  return (
    <header className="shrink-0 pt-2">
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Logo brand 800px — map theo theme (dark → LIGHT file, light → DARK file). */}
          <img src={brandLogoSrc(theme)} alt="SMAILWOLF" className="h-7 w-auto shrink-0" />
          <div className="min-w-0">
            <div className="m3pro-band font-display text-[18px] leading-none font-bold tracking-wide uppercase">
              M3 Pro
            </div>
            <div className="font-mono2 mt-0.5 text-[10px] tracking-[0.18em] text-[#55555c] uppercase">
              Driver remake · v{appVersion} · clean-room
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* v3.0: Uiverse light/dark toggle (mamyapro123) — top corner of the
              management frame, right next to the connection mode cluster. */}
          <ThemeToggle />
          {/* Connection mode cluster (redesign 2026-11-19): ONLY the 3 mode icons
              inside the frame — no WIRED/2.4G/LIVE text anymore. The active icon
              glows orange; hovering any icon bounces it up. (The app only reaches the
              mouse via cable/2.4G through the WebHID vendor filter — Bluetooth is
              ready for a future BT path.) Demo keeps a tiny DEMO tag so simulation
              is never mistaken for a real mouse. v3.0.11: the pill runs a Color Bar
              Sweep cycle (see the sweep effect above) — band covers the icons,
              then the 3 modes show as text, then the band sweeps back. */}
          {connected && (
            <span
              data-sweep={sweep}
              className="relative flex items-center gap-2.5 overflow-hidden rounded-full border border-[rgba(22,22,26,0.16)] bg-white/50 px-3 py-2"
              title={wired ? 'Wired mode' : '2.4GHz mode'}
            >
              {sweep !== 'text' && (
                <span className="flex items-center gap-2.5">
                  <span title="2.4G" className={`conn-icon ${!wired ? 'conn-icon-active' : ''}`}>
                    <Wifi className="h-4 w-4" />
                  </span>
                  <span title="Wired" className={`conn-icon ${wired ? 'conn-icon-active' : ''}`}>
                    <Cable className="h-4 w-4" />
                  </span>
                  <span title="Bluetooth" className="conn-icon">
                    <Bluetooth className="h-4 w-4" />
                  </span>
                  {mode === 'demo' && (
                    <span className="text-[10px] font-bold tracking-wide text-amber-800">DEMO</span>
                  )}
                </span>
              )}
              {(sweep === 'sweep-in' || sweep === 'sweep-out') && (
                <span className={`conn-sweep-band${sweep === 'sweep-out' ? ' conn-sweep-band-out' : ''}`} aria-hidden>
                  <span className="conn-sweep-strip conn-sweep-strip-1" />
                  <span className="conn-sweep-strip conn-sweep-strip-2" />
                  <span className="conn-sweep-strip conn-sweep-strip-3" />
                </span>
              )}
              {sweep === 'text' && (
                <span className="conn-mode-text">
                  {(['2.4GHz', 'Ethernet', 'Bluetooth'] as const).map((label) => {
                    const active = (wired && label === 'Ethernet') || (!wired && label === '2.4GHz');
                    return (
                      <span
                        key={label}
                        data-mode-label={label}
                        className={`conn-mode-label${active ? ' conn-mode-active' : ''}`}
                      >
                        {label}
                      </span>
                    );
                  })}
                </span>
              )}
            </span>
          )}
          <button
            onClick={() => setConfirmDisconnect(true)}
            aria-label="Disconnect"
            className="flex h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-[#b91c1c] bg-[#dc2626] px-3 text-[13px] font-semibold text-white transition hover:bg-[#b91c1c]"
          >
            <Power className="h-4 w-4" /> Disconnect
          </button>
          <button
            onClick={() => void refresh()}
            disabled={!connected || busy}
            aria-label="Re-read from mouse"
            className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-[rgba(22,22,26,0.16)] bg-white/50 text-[#16161a] transition hover:bg-white/80 disabled:opacity-40"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* The annotation strip only shows on very wide screens (≥1536px) — at 1366x768 it
          wastes 28px of height and makes the whole page overflow the viewport. */}
      <div className="font-mono2 mt-2 hidden items-center justify-between gap-2 border-y border-[rgba(22,22,26,0.14)] py-1 text-[10px] tracking-[0.14em] text-[#55555c] uppercase min-[1536px]:flex">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-[#15803d]' : 'bg-[#dc2626]'}`} />
          SYS.READY STATUS: {connected ? 'ONLINE' : 'OFFLINE'}
        </span>
        <span className="hidden md:inline">UNIT_04 // CORE_SCAN_OK · BOOT_SEQ: 0x001 · FAB: PAW3311</span>
        <span className="truncate" title={deviceLabel}>
          {deviceLabel}
          {mode === 'live' && (
            <span className="ml-2 inline-flex items-center gap-1">
              {wired ? <Cable className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
              {wired ? 'WIRED' : '2.4G'}
            </span>
          )}
        </span>
      </div>

      {/* Ask for confirmation before disconnecting (v2.4, per Ethan's request). */}
      <ConfirmModal
        open={confirmDisconnect}
        title="Disconnect?"
        confirmLabel="Disconnect"
        danger
        onConfirm={() => {
          setConfirmDisconnect(false);
          void disconnect();
        }}
        onCancel={() => setConfirmDisconnect(false)}
      >
        Do you want to disconnect from this device?
      </ConfirmModal>
    </header>
  );
}

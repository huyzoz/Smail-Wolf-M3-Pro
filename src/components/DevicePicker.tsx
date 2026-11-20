/**
 * Device picker v3.0 — redesign: transparent MANAGEMENT FRAME over the
 * square grid background (identical to the background outside the frame — same --grid-line /
 * --paper tokens as the body, 56px squares; inside == outside, no more separate dark starry
 * background). The frame is only a border + blueprint corners, transparent background so the grid runs
 * seamlessly through the frame.
 * - On open: navigator.hid.getDevices() lists devices ALREADY granted permission.
 * - Clicking "Add new device": navigator.hid.requestDevice({filters:
 *   [{usagePage: 0xFF01, usage: 0x10}]}) opens the browser's device picker
 *   dialog — once picked, the new device appears in the list. Clicking Cancel in
 *   the dialog just cancels, no error.
 * - The list = every Smailwolf device found by scanning (wired via VID 43172,
 *   2.4G via VID 43173/14391). Clicking a card connects to EXACTLY that device
 *   (store.connect('live', device)).
 * - Demo is NO LONGER a device card — just a small link line below
 *   the list ("No mouse here? Try the Demo (simulated)").
 * - PickerFx v3.0: grid squares near the cursor RISE with the mouse (canvas,
 *   transform/opacity-only via redraw, rAF) + an orange glow following along.
 *   Respects prefers-reduced-motion (fully off). The app-wide liquid-glass red blob
 *   lives in CursorBlob (App root), not here.
 * - Logo = file brand 800px, map theo theme (dark → LIGHT file).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useMouse } from '../store';
import { ShyArrow } from './ui';
import { skinThumbSrc } from '../lib/skins';
import { brandLogoSrc } from '../lib/brand';

const HID_FILTER = { usagePage: 65281, usage: 16 };
const WIRED_VID = 43172;

interface ScannedDevice {
  vendorId: number;
  productId: number;
  productName?: string;
  collections?: { usagePage: number; usage: number }[];
}

type HidApi = {
  getDevices: () => Promise<ScannedDevice[]>;
  requestDevice: (o: unknown) => Promise<ScannedDevice[]>;
};

function modeLabel(vendorId: number): string {
  if (vendorId === WIRED_VID) return 'Wired · USB';
  if (vendorId === 43173 || vendorId === 14391) return '2.4G · USB Receiver';
  return 'HID · Smailwolf';
}

/** Interactive background (v3.0): grid squares near the cursor rise + an orange glow
    following along. The canvas covers exactly the picker frame, only drawing raised squares + glow
    (the background grid lines are drawn by CSS .picker-bg, identical to the body). rAF,
    respects prefers-reduced-motion (fully off). */
function PickerFx(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    const CELL = 56;
    const resize = (): void => {
      // v3.0.2 — DPR cap 1.5 (was 2): halves canvas pixels on HiDPI,
      // the picker glow stays smooth on weak iGPUs.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, w * dpr);
      canvas.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    let mx = -999;
    let my = -999;
    let gx = -999;
    let gy = -999;
    let lastMove = 0;
    const onMove = (e: MouseEvent): void => {
      const r = canvas.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
      lastMove = performance.now();
      // v3.0.2 — LAG FIX: the rAF loop stops when the mouse is idle (see end of tick);
      // moving the mouse again restarts the loop.
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = (): void => {
      mx = -999;
      my = -999;
      lastMove = 0;
      ctx.clearRect(0, 0, w, h);
    };
    window.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    const tick = (): void => {
      ctx.clearRect(0, 0, w, h);
      if (mx >= 0) {
        gx = gx < -100 ? mx : gx + (mx - gx) * 0.14;
        gy = gy < -100 ? my : gy + (my - gy) * 0.14;
      } else {
        gx = -999;
        gy = -999;
      }
      if (gx >= 0) {
        // Soft orange glow following the cursor.
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 220);
        g.addColorStop(0, 'rgba(255,90,31,0.13)');
        g.addColorStop(0.55, 'rgba(255,90,31,0.05)');
        g.addColorStop(1, 'rgba(255,90,31,0)');
        ctx.fillStyle = g;
        ctx.fillRect(gx - 220, gy - 220, 440, 440);
        // Squares near the cursor RISE: the closer, the brighter + they lift up.
        const R = 120;
        const c0 = Math.max(0, Math.floor((gx - R) / CELL));
        const c1 = Math.min(Math.ceil(w / CELL), Math.ceil((gx + R) / CELL));
        const r0 = Math.max(0, Math.floor((gy - R) / CELL));
        const r1 = Math.min(Math.ceil(h / CELL), Math.ceil((gy + R) / CELL));
        for (let r = r0; r < r1; r++) {
          for (let c = c0; c < c1; c++) {
            const cx = c * CELL + CELL / 2;
            const cy = r * CELL + CELL / 2;
            const d = Math.hypot(cx - gx, cy - gy);
            if (d >= R) continue;
            const k = 1 - d / R;
            const lift = k * 7;
            const a = k * 0.55;
            const x = c * CELL + 3;
            const y = r * CELL + 3 - lift;
            const s = CELL - 6;
            ctx.save();
            // v3.0.2 — removed shadowBlur (most expensive on a weak iGPU); fill +
            // stroke alone is enough for the rising-square effect.
            ctx.fillStyle = `rgba(234,88,12,${(a * 0.22).toFixed(3)})`;
            ctx.strokeStyle = `rgba(234,88,12,${a.toFixed(3)})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, s, s, 10);
            else ctx.rect(x, y, s, s);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      // v3.0.2 — LAG FIX: stop the rAF loop when the mouse is idle for >1.5s. The last
      // frame stays on the canvas (glow + squares frozen), so it looks
      // unchanged, but the CPU/iGPU get to rest; moving the mouse again lets onMove
      // restart the loop.
      if (performance.now() - lastMove < 1500) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);
  return <canvas ref={canvasRef} aria-hidden="true" data-testid="picker-fx" className="pointer-events-none absolute inset-0 h-full w-full" />;
}

export default function DevicePicker(): React.JSX.Element {
  const { connect, connecting, skinId, theme } = useMouse();
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [hidSupported, setHidSupported] = useState(true);

  const mergeDevices = useCallback((list: ScannedDevice[]): void => {
    setDevices((prev) => {
      const seen = new Set(prev.map((d) => `${d.vendorId}:${d.productId}:${d.productName ?? ''}`));
      const next = [...prev];
      for (const d of list) {
        const k = `${d.vendorId}:${d.productId}:${d.productName ?? ''}`;
        if (!seen.has(k)) {
          seen.add(k);
          next.push(d);
        }
      }
      return next;
    });
  }, []);

  const scanGranted = useCallback(async () => {
    try {
      const hid = (navigator as Navigator & { hid?: HidApi }).hid;
      if (!hid) {
        setHidSupported(false);
        return;
      }
      const found = (await hid.getDevices()).filter((d) =>
        d.collections?.some((c) => c.usagePage === HID_FILTER.usagePage && c.usage === HID_FILTER.usage),
      );
      mergeDevices(found);
    } catch {
      // If the opening scan fails, leave the list empty and let Ethan scan again.
    }
  }, [mergeDevices]);

  useEffect(() => {
    void scanGranted();
  }, [scanGranted]);

  // Clicking opens the browser's device picker dialog (HID dialog) — a real scan.
  const scanNew = async (): Promise<void> => {
    setScanning(true);
    try {
      const hid = (navigator as Navigator & { hid?: HidApi }).hid;
      if (!hid) {
        setHidSupported(false);
        return;
      }
      const picked = await hid.requestDevice({ filters: [HID_FILTER] });
      mergeDevices(picked);
    } catch {
      // Clicking Cancel in the HID dialog → just cancels, no error.
    } finally {
      setScanning(false);
    }
  };

  const cardCls =
    'group flex w-full max-w-[240px] flex-col items-center rounded-2xl border border-[var(--line-paper)] bg-[var(--surface)] p-5 text-center shadow-[0_8px_24px_rgba(22,22,26,0.08)] transition hover:-translate-y-1 hover:border-[#ff5a1f]/60 hover:shadow-[0_12px_28px_rgba(234,88,12,0.18)] focus-visible:outline-2 focus-visible:outline-[#ff5a1f] active:scale-[0.98] disabled:opacity-50';

  return (
    <div className="picker-bg relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-8" data-testid="device-picker">
      <PickerFx />
      {/* 800px brand logo (mapped by theme) — top-left corner. */}
      <div className="absolute top-6 left-6 z-10">
        <img src={brandLogoSrc(theme)} alt="SMAILWOLF" className="h-9 w-auto" />
      </div>

      {/* MANAGEMENT FRAME (v3.0): border + blueprint corners, TRANSPARENT BACKGROUND — the square
          grid outside the frame runs seamlessly inside (inside == outside). */}
      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center rounded-[28px] border border-[var(--line-paper)] px-6 py-8 shadow-[0_20px_60px_rgba(22,22,26,0.10)] sm:px-10" data-testid="device-frame">
        <span className="pointer-events-none absolute top-3 left-3 h-5 w-5 border-t-2 border-l-2 border-[var(--line-paper)]" aria-hidden="true" />
        <span className="pointer-events-none absolute top-3 right-3 h-5 w-5 border-t-2 border-r-2 border-[var(--line-paper)]" aria-hidden="true" />
        <span className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-[var(--line-paper)]" aria-hidden="true" />
        <span className="pointer-events-none absolute right-3 bottom-3 h-5 w-5 border-r-2 border-b-2 border-[var(--line-paper)]" aria-hidden="true" />
        <h1 className="text-center font-display text-2xl font-bold tracking-wide text-[var(--ink)] sm:text-3xl">
          CONNECT YOUR SMAILWOLF MOUSE
        </h1>
        <p className="mt-2 text-center text-sm text-[var(--muted-paper)]">
          Broad scan — every Smailwolf device plugged in or already paired shows up here. Click a card to connect.
        </p>

        {/* "Add new device" button (orange, original-app style) — click for a real scan. */}
        <button
          type="button"
          onClick={() => void scanNew()}
          disabled={scanning || connecting}
          className="uiv-shy-btn uiv-shy-selected mt-6 px-6 py-3 text-[15px] disabled:opacity-60"
        >
          <Plus className="h-5 w-5" />
          {scanning ? 'Scanning…' : 'Add new device'}
          <ShyArrow />
        </button>

        <p className="mt-4 text-sm text-[var(--muted-paper)]">
          {`Found ${devices.length} devices`}
          {!hidSupported ? ' — this browser has no WebHID, use the Demo below.' : ''}
        </p>

        {/* List of FOUND devices — shows the exact anime mouse PNG. */}
        {devices.length === 0 ? (
          <div className="mt-8 w-full max-w-[240px] rounded-2xl border border-dashed border-[var(--line-paper)] p-5 text-center">
            <img src={skinThumbSrc(skinId)} alt="" className="mx-auto h-28 w-auto opacity-40" />
            <p className="mt-4 text-sm font-semibold text-[var(--ink)]">No devices found yet</p>
            <p className="mt-1 text-xs text-[var(--muted-paper)]">Plug in the mouse / turn on the dongle, then click “Add new device” to scan.</p>
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            {devices.map((d) => {
              const name = d.productName || 'USB Receiver';
              return (
                <button
                  key={`${d.vendorId}:${d.productId}:${name}`}
                  type="button"
                  onClick={() => void connect('live', d)}
                  disabled={connecting}
                  aria-label={`Connect ${name} via ${modeLabel(d.vendorId)}`}
                  className={cardCls}
                >
                  <img src={skinThumbSrc(skinId)} alt="" className="h-44 w-auto" />
                  <span className="mt-4 flex min-h-[1.5rem] items-center text-base font-bold whitespace-nowrap text-[var(--ink)]">{name}</span>
                  <span className="mt-1 flex min-h-[1rem] items-center text-xs whitespace-nowrap text-[var(--muted-paper)]">
                    {modeLabel(d.vendorId)} · VID {d.vendorId}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Demo is separate from the device list (not a scan card). */}
        <button
          type="button"
          onClick={() => void connect('demo')}
          disabled={connecting}
          className="mt-8 text-sm text-[var(--muted-paper)] underline decoration-[var(--line-paper)] underline-offset-4 hover:text-[var(--ink)] disabled:opacity-50"
        >
          No mouse here? Try the Demo (simulated)
        </button>

        <p className="mt-4 text-xs text-[var(--muted-paper)]">
          Disconnect from the main UI to come back here.
        </p>
      </div>
    </div>
  );
}

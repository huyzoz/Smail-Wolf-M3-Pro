/**
 * SkinPopup v3.0 — replaces the v2.7 horizontal strip (Ethan didn't want horizontal scrolling anymore):
 * 1 "Skin" layer button below the Battery dock -> click to open the LARGE popup with all skins.
 *
 * - Grid of 5 skins / row, all 5 fully visible (no cut borders), the first skin is
 *   ALWAYS Default; each skin's name sits right below its image.
 * - Opening the popup -> REALLY preloads all 67 thumbnails via Image(), showing the
 *   ancient-yak-42 compass + a real "n/67" progress bar. v3.0: the
 *   PRELOAD_TIMEOUT_MS=10000 is GONE entirely (v2.8: the timeout resolved whether loading
 *   finished or not = FAKE loading) — now the loader only turns off once Promise.all settles
 *   completely: failed images still count as done (never gets stuck), no timeout.
 *   The loader overlay only BLURs the background (backdrop-blur, NO dimming/fading).
 * - v3.0 grid VIRTUALIZATION: only renders the rows currently visible (+2 buffer rows
 *   on each side); rows outside the frame aren't in the DOM — scrolling 67 skins
 *   no longer lags. Fixed row height ROW_PITCH=200px (card ~188px + 12px
 *   gap). Full-res (src) is only preloaded LAZILY when hovering/selecting a skin (hover,
 *   focus, click) — no downloading 9MB x 67 when the popup opens.
 * - Picking a skin in the grid = a tentative pick (pending). "Apply" is what really changes it
 *   (stage + localStorage + toast). "Cancel" closes the popup, changing nothing.
 *   The skin in use has a "Revert to Default" button right on its card — click it to go back to
 *   Default immediately. Behind the popup, a full-screen black blur (portal to body, like
 *   ConfirmModal v2.6 — avoids the .app-enter transform trap).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Check, ChevronRight, X } from 'lucide-react';
import { SKINS, skinById, skinThumbSrc, type SkinDef } from '../lib/skins';
import { useMouse } from '../store';
import { GlassButton, useScrollLock } from './ui';

const COLS = 5;
/** Height of one grid row (card ~188px + 12px gap) — virtualization needs it fixed. */
const ROW_PITCH = 200;

/** Ancient-yak-42 compass (Uiverse Nawsome), verbatim like LoadingScreen
 *  but WITHOUT the logo, svg ids suffixed -skin to avoid clashing with LoadingScreen. */
function CompassLoader({ done, total }: { done: number; total: number }): React.JSX.Element {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center justify-center py-16" role="status" aria-label="Loading skins">
      <svg className="pl" viewBox="0 0 160 160" width="120px" height="120px" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="grad-skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000" />
            <stop offset="100%" stopColor="#fff" />
          </linearGradient>
          <mask id="mask1-skin">
            <rect x="0" y="0" width="160" height="160" fill="url(#grad-skin)" />
          </mask>
          <mask id="mask2-skin">
            <rect x="28" y="28" width="104" height="104" fill="url(#grad-skin)" />
          </mask>
        </defs>
        <g>
          <g className="pl__ring-rotate">
            <circle className="pl__ring-stroke" cx="80" cy="80" r="72" fill="none" stroke="hsl(223,90%,55%)" strokeWidth="16" strokeDasharray="452.39 452.39" strokeDashoffset="452" strokeLinecap="round" transform="rotate(-45,80,80)" />
          </g>
        </g>
        <g mask="url(#mask1-skin)">
          <g className="pl__ring-rotate">
            <circle className="pl__ring-stroke" cx="80" cy="80" r="72" fill="none" stroke="hsl(193,90%,55%)" strokeWidth="16" strokeDasharray="452.39 452.39" strokeDashoffset="452" strokeLinecap="round" transform="rotate(-45,80,80)" />
          </g>
        </g>
        <g>
          <g strokeWidth="4" strokeDasharray="12 12" strokeDashoffset="12" strokeLinecap="round" transform="translate(80,80)">
            <polyline className="pl__tick" stroke="hsl(223,10%,90%)" points="0,2 0,14" transform="rotate(-135,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,10%,90%)" points="0,2 0,14" transform="rotate(-90,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,10%,90%)" points="0,2 0,14" transform="rotate(-45,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,10%,90%)" points="0,2 0,14" transform="rotate(0,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,10%,90%)" points="0,2 0,14" transform="rotate(45,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,10%,90%)" points="0,2 0,14" transform="rotate(90,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,10%,90%)" points="0,2 0,14" transform="rotate(135,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,10%,90%)" points="0,2 0,14" transform="rotate(180,0,0) translate(0,40)" />
          </g>
        </g>
        <g mask="url(#mask1-skin)">
          <g strokeWidth="4" strokeDasharray="12 12" strokeDashoffset="12" strokeLinecap="round" transform="translate(80,80)">
            <polyline className="pl__tick" stroke="hsl(223,90%,80%)" points="0,2 0,14" transform="rotate(-135,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,90%,80%)" points="0,2 0,14" transform="rotate(-90,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,90%,80%)" points="0,2 0,14" transform="rotate(-45,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,90%,80%)" points="0,2 0,14" transform="rotate(0,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,90%,80%)" points="0,2 0,14" transform="rotate(45,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,90%,80%)" points="0,2 0,14" transform="rotate(90,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,90%,80%)" points="0,2 0,14" transform="rotate(135,0,0) translate(0,40)" />
            <polyline className="pl__tick" stroke="hsl(223,90%,80%)" points="0,2 0,14" transform="rotate(180,0,0) translate(0,40)" />
          </g>
        </g>
        <g>
          <g transform="translate(64,28)">
            <g className="pl__arrows" transform="rotate(45,16,52)">
              <path fill="hsl(3,90%,55%)" d="M17.998,1.506l13.892,43.594c.455,1.426-.56,2.899-1.998,2.899H2.108c-1.437,0-2.452-1.473-1.998-2.899L14.002,1.506c.64-2.008,3.356-2.008,3.996,0Z" />
              <path fill="hsl(223,10%,90%)" d="M14.009,102.499L.109,58.889c-.453-1.421,.559-2.889,1.991-2.889H29.899c1.433,0,2.444,1.468,1.991,2.889l-13.899,43.61c-.638,2.001-3.345,2.001-3.983,0Z" />
            </g>
          </g>
        </g>
        <g mask="url(#mask2-skin)">
          <g transform="translate(64,28)">
            <g className="pl__arrows" transform="rotate(45,16,52)">
              <path fill="hsl(333,90%,55%)" d="M17.998,1.506l13.892,43.594c.455,1.426-.56,2.899-1.998,2.899H2.108c-1.437,0-2.452-1.473-1.998-2.899L14.002,1.506c.64-2.008,3.356-2.008,3.996,0Z" />
              <path fill="hsl(223,90%,80%)" d="M14.009,102.499L.109,58.889c-.453-1.421,.559-2.889,1.991-2.889H29.899c1.433,0,2.444,1.468,1.991,2.889l-13.899,43.61c-.638,2.001-3.345,2.001-3.983,0Z" />
            </g>
          </g>
        </g>
      </svg>
      <p className="mt-4 text-sm font-semibold tracking-wide text-[#16161a]">
        Loading skins… {done}/{total}
      </p>
      {/* REAL progress bar — width follows done/total, no fake spinner. */}
      <div
        className="mt-3 h-2 w-56 overflow-hidden rounded-full bg-[rgba(22,22,26,0.15)]"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Skin loading progress"
        data-testid="skin-progress"
      >
        <div
          className="h-full rounded-full bg-[#ea580c] transition-[width] duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-[#6b6b76]">Waiting for all {total} skins to finish rendering before showing the grid.</p>
    </div>
  );
}

/** Skin layer button below the Battery dock — hover effect like the other buttons
 *  (rises up + orange border, sliding arrow). */
export function SkinButton({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  const { skinId } = useMouse();
  const cur = skinById(skinId);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open mouse skin collection"
      className="dock group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-[#ea580c]/60 hover:shadow-[0_8px_24px_rgba(234,88,12,0.18)] focus-visible:outline-2 focus-visible:outline-[#c2410c]"
    >
      <img src={skinThumbSrc(skinId)} alt="" className="h-12 w-12 shrink-0 object-contain" draggable={false} />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold tracking-[0.18em] text-[#6b6b76]">MOUSE SKINS</span>
        <span className="block truncate text-sm font-bold text-[#16161a]">
          {cur.name} <span className="font-normal text-[#6b6b76]">· {SKINS.length} skin</span>
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-[#ea580c] transition-transform duration-150 group-hover:translate-x-1" aria-hidden="true" />
    </button>
  );
}

export function SkinPopup({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element | null {
  const { skinId, setSkinId, addLog } = useMouse();
  const [pending, setPending] = useState(skinId);
  const [loaded, setLoaded] = useState(false);
  const [done, setDone] = useState(0);
  // v3.0 virtualize: current scroll position of the grid frame.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  // Full-res already lazy-preloaded (hover/focus/select) — once per skin.
  const preloadedFull = useRef(new Set<string>());
  // Redesign 2026-11-19 (c): rAF id for the throttled scroll handler. Declared
  // HERE (before the `if (!open) return null` below) — a useRef/useEffect after
  // that early return breaks the Rules of Hooks and crashes the popup.
  const scrollRafRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    },
    [],
  );

  const rows = useMemo(() => {
    const out: (typeof SKINS)[] = [];
    for (let i = 0; i < SKINS.length; i += COLS) out.push(SKINS.slice(i, i + COLS));
    return out;
  }, []);

  // Opening the popup: pending = the skin in use; REALLY preload all thumbs, then
  // show the grid. NO more fake timeout: the loader only turns off once Promise.all
  // settles completely — failed images still count as done (onerror ticks too), so it
  // never gets stuck on the loader.
  useEffect(() => {
    if (!open) return;
    setPending(skinId);
    setLoaded(false);
    setDone(0);
    setScrollTop(0);
    preloadedFull.current = new Set<string>();
    let cancelled = false;
    let count = 0;
    const total = SKINS.length;
    const tick = () => {
      count += 1;
      if (!cancelled) setDone(count);
    };
    const jobs = SKINS.map(
      (s) =>
        new Promise<void>((res) => {
          const im = new Image();
          im.onload = () => {
            tick();
            res();
          };
          im.onerror = () => {
            tick();
            res();
          };
          im.src = s.thumb;
        }),
    );
    void Promise.all(jobs).then(() => {
      if (!cancelled) {
        setDone(total);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, skinId]);

  // Esc closes the popup.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Hook for headless tests: preload state + number of rows rendering.
  const visStart = Math.max(0, Math.floor(scrollTop / ROW_PITCH) - 2);
  const visEnd = Math.min(rows.length, Math.ceil((scrollTop + viewH) / ROW_PITCH) + 2);
  useEffect(() => {
    (window as unknown as { __skinPopup?: unknown }).__skinPopup = {
      loaded,
      done,
      total: SKINS.length,
      rows: rows.length,
      visibleRows: visEnd - visStart,
      renderedCards: document.querySelectorAll('[data-skin-card]').length,
    };
  }, [loaded, done, rows.length, visStart, visEnd]);

  useScrollLock(open);
  if (!open) return null;

  const applied = skinById(skinId);
  const pendingSkin = skinById(pending);
  const changed = pending !== skinId;

  /** Lazy full-res: only downloads the original image when Ethan hovers/selects that skin (sharp enough for
      the stage after Apply), never 67 9MB images when the popup opens. */
  const preloadFull = (s: SkinDef): void => {
    if (preloadedFull.current.has(s.id)) return;
    preloadedFull.current.add(s.id);
    const im = new Image();
    im.src = s.src;
  };
  const pick = (s: SkinDef): void => {
    preloadFull(s);
    setPending(s.id);
  };

  const apply = () => {
    if (!changed) {
      onClose();
      return;
    }
    setSkinId(pending);
    addLog(`Mouse skin changed: ${pendingSkin.name}.`);
    onClose();
  };

  const unapply = () => {
    setSkinId('default');
    addLog('Skin reverted to Default.');
    onClose();
  };

  // Redesign 2026-11-19 (c): scroll fires dozens of events per flick — one
  // setState per event re-rendered the whole grid each time, which is the lag
  // Ethan feels on his EliteBook. Throttle to one update per animation frame.
  const onGridScroll = (): void => {
    const el = scrollRef.current;
    if (!el || scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el2 = scrollRef.current;
      if (!el2) return;
      setScrollTop(el2.scrollTop);
      setViewH(el2.clientHeight);
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Mouse skin collection"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex max-h-[90vh] w-full max-w-[880px] flex-col overflow-hidden rounded-2xl bg-[var(--paper)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[rgba(22,22,26,0.12)] px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold tracking-wide text-[#16161a]">MOUSE SKINS</h2>
            <p className="truncate text-xs text-[#6b6b76]">
              {SKINS.length} skins · In use: <span className="font-semibold text-[#ea580c]">{applied.name}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgba(22,22,26,0.12)] bg-white/70 text-[#16161a] transition-colors hover:border-[#ea580c] hover:text-[#ea580c] focus-visible:outline-2 focus-visible:outline-[#c2410c]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* VIRTUALIZED grid (v3.0): only renders the rows currently visible (+2 buffer).
            The scroll frame is a flex-item (flex-1 min-h-0) — see fix v2.8.2. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={onGridScroll}
            className="min-h-0 flex-1 overflow-y-auto p-4"
            role="listbox"
            aria-label="Choose a mouse skin"
            data-testid="skin-grid"
          >
            <div className="relative" style={{ height: rows.length * ROW_PITCH }}>
              {rows.slice(visStart, visEnd).map((row, k) => {
                const ri = visStart + k;
                return (
                  <div
                    key={ri}
                    className="absolute inset-x-0 grid grid-cols-5 gap-3"
                    style={{
                      top: ri * ROW_PITCH,
                      height: ROW_PITCH - 12,
                      // Redesign 2026-11-19 (c): let the browser skip rendering rows
                      // that are off-screen (fixed 200px rows, so the intrinsic size
                      // can't shift the scrollbar).
                      contentVisibility: 'auto',
                      containIntrinsicSize: '200px',
                    }}
                  >
                    {row.map((s) => {
                      const isPending = pending === s.id;
                      const isApplied = skinId === s.id;
                      return (
                        <div
                          key={s.id}
                          data-skin-card={s.id}
                          role="option"
                          aria-selected={isPending}
                          aria-label={`Skin ${s.name}`}
                          tabIndex={0}
                          onClick={() => pick(s)}
                          onMouseEnter={() => preloadFull(s)}
                          onFocus={() => preloadFull(s)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              pick(s);
                            }
                          }}
                          className={`relative h-full cursor-pointer rounded-xl border-2 bg-[#f4f4f2] p-2 transition-all duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-[#c2410c] ${
                            isPending
                              ? 'border-[#ea580c] shadow-[0_8px_24px_rgba(234,88,12,0.25)]'
                              : 'border-[rgba(22,22,26,0.12)] hover:border-[#ea580c]/50'
                          }`}
                        >
                          {isApplied && (
                            <span className="absolute top-1.5 left-1.5 z-10 rounded-full bg-[#ea580c] px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">
                              IN USE
                            </span>
                          )}
                          {isPending && (
                            <span className="absolute top-1.5 right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#ea580c] text-white" aria-hidden="true">
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          )}
                          <img src={s.thumb} alt={s.name} className="h-28 w-full object-contain" draggable={false} loading="lazy" decoding="async" />
                          <p className="mt-1 min-h-[2.2em] text-center text-[11px] leading-tight font-semibold text-[#16161a]">{s.name}</p>
                          {isApplied && s.id !== 'default' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                unapply();
                              }}
                              className="mt-1 w-full rounded-full border border-[#dc2626]/40 py-1 text-[10px] font-bold text-[#dc2626] transition-colors hover:bg-[#dc2626] hover:text-white focus-visible:outline-2 focus-visible:outline-[#dc2626]"
                            >
                              Revert to Default
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          {!loaded && (
            <div className="skin-loading-veil absolute inset-0 z-10 flex items-center justify-center backdrop-blur-md" role="status" aria-label="Loading skins">
              <div className="rounded-3xl bg-[var(--surface-solid)] px-6 shadow-xl">
                <CompassLoader done={done} total={SKINS.length} />
              </div>
            </div>
          )}
        </div>

        {/* Fixed footer */}
        <div className="flex shrink-0 items-center gap-3 border-t border-[rgba(22,22,26,0.12)] px-5 py-3">
          <p className="min-w-0 flex-1 truncate text-xs text-[#6b6b76]">
            {changed ? (
              <>
                Will change to: <span className="font-semibold text-[#16161a]">{pendingSkin.name}</span>
              </>
            ) : (
              <>Selected: {pendingSkin.name}</>
            )}
          </p>
          <GlassButton variant="ghost" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton variant="primary" onClick={apply} disabled={!loaded || !changed}>
            Apply
          </GlassButton>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

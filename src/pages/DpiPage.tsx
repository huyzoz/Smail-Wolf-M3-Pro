/**
 * DPI v2.5 — exactly like the image Ethan sent (6 colored stages + Slow↔Fast slider), buttons switched
 * to shy-moth-10 (orange pill + chevron arrow), plus task presets:
 * - 6 stages: radio on top + value pill (800 red, 1600 green, 2400
 *   blue, 3200 purple, 6400 yellow, 12000 teal — colors stay on unselected
 *   stages; the stage in use = orange pill + white text). The stage in use shows the text
 *   "Current DPI" xanh.
 * - Slider 200–12000: dragging gradually changes the fill color (blue → red by DPI) and
 *   the marker follows the nearest stage. It only writes on release (no spamming
 *   50 writes while dragging); clicking a stage applies instantly AND the slider
 *   GLIDES to it (redesign 2026-11-19 — never jumps). NO more Save / Undo
 *   buttons — per Ethan's request ("whatever button you press applies right away").
 * - Task presets (v2.5): Office 1600 / Gaming 3200 / Design
 *   800 — click to apply instantly (applyStage). No more subtitle (Ethan said to remove it).
 * - "Restore default settings" at the top right → DEFAULT_DPI + stage 2.
 * - Little text, fits the frame without scrolling.
 */
import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { clampDpi, DEFAULT_DPI } from '../lib/hid';
import { useMouse } from '../store';
import { EmptyState, PageHead, ShyArrow } from '../components/ui';

const STAGE_COLORS = ['#f87171', '#4ade80', '#60a5fa', '#c084fc', '#facc15', '#22d3ee'];
const TICKS = [200, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000];

/** Task presets (v2.5, filling the gap below the slider — Ethan said the space
    below had to be office/gaming presets, truly fitting each task
    ): each preset = one existing stage, click to apply instantly (applyStage). Values
    chosen by common standards: office 1600 (the mouse's default stage),
    gaming 3200 (a popular gaming level), design 800 (the lowest, for
    pixel-by-pixel control). */
const TASK_PRESETS: { label: string; dpi: number; stage: number }[] = [
  { label: 'Office', dpi: 1600, stage: 1 },
  { label: 'Gaming', dpi: 3200, stage: 3 },
  { label: 'Design', dpi: 800, stage: 0 },
];

/** The slider fill color gradually changes with DPI: blue (low) → red (high). */
function dpiHue(v: number): string {
  const t = Math.min(1, Math.max(0, (v - 200) / (12000 - 200)));
  return `hsl(${Math.round(220 - t * 220)} 90% 60%)`;
}

function nearestStage(dpi: number[], v: number): number {
  let best = 0;
  let bestDiff = Infinity;
  dpi.forEach((d, i) => {
    const diff = Math.abs(d - v);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  });
  return best;
}

export default function DpiPage(): React.JSX.Element {
  const { config, busy, saveConfig } = useMouse();
  const [draft, setDraft] = useState<number[]>(DEFAULT_DPI);
  const [draftIndex, setDraftIndex] = useState(1);
  // The slider value being dragged (live) — differs from draft[draftIndex] while dragging.
  const [sliderVal, setSliderVal] = useState(1600);
  const sliderValRef = useRef(1600);
  const [dragging, setDragging] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Redesign 2026-11-19 (g): the slider GLIDES to a new stage instead of jumping.
  const glideRef = useRef<number | null>(null);
  const glideTargetRef = useRef<number | null>(null);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    reduceMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  /** Glide the slider (UI only) from its current value to the target — the mouse
      already got the new DPI instantly via saveConfig; only the slider travels.
      easeInOutCubic, 150–500ms by distance; instant under reduced motion. */
  const glideSliderTo = (target: number): void => {
    if (glideRef.current !== null) cancelAnimationFrame(glideRef.current);
    const start = sliderValRef.current;
    glideTargetRef.current = target;
    if (start === target || reduceMotionRef.current) {
      setSliderVal(target);
      sliderValRef.current = target;
      glideRef.current = null;
      return;
    }
    const dur = Math.min(500, 150 + (Math.abs(target - start) / 11800) * 350);
    const t0 = performance.now();
    const tick = (t: number): void => {
      const p = Math.min(1, (t - t0) / dur);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const v = Math.round(start + (target - start) * e);
      setSliderVal(v);
      sliderValRef.current = v;
      glideRef.current = p < 1 ? requestAnimationFrame(tick) : null;
    };
    glideRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    if (config) {
      setDraft([...config.dpi]);
      setDraftIndex(config.dpiIndex);
      const incoming = config.dpi[config.dpiIndex];
      if (glideRef.current !== null) {
        // Glide in flight: it already heads for the applied value — don't snap
        // it. If the mouse reports something else, the mouse wins: cancel + snap.
        if (glideTargetRef.current === incoming) return;
        cancelAnimationFrame(glideRef.current);
        glideRef.current = null;
      }
      setSliderVal(incoming);
      sliderValRef.current = incoming;
    }
  }, [config]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (glideRef.current !== null) cancelAnimationFrame(glideRef.current);
    },
    [],
  );

  if (!config) {
    return (
      <div>
        <PageHead title="DPI" />
        <EmptyState text="Not connected — pick Demo (simulated) or Connect a real mouse in the top bar." />
      </div>
    );
  }

  // The displayed active stage: while dragging it follows the nearest stage,
  // when not dragging it is the stage actually in use.
  const shownIndex = dragging ? nearestStage(draft, sliderVal) : draftIndex;
  // Value shown on each card: the stage being dragged shows the live sliderVal.
  const shownDpi = (i: number): number => (dragging && i === shownIndex ? sliderVal : draft[i]);

  const applyStage = (i: number): void => {
    if (busy || i === draftIndex) return;
    const prevIndex = draftIndex;
    const prevVal = draft[draftIndex];
    setDraftIndex(i);
    glideSliderTo(draft[i]);
    void saveConfig({ ...config, dpi: draft, dpiIndex: i }).then((ok) => {
      if (!ok) {
        setDraftIndex(prevIndex);
        glideSliderTo(prevVal);
      }
    });
  };

  const commitSlider = (v: number): void => {
    const idx = nearestStage(draft, v);
    const next = [...draft];
    next[idx] = clampDpi(v);
    setDraft(next);
    setDraftIndex(idx);
    setSliderVal(next[idx]);
    sliderValRef.current = next[idx];
    void saveConfig({ ...config, dpi: next, dpiIndex: idx }).then((ok) => {
      if (!ok) {
        setDraft([...config.dpi]);
        setDraftIndex(config.dpiIndex);
        glideSliderTo(config.dpi[config.dpiIndex]);
      }
    });
  };

  const onSliderChange = (v: number): void => {
    // The user grabbed the slider — a glide in flight hands over to the drag.
    if (glideRef.current !== null) {
      cancelAnimationFrame(glideRef.current);
      glideRef.current = null;
    }
    const clamped = clampDpi(v);
    setSliderVal(clamped);
    sliderValRef.current = clamped;
    setDragging(true);
    // Write 250ms after release (debounce) — one drag writes only once.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setDragging(false);
      commitSlider(v);
    }, 250);
  };

  const restoreDefaults = (): void => {
    if (busy) return;
    setDraft([...DEFAULT_DPI]);
    setDraftIndex(1);
    glideSliderTo(1600);
    void saveConfig({ ...config, dpi: [...DEFAULT_DPI], dpiIndex: 1 });
  };

  const pct = ((sliderVal - 200) / (12000 - 200)) * 100;
  const fillColor = dpiHue(sliderVal);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-2">
        <PageHead title="DPI" />
        <button
          onClick={restoreDefaults}
          disabled={busy}
          className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-4 text-[13px] font-semibold text-[#edebe6] transition hover:border-[#ff5a1f]/50 hover:text-white active:scale-[0.97] disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" /> Restore default settings
        </button>
      </div>

      {/* 6 stages: radio on top + shy-moth-10 pill (v2.5, replacing the v2.4 square cards).
          Unselected stages keep their own color (800 red, 1600 green…);
          the selected stage = orange pill + white text + arrow. */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {draft.map((d, i) => {
          const active = i === shownIndex;
          const val = shownDpi(i);
          return (
            <div key={i} className="flex flex-col items-center">
              <button
                onClick={() => applyStage(i)}
                disabled={busy}
                aria-label={`Choose stage ${i + 1} (${d} DPI)`}
                aria-pressed={active}
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 transition active:scale-90 ${
                  active ? 'border-[#ff5a1f] bg-[#ff5a1f]' : 'border-[#ff5a1f]/60 bg-transparent hover:border-[#ff5a1f]'
                }`}
              >
                {active && <span className="h-[8px] w-[8px] rounded-full bg-white" aria-hidden="true" />}
              </button>
              {/* (Redesign 2026-11-19: no "Current DPI" text — the orange pill +
                  filled radio already mark the active stage. The empty row keeps
                  the pills aligned.) */}
              <span className="mt-1 flex h-4 items-center" aria-hidden="true" />
              <button
                onClick={() => applyStage(i)}
                disabled={busy}
                aria-label={`Stage ${i + 1}: ${val.toLocaleString('en-GB')} DPI`}
                aria-pressed={active}
                className={`uiv-shy-btn uiv-shy-compact mt-1.5 w-full ${active ? 'uiv-shy-selected' : ''}`}
                style={active ? undefined : { color: STAGE_COLORS[i] }}
              >
                {val.toLocaleString('en-GB')}
                <ShyArrow small />
              </button>
            </div>
          );
        })}
      </div>

      {/* Slow↔Fast slider (exactly like the image Ethan sent): fill gradually changes color with DPI,
          the Current DPI stage jumps along while dragging. */}
      <div className="mt-6">
        <div className="flex items-center gap-3">
          <span className="w-10 shrink-0 text-right text-[13px] font-medium text-[#c9c9d6]">Slow</span>
          <input
            type="range"
            className="uiv-dpi-slider"
            value={sliderVal}
            min={200}
            max={12000}
            step={50}
            disabled={busy}
            aria-label="DPI (drag to change, release to save)"
            style={{
              background: `linear-gradient(90deg, ${fillColor} ${pct}%, rgba(255,255,255,0.14) ${pct}%)`,
            }}
            onChange={(e) => onSliderChange(Number(e.target.value))}
            onPointerUp={() => {
              if (saveTimer.current) clearTimeout(saveTimer.current);
              setDragging(false);
              commitSlider(sliderValRef.current);
            }}
          />
          <span className="w-10 shrink-0 text-[13px] font-medium text-[#c9c9d6]">Fast</span>
        </div>
        <div className="mt-1 flex justify-between px-[52px] font-mono text-[10px] text-[#a2a2b0]">
          {TICKS.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <p className="mt-2 text-center text-[13px] text-[#a2a2b0]">
          Setting: <b style={{ color: fillColor }}>{sliderVal.toLocaleString('en-GB')} DPI</b>
          {dragging ? ' — release to save' : ''}
        </p>
      </div>

      {/* Task presets (v2.5): click to apply instantly, no scrolling. */}
      <div className="mt-6 border-t border-white/10 pt-4">
        <div className="mb-2 text-[13px] font-semibold text-[#edebe6]">Task presets</div>
        <div className="flex flex-wrap gap-2">
          {TASK_PRESETS.map((p) => {
            const active = draftIndex === p.stage && draft[p.stage] === p.dpi;
            return (
              <button
                key={p.label}
                onClick={() => applyStage(p.stage)}
                disabled={busy}
                aria-label={`Preset ${p.label}: ${p.dpi.toLocaleString('en-GB')} DPI`}
                aria-pressed={active}
                className={`uiv-shy-btn ${active ? 'uiv-shy-selected' : ''}`}
              >
                {p.label} · {p.dpi.toLocaleString('en-GB')}
                <ShyArrow />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

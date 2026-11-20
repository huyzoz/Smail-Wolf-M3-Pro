/**
 * MousePhoto — anime-style MOUSE PHOTO Ethan sent (v2.6, replaces the real photo from v2.3).
 * Anime image 944x1667, transparent background — hand-drawn glossy white, scroll wheel + buttons
 * DPI + 2 solid-black side buttons, clearer than the old photo.
 *
 * Button positions = real measurements from the image (PIL/numpy, 3px erosion to kill
 * thin outline edges, keeping only solid black areas — no guessing):
 * - scroll wheel (solid black): center (0.50, 0.227) — x range 0.434-0.566, y 0.134-0.319
 * - DPI button (black capsule): center (0.50, 0.398) — x range 0.237-0.778, y 0.326-0.470
 * - upper side button (Copy by default): center (0.090, 0.410) — x 0.072-0.108, y 0.342-0.478
 * - lower side button (Paste by default): center (0.102, 0.546) — x 0.083-0.121, y 0.480-0.613
 * - left / right panels: center (0.27, 0.22) / (0.73, 0.22) (upper body split at x=0.50)
 * Labels keep the image-2 style: thin-bordered tag + diagonal connector (staggered dy) + dot on the button.
 *
 * v2.6 hover: hovering a button (click area or tag) → that part LIGHTS UP
 * (orange glow layer covering exactly the button shape) + a light bounce like a real click
 * (.part-glow + partPress keyframes) + tag/connector/dot switch to cyberpunk
 * (navy background, orange text, border + neon halo). Applies to all 6 buttons.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { keyName, SYSTEM_KEY_ACTIONS, type KeyBinding } from '../lib/hid';

export function shortBindingName(b: KeyBinding): string {
  for (const g of SYSTEM_KEY_ACTIONS) {
    const hit = g.actions.find(
      (a) => a.binding.type === b.type && a.binding.code1 === b.code1 && a.binding.code2 === b.code2 && a.binding.code3 === b.code3,
    );
    if (hit) return hit.label;
  }
  return keyName(b.type, b.code1, b.code2, b.code3)
    .replace(/^Mouse: /, '')
    .replace(/^Keyboard: /, '')
    .replace(/^Media: /, '');
}

interface LabelDef {
  keyIndex: number;
  title: string;
  side: 'left' | 'right';
  /** Anchor position = ratio (0..1) on the image frame (measured from the real image, see header). */
  fx: number;
  fy: number;
  valueOnly?: boolean;
  line?: number;
  /** Tag vertical offset from the dot (px, + = down) — the 3 right-side labels have dots
      only ~20px apart, so tags must stagger up/down and connectors become
      slight diagonals like image 2. */
  dy?: number;
}

interface LabelPos {
  keyIndex: number;
  title: string;
  side: 'left' | 'right';
  x: number;
  y: number;
  line: number;
  dy: number;
}

export function MousePhoto({
  keys,
  onPartClick,
  src = '/mouse-m3pro.webp',
}: {
  keys: KeyBinding[] | null;
  onPartClick: (keyIndex: number, point: { x: number; y: number }) => void;
  /** The mouse image currently shown — the selected skin (v2.7). All skins share the same
      944x1667 canvas, so the pre-measured click anchors are shared. */
  src?: string;
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [labels, setLabels] = useState<LabelPos[]>([]);
  // v2.6 hover: whichever button is hovered (click area or tag) → glow lights up
  // exactly that part's shape + a light bounce like a real click.
  const [hovered, setHovered] = useState<number | null>(null);
  const [imgBox, setImgBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
  // v2.7: image size FITs the frame (computed from the image's real aspect ratio).
  // BUG v2.6: img only had h-[96%] w-auto — in a PORTRAIT viewport (tall, narrow) the image
  // at 96% frame height overflows the width → both sides get cropped, looking stretched
  // vertically and ugly (exactly the screenshot Ethan took at 1080x1920). Fitting both dimensions
  // never overflows/crops and keeps the correct aspect at any ratio.
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  // Once the image loads (naturalWidth has real numbers), re-measure — another skin may
  // have a different canvas, so layout must follow the real image, not the fallback.
  const [imgLoaded, setImgLoaded] = useState(0);

  const labelDefs: LabelDef[] = useMemo(() => {
    const val = (i: number): string => (keys && keys[i] ? shortBindingName(keys[i]) : '—');
    const leftVal = val(0);
    const rightVal = val(1);
    const base: LabelDef[] = [
      { keyIndex: 0, title: 'Left button', side: 'left', fx: 0.27, fy: 0.22, line: 100, dy: -12 },
      { keyIndex: 1, title: 'Right button', side: 'right', fx: 0.73, fy: 0.22, line: 120 },
      { keyIndex: 2, title: 'Middle button', side: 'right', fx: 0.5, fy: 0.227, line: 150, dy: -48 },
      { keyIndex: 5, title: 'DPI', side: 'right', fx: 0.5, fy: 0.398, line: 150, dy: 56 },
      { keyIndex: 4, title: val(4), side: 'left', fx: 0.09, fy: 0.41, valueOnly: true, line: 100 },
      { keyIndex: 3, title: val(3), side: 'left', fx: 0.102, fy: 0.546, valueOnly: true, line: 100, dy: 24 },
    ];
    return base.map((d) => ({
      ...d,
      title:
        d.keyIndex === 0 && leftVal !== 'Left button' && leftVal !== 'Left click'
          ? `Left · ${leftVal}`
          : d.keyIndex === 1 && rightVal !== 'Right button' && rightVal !== 'Right click'
            ? `Right · ${rightVal}`
            : d.title,
    }));
  }, [keys]);

  // Image centered, fit to 96% of the frame in BOTH dimensions (keeps aspect): the image position
  // is derived from the frame size + the image's real aspect ratio (naturalWidth/
  // naturalHeight; fallback 944x1667 is the standard canvas of every skin).
  useEffect(() => {
    const layout = (): void => {
      const container = containerRef.current;
      const img = imgRef.current;
      if (!container || !img) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;
      const iw0 = img.naturalWidth || 944;
      const ih0 = img.naturalHeight || 1667;
      const fit = Math.min((cw * 0.96) / iw0, (ch * 0.96) / ih0);
      const iw = Math.max(1, iw0 * fit);
      const ih = Math.max(1, ih0 * fit);
      const ix = (cw - iw) / 2;
      const iy = (ch - ih) / 2;
      const pos: LabelPos[] = labelDefs.map((d) => {
        const x = ix + d.fx * iw;
        const y = iy + d.fy * ih;
        // Shorten the leader so tags don't overflow the frame (mobile 390px in v2.0
        // overflowed horizontally by 132px — violates pro-max §5, no horizontal scroll).
        // v2.7: tag width estimates must have SPARE room (uppercase + letter-spacing
        // make real tags ~10px wider than the old 7.2/18 estimate) — at
        // portrait 1080x1920 the Right tag overflows 6px, Left/Copy/Paste 5-9px
        // past the stage edge and get cut by overflow-hidden (measured with Playwright).
        const tagW = d.title.length * 8.2 + 26;
        const want = d.line ?? 40;
        // Leader floor 4px (not 14): the Copy/Paste anchors sit at the image's left edge
        // (x≈66-73px) — with a floor of 14 the tags still overflow 8-9px past the stage edge at
        // portrait 1080x1920; a floor of 4 pulls tags close to the dot while staying readable.
        const line =
          d.side === 'left'
            ? Math.min(want, Math.max(4, x - tagW - 12))
            : Math.min(want, Math.max(4, cw - x - tagW - 12));
        return { keyIndex: d.keyIndex, title: d.title, side: d.side, x, y, line, dy: d.dy ?? 0 };
      });
      // v3.0: tags on the same side must be spaced apart — v2.8.1 only allowed a gap of
      // ~13px (TAG_MIN_CTR = 38) and Ethan still said it was too tight. Now the minimum
      // separation is TAG_MIN_CTR = 65px center-to-center (visible gap ~40px, about
      // ~3x before): Middle dy -48 (flies up above Right), DPI dy +56
      // (pushed down), the algorithm still only pushes the LOWER tag down and clamps
      // the whole group inside the frame if it overflows below. Only push the lower tag down
      // (never touch the upper tag); connectors only tilt a few more degrees.
      const TAG_H = 25; // .tag: font 11px + padding 4px + border 1px
      const TAG_MIN_CTR = TAG_H + 40;
      for (const side of ['left', 'right'] as const) {
        const group = pos.filter((p) => p.side === side).sort((a, b) => a.y + a.dy - (b.y + b.dy));
        for (let i = 1; i < group.length; i++) {
          const prev = group[i - 1];
          const cur = group[i];
          const minCtr = prev.y + prev.dy + TAG_MIN_CTR;
          if (cur.y + cur.dy < minCtr) cur.dy = minCtr - cur.y;
        }
        const last = group[group.length - 1];
        if (last) {
          const overflow = last.y + last.dy + TAG_H / 2 - ch;
          if (overflow > 0) for (const p of group) p.dy -= overflow;
        }
      }
      setLabels(pos);
      setImgBox({ x: ix, y: iy, w: iw, h: ih });
      setImgSize((prev) => (prev.w === Math.round(iw) && prev.h === Math.round(ih) ? prev : { w: Math.round(iw), h: Math.round(ih) }));
      // Hook for headless tests: click the exact coordinates of each button (frame coordinates).
      (window as unknown as { __mousePhoto?: unknown }).__mousePhoto = {
        ready: true,
        anchors: Object.fromEntries(pos.map((p) => [p.keyIndex, { x: Math.round(p.x), y: Math.round(p.y) }])),
      };
    };
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(layout);
    ro.observe(container);
    layout();
    return () => ro.disconnect();
  }, [labelDefs, imgLoaded]);

  // Glow shape covering exactly each part (ratios on the image, see header): the left/right
  // panels = a large ellipse over the upper half; wheel/DPI = capsule;
  // side buttons = rounded rectangle at the left edge.
  const PART_GLOW: Record<number, { fx: number; fy: number; w: number; h: number; r: string }> = {
    0: { fx: 0.27, fy: 0.22, w: 0.46, h: 0.34, r: '45%' },
    1: { fx: 0.73, fy: 0.22, w: 0.46, h: 0.34, r: '45%' },
    2: { fx: 0.5, fy: 0.227, w: 0.15, h: 0.21, r: '999px' },
    5: { fx: 0.5, fy: 0.398, w: 0.14, h: 0.1, r: '999px' },
    4: { fx: 0.09, fy: 0.41, w: 0.07, h: 0.09, r: '8px' },
    3: { fx: 0.102, fy: 0.546, w: 0.07, h: 0.15, r: '8px' },
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      role="img"
      aria-label="SMAILWOLF M3 Pro mouse photo — click a button on the mouse to assign a key"
    >
      <img
        ref={imgRef}
        src={src}
        alt=""
        draggable={false}
        onLoad={() => setImgLoaded((n) => n + 1)}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none"
        style={imgSize.w > 0 ? { width: imgSize.w, height: imgSize.h } : { height: '96%', width: 'auto' }}
      />
      {/* Orange glow layer covering exactly the hovered part's shape (v2.6). */}
      {Object.entries(PART_GLOW).map(([k, g]) => {
        const i = Number(k);
        return (
          <div
            key={`glow-${i}`}
            aria-hidden="true"
            className={`part-glow${hovered === i ? ' on' : ''}`}
            style={{
              left: imgBox.x + (g.fx - g.w / 2) * imgBox.w,
              top: imgBox.y + (g.fy - g.h / 2) * imgBox.h,
              width: g.w * imgBox.w,
              height: g.h * imgBox.h,
              borderRadius: g.r,
            }}
          />
        );
      })}
      {/* Invisible click areas on each button (44x44, center = anchor measured from the real image) —
          clicking the right button on the image opens the key-assignment popup. */}
      {labels.map((l) => (
        <button
          key={`zone-${l.keyIndex}`}
          type="button"
          className="absolute h-11 w-11 cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-[#c2410c]"
          style={{ left: l.x - 22, top: l.y - 22 }}
          onClick={(e) => onPartClick(l.keyIndex, { x: e.clientX, y: e.clientY })}
          onMouseEnter={() => setHovered(l.keyIndex)}
          onMouseLeave={() => setHovered((h) => (h === l.keyIndex ? null : h))}
          onFocus={() => setHovered(l.keyIndex)}
          onBlur={() => setHovered((h) => (h === l.keyIndex ? null : h))}
          aria-label={`Assign key for ${l.title}`}
        />
      ))}
      {labels.map((l) => (
        <button
          key={l.keyIndex}
          className={`mouse-label${hovered === l.keyIndex ? ' cyber-on' : ''}`}
          style={
            l.side === 'left'
              ? { right: `calc(100% - ${l.x}px)`, top: l.y, flexDirection: 'row' }
              : { left: l.x, top: l.y, flexDirection: 'row' }
          }
          onClick={(e) => {
            onPartClick(l.keyIndex, { x: e.clientX, y: e.clientY });
          }}
          onMouseEnter={() => setHovered(l.keyIndex)}
          onMouseLeave={() => setHovered((h) => (h === l.keyIndex ? null : h))}
          onFocus={() => setHovered(l.keyIndex)}
          onBlur={() => setHovered((h) => (h === l.keyIndex ? null : h))}
          aria-label={`Assign key for ${l.title}`}
        >
          {l.side === 'left' ? (
            <>
              <span className="tag" style={{ transform: `translateY(${l.dy}px)` }}>{l.title}</span>
              <span
                className="leader"
                style={{
                  width: l.line,
                  transform: `rotate(${-Math.atan2(l.dy, l.line)}rad)`,
                  transformOrigin: 'right center',
                }}
                aria-hidden="true"
              />
              <span className="dot" aria-hidden="true" />
            </>
          ) : (
            <>
              <span className="dot" aria-hidden="true" />
              <span
                className="leader"
                style={{
                  width: l.line,
                  transform: `rotate(${Math.atan2(l.dy, l.line)}rad)`,
                  transformOrigin: 'left center',
                }}
                aria-hidden="true"
              />
              <span className="tag" style={{ transform: `translateY(${l.dy}px)` }}>{l.title}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

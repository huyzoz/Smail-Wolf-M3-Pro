/**
 * CursorBlob v3.0 — red liquid-glass blob chasing the pointer across the WHOLE APP
 * (including inside the management frame / device picker).
 *
 * NOT a cursor icon: the system cursor stays visible as normal, the blob
 * only CHASES behind it (lerp 0.12/frame via rAF) like a drop of liquid.
 * Transform + opacity only (GPU), pointer-events: none so it never
 * blocks clicks. Fully hidden under prefers-reduced-motion or on touch screens
 * (xem .cursor-blob trong index.css).
 */
import { useEffect, useRef } from 'react';

export function CursorBlob(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    let tx = -999;
    let ty = -999;
    let x = -999;
    let y = -999;
    let opacity = 0;
    let targetOpacity = 0;
    let raf = 0;
    let lastMove = 0;
    const tick = (): void => {
      if (tx < -100) {
        // Mouse never moved yet: the blob hides off-screen.
        el.style.opacity = '0';
      } else {
        if (x < -100) {
          x = tx;
          y = ty;
        }
        x += (tx - x) * 0.12;
        y += (ty - y) * 0.12;
        // Idle for >2.5s, it fades out (doesn't sit in one spot).
        if (performance.now() - lastMove > 2500) targetOpacity = 0;
        opacity += (targetOpacity - opacity) * 0.08;
        el.style.transform = `translate3d(${x - 28}px, ${y - 28}px, 0)`;
        el.style.opacity = opacity.toFixed(3);
      }
      // v3.0.2 — LAG FIX: don't run rAF forever while the mouse is idle. Stop the
      // loop once the blob has fully faded + stopped moving; onMove restarts it.
      const active =
        targetOpacity > 0 || opacity > 0.01 || performance.now() - lastMove < 2600;
      if (active) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };
    const onMove = (e: PointerEvent): void => {
      tx = e.clientX;
      ty = e.clientY;
      targetOpacity = 1;
      lastMove = performance.now();
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = (): void => {
      targetOpacity = 0;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return <div ref={ref} className="cursor-blob" aria-hidden="true" data-testid="cursor-blob" />;
}

/**
 * CursorBlob v3.0 — blob đỏ kính lỏng đuổi theo con trỏ TOÀN APP
 * (kể cả trong khung quản lý / màn chọn thiết bị).
 *
 * KHÔNG phải icon con trỏ: con trỏ hệ thống vẫn hiện bình thường, blob
 * chỉ ĐUỔI theo sau (lerp 0.12/khung qua rAF) như 1 giọt chất lỏng.
 * Chỉ transform + opacity (GPU), pointer-events: none nên không bao giờ
 * chặn click. Ẩn hẳn khi prefers-reduced-motion hoặc màn cảm ứng
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
        // Chưa di chuột lần nào: blob nấp ngoài màn hình.
        el.style.opacity = '0';
      } else {
        if (x < -100) {
          x = tx;
          y = ty;
        }
        x += (tx - x) * 0.12;
        y += (ty - y) * 0.12;
        // Đứng yên >2.5s thì mờ dần (không nằm chình ình 1 chỗ).
        if (performance.now() - lastMove > 2500) targetOpacity = 0;
        opacity += (targetOpacity - opacity) * 0.08;
        el.style.transform = `translate3d(${x - 28}px, ${y - 28}px, 0)`;
        el.style.opacity = opacity.toFixed(3);
      }
      // v3.0.2 — LAG FIX: đừng chạy rAF mãi khi chuột đứng yên. Dừng vòng
      // lặp khi blob đã mờ hẳn + không còn di chuyển; onMove khởi động lại.
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

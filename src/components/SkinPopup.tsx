/**
 * SkinPopup v3.0 — thay strip ngang v2.7 (bro không muốn lướt ngang nữa):
 * 1 nút layer "Skin" dưới dock Pin -> bấm mở popup TO chứa toàn bộ skin.
 *
 * - Lưới 5 skin / hàng, đủ 5 cái trọn vẹn (không cắt viền), skin đầu tiên
 *   LUÔN là Mặc định; mỗi skin có tên ngay dưới ảnh.
 * - Mở popup -> preload THẬT toàn bộ 67 thumbnail qua Image(), hiện la
 *   bàn ancient-yak-42 + thanh tiến độ thật "n/67". v3.0: BỎ HẲN
 *   PRELOAD_TIMEOUT_MS=10000 (v2.8: timeout resolve bất kể load xong hay
 *   chưa = loading GIẢ) — giờ chỉ tắt loader khi Promise.all settle
 *   hết: ảnh lỗi vẫn tính là xong (không bao giờ kẹt), không timeout.
 *   Overlay loader chỉ BLUR nền (backdrop-blur, KHÔNG dim/mờ màu).
 * - v3.0 VIRTUALIZE lưới: chỉ render các hàng đang thấy (+2 hàng đệm
 *   mỗi phía), hàng ngoài khung không có trong DOM — lướt 67 skin
 *   không còn lag. Hàng cao cố định ROW_PITCH=200px (thẻ ~188px + khe
 *   12px). Full-res (src) chỉ preload LAZY khi rê/chọn 1 skin (hover,
 *   focus, click) — không tải 9MB x 67 lúc mở popup.
 * - Chọn skin trong lưới = chọn tạm (pending). "Áp dụng" mới đổi thật
 *   (stage + localStorage + toast). "Hủy" đóng popup, không đổi gì.
 *   Skin đang dùng có nút "Hủy áp dụng" ngay trên thẻ — bấm là về Mặc
 *   định ngay. Đằng sau popup mờ đen toàn màn hình (portal ra body, như
 *   ConfirmModal v2.6 — tránh bẫy transform của .app-enter).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Check, ChevronRight, X } from 'lucide-react';
import { SKINS, skinById, skinThumbSrc, type SkinDef } from '../lib/skins';
import { useMouse } from '../store';
import { GlassButton, useScrollLock } from './ui';

const COLS = 5;
/** Chiều cao 1 hàng lưới (thẻ ~188px + khe 12px) — virtualize cần cố định. */
const ROW_PITCH = 200;

/** La bàn ancient-yak-42 (Uiverse Nawsome), nguyên văn như LoadingScreen
 *  nhưng KHÔNG logo, ids svg thêm hậu tố -skin để không trùng LoadingScreen. */
function CompassLoader({ done, total }: { done: number; total: number }): React.JSX.Element {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center justify-center py-16" role="status" aria-label="Đang tải skin">
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
        Đang tải skin… {done}/{total}
      </p>
      {/* Thanh tiến độ THẬT — rộng theo done/total, không spinner giả. */}
      <div
        className="mt-3 h-2 w-56 overflow-hidden rounded-full bg-[rgba(22,22,26,0.15)]"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Tiến độ tải skin"
        data-testid="skin-progress"
      >
        <div
          className="h-full rounded-full bg-[#ea580c] transition-[width] duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-[#6b6b76]">Đợi render xong hết {total} skin rồi mới hiện lưới.</p>
    </div>
  );
}

/** Nút layer Skin dưới dock Pin — hiệu ứng hover như các nút khác
 *  (nổi lên + viền cam, mũi tên trượt). */
export function SkinButton({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  const { skinId } = useMouse();
  const cur = skinById(skinId);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Mở bộ sưu tập skin chuột"
      className="dock group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all duration-150 hover:-translate-y-0.5 hover:border-[#ea580c]/60 hover:shadow-[0_8px_24px_rgba(234,88,12,0.18)] focus-visible:outline-2 focus-visible:outline-[#c2410c]"
    >
      <img src={skinThumbSrc(skinId)} alt="" className="h-12 w-12 shrink-0 object-contain" draggable={false} />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold tracking-[0.18em] text-[#6b6b76]">SKIN CHUỘT</span>
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
  // v3.0 virtualize: vị trí lướt hiện tại của khung lưới.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  // Full-res đã preload lazy (hover/focus/chọn) — mỗi skin 1 lần.
  const preloadedFull = useRef(new Set<string>());

  const rows = useMemo(() => {
    const out: (typeof SKINS)[] = [];
    for (let i = 0; i < SKINS.length; i += COLS) out.push(SKINS.slice(i, i + COLS));
    return out;
  }, []);

  // Mở popup: pending = skin đang dùng; preload THẬT toàn bộ thumb rồi
  // mới hiện lưới. KHÔNG timeout giả nữa: Promise.all settle hết mới
  // tắt loader — ảnh lỗi vẫn tính là xong (onerror cũng tick), nên
  // không bao giờ kẹt ở loader.
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

  // Esc đóng popup.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Hook cho headless test: trạng thái preload + số hàng đang render.
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

  /** Lazy full-res: chỉ tải ảnh gốc khi bro rê/chọn skin đó (đủ nét cho
      stage sau khi Áp dụng), không tải 67 ảnh 9MB lúc mở popup. */
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
    addLog(`Đã đổi skin chuột: ${pendingSkin.name}.`);
    onClose();
  };

  const unapply = () => {
    setSkinId('default');
    addLog('Đã hủy áp dụng skin, về Mặc định.');
    onClose();
  };

  const onGridScroll = (): void => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setViewH(el.clientHeight);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Bộ sưu tập skin chuột"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex max-h-[90vh] w-full max-w-[880px] flex-col overflow-hidden rounded-2xl bg-[var(--paper)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header cố định */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[rgba(22,22,26,0.12)] px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-semibold tracking-wide text-[#16161a]">SKIN CHUỘT</h2>
            <p className="truncate text-xs text-[#6b6b76]">
              {SKINS.length} skin · Đang dùng: <span className="font-semibold text-[#ea580c]">{applied.name}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgba(22,22,26,0.12)] bg-white/70 text-[#16161a] transition-colors hover:border-[#ea580c] hover:text-[#ea580c] focus-visible:outline-2 focus-visible:outline-[#c2410c]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Lưới VIRTUALIZE (v3.0): chỉ render hàng đang thấy (+2 đệm).
            Khung lướt là flex-item (flex-1 min-h-0) — xem fix v2.8.2. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={onGridScroll}
            className="min-h-0 flex-1 overflow-y-auto p-4"
            role="listbox"
            aria-label="Chọn skin chuột"
            data-testid="skin-grid"
          >
            <div className="relative" style={{ height: rows.length * ROW_PITCH }}>
              {rows.slice(visStart, visEnd).map((row, k) => {
                const ri = visStart + k;
                return (
                  <div
                    key={ri}
                    className="absolute inset-x-0 grid grid-cols-5 gap-3"
                    style={{ top: ri * ROW_PITCH, height: ROW_PITCH - 12 }}
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
                              ĐANG DÙNG
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
                              Hủy áp dụng
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
            <div className="skin-loading-veil absolute inset-0 z-10 flex items-center justify-center backdrop-blur-md" role="status" aria-label="Đang tải skin">
              <div className="rounded-3xl bg-[var(--surface-solid)] px-6 shadow-xl">
                <CompassLoader done={done} total={SKINS.length} />
              </div>
            </div>
          )}
        </div>

        {/* Footer cố định */}
        <div className="flex shrink-0 items-center gap-3 border-t border-[rgba(22,22,26,0.12)] px-5 py-3">
          <p className="min-w-0 flex-1 truncate text-xs text-[#6b6b76]">
            {changed ? (
              <>
                Sẽ đổi thành: <span className="font-semibold text-[#16161a]">{pendingSkin.name}</span>
              </>
            ) : (
              <>Đã chọn: {pendingSkin.name}</>
            )}
          </p>
          <GlassButton variant="ghost" onClick={onClose}>
            Hủy
          </GlassButton>
          <GlassButton variant="primary" onClick={apply} disabled={!loaded || !changed}>
            Áp dụng
          </GlassButton>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

/**
 * UI primitives v2.0 — "TRANSISTOR" theme (paper + navy panel + orange).
 * Rules applied (ui-ux-pro-max §1-§3 + §7): 44px targets, visible focus,
 * no emoji as icons, contrast ≥4.5:1, reduced-motion respected (index.css).
 * Buttons stay SINGLE-layer (v1.1 lesson — no z-index:-1 decoration).
 */
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Power } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useMouse } from '../store';

// --- Khóa lướt nền khi popup mở (v2.5, theo yêu cầu bro): popup nào hiện
// lên che đen đằng sau cũng phải cố định 1 chỗ, nền sau CẤM lướt. Khóa cả
// body (mobile cuộn trang) lẫn khung cuộn trong panel trái (desktop cuộn
// trong panel) — popup fixed vẫn hiện đủ khung, nội dung popup tự cuộn
// riêng (max-h + overflow-y-auto của nó không bị khóa).
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    const prevBody = body.style.overflow;
    body.style.overflow = 'hidden';
    const panel = document.querySelector('#left-panel .min-h-0.flex-1.overflow-y-auto') as HTMLElement | null;
    const prevPanel = panel ? panel.style.overflow : '';
    if (panel) panel.style.overflow = 'hidden';
    return () => {
      body.style.overflow = prevBody;
      if (panel) panel.style.overflow = prevPanel;
    };
  }, [active]);
}

// --- Mũi tên 3 chevron của shy-moth-10 (Uiverse Li-Deheng, v2.5): SVG gốc
// thu nhỏ, id (#arrow-icon-*) đổi thành class (.uiv-shy-a1/a2/a3) để dùng
// nhiều nút trên 1 trang không trùng id. Màu fill = currentColor (trắng
// trên nút cam, xám trên nút chưa chọn); hover nhấp nháy về màu nền nút
// (uiv-shy-color, xem index.css). ---
export function ShyArrow({ small = false }: { small?: boolean } = {}): React.JSX.Element {
  return (
    <svg
      className={`uiv-shy-arrow${small ? ' uiv-shy-arrow-sm' : ''}`}
      viewBox="0 0 66 43"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <g stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
        <path
          className="uiv-shy-a1"
          d="M40.1543933,3.89485454 L43.9763149,0.139296592 C44.1708311,-0.0518420739 44.4826329,-0.0518571125 44.6771675,0.139262789 L65.6916134,20.7848311 C66.0855801,21.1718824 66.0911863,21.8050225 65.704135,22.1989893 C65.7000188,22.2031791 65.6958657,22.2073326 65.6916762,22.2114492 L44.677098,42.8607841 C44.4825957,43.0519059 44.1708242,43.0519358 43.9762853,42.8608513 L40.1545186,39.1069479 C39.9575152,38.9134427 39.9546793,38.5968729 40.1481845,38.3998695 C40.1502893,38.3977268 40.1524132,38.395603 40.1545562,38.3934985 L56.9937789,21.8567812 C57.1908028,21.6632968 57.193672,21.3467273 57.0001876,21.1497035 C56.9980647,21.1475418 56.9959223,21.1453995 56.9937605,21.1432767 L40.1545208,4.60825197 C39.9574869,4.41477773 39.9546013,4.09820839 40.1480756,3.90117456 C40.1501626,3.89904911 40.1522686,3.89694235 40.1543933,3.89485454 Z"
          fill="currentColor"
        />
        <path
          className="uiv-shy-a2"
          d="M20.1543933,3.89485454 L23.9763149,0.139296592 C24.1708311,-0.0518420739 24.4826329,-0.0518571125 24.6771675,0.139262789 L45.6916134,20.7848311 C46.0855801,21.1718824 46.0911863,21.8050225 45.704135,22.1989893 C45.7000188,22.2031791 45.6958657,22.2073326 45.6916762,22.2114492 L24.677098,42.8607841 C24.4825957,43.0519059 24.1708242,43.0519358 23.9762853,42.8608513 L20.1545186,39.1069479 C19.9575152,38.9134427 19.9546793,38.5968729 20.1481845,38.3998695 C20.1502893,38.3977268 20.1524132,38.395603 20.1545562,38.3934985 L36.9937789,21.8567812 C37.1908028,21.6632968 37.193672,21.3467273 37.0001876,21.1497035 C36.9980647,21.1475418 36.9959223,21.1453995 36.9937605,21.1432767 L20.1545208,4.60825197 C19.9574869,4.41477773 19.9546013,4.09820839 20.1480756,3.90117456 C20.1501626,3.89904911 20.1522686,3.89694235 20.1543933,3.89485454 Z"
          fill="currentColor"
        />
        <path
          className="uiv-shy-a3"
          d="M0.154393339,3.89485454 L3.97631488,0.139296592 C4.17083111,-0.0518420739 4.48263286,-0.0518571125 4.67716753,0.139262789 L25.6916134,20.7848311 C26.0855801,21.1718824 26.0911863,21.8050225 25.704135,22.1989893 C25.7000188,22.2031791 25.6958657,22.2073326 25.6916762,22.2114492 L4.67709797,42.8607841 C4.48259567,43.0519059 4.17082418,43.0519358 3.97628526,42.8608513 L0.154518591,39.1069479 C-0.0424848215,38.9134427 -0.0453206733,38.5968729 0.148184538,38.3998695 C0.150289256,38.3977268 0.152413239,38.395603 0.154556228,38.3934985 L16.9937789,21.8567812 C17.1908028,21.6632968 17.193672,21.3467273 17.0001876,21.1497035 C16.9980647,21.1475418 16.9959223,21.1453995 16.9937605,21.1432767 L0.15452076,4.60825197 C-0.0425130651,4.41477773 -0.0453986756,4.09820839 0.148075568,3.90117456 C0.150162624,3.89904911 0.152268631,3.89694235 0.154393339,3.89485454 Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

// --- Primary button — single-layer (v1.1 fix kept) ---
export function GlassButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  className?: string;
}): React.JSX.Element {
  const cls =
    variant === 'ghost' ? 'uiv-btn uiv-btn-ghost' : variant === 'danger' ? 'uiv-btn uiv-btn-danger' : 'uiv-btn';
  return (
    <button type={type} className={`${cls} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// --- Ghost button with floating orange blob (Uiverse purple-otter-7).
// The blob svg has pointer-events:none (CSS) so it can never eat a click. ---
export function BlobButton({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <button type="button" className={`uiv-blob-btn ${className}`} onClick={onClick} disabled={disabled}>
      <span className="relative z-[1] inline-flex items-center gap-2">{children}</span>
      <svg viewBox="0 0 200 200" className="uiv-blob-svg" aria-hidden="true">
        <path
          transform="translate(100 100)"
          d="M56.8,-23.9C61.7,-3.2,45.7,18.8,26.5,31.7C7.2,44.6,-15.2,48.2,-35.5,36.5C-55.8,24.7,-73.9,-2.6,-67.6,-25.2C-61.3,-47.7,-30.6,-65.6,-2.4,-64.8C25.9,-64.1,51.8,-44.7,56.8,-23.9Z"
        />
      </svg>
    </button>
  );
}

// --- Toggle switch (canonical pattern, orange) ---
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  compact = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  /** compact: bỏ min-h 44px, chữ nhỏ — để nhét công tắc vào 1 hàng
      (Hiệu năng v2.4: "Never sleep" nằm chung hàng tiêu đề Ngủ đông). */
  compact?: boolean;
}): React.JSX.Element {
  return (
    <label className={`flex cursor-pointer items-center gap-3 ${compact ? '' : 'min-h-[44px]'}`}>
      <span className="uiv-switch">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
        />
        <span className="uiv-track" />
      </span>
      <span className={compact ? 'text-xs' : 'text-sm'}>{label}</span>
    </label>
  );
}

// --- Neon power switch (Uiverse quick-moth-22, orange glow) ---
export function PowerSwitch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id: string;
}): React.JSX.Element {
  return (
    <div className="flex min-h-[44px] items-center gap-4">
      <input
        id={id}
        className="uiv-power-input"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <label className="uiv-power" htmlFor={id}>
        <Power className="h-6 w-6" aria-hidden="true" />
      </label>
      <span className="text-sm">{label}</span>
    </div>
  );
}

// --- Segmented control (v2.5: shy-moth-10 thay viền xoay serious-monkey-58)
// Nút đang chọn = pill cam + chữ trắng + mũi tên 3 chevron; nút chưa chọn
// = pill tối + chữ xám. Hover: outline pulse + mũi tên trượt + chevron
// nhấp nháy (cơ chế shy-moth-10 nguyên văn, xem index.css .uiv-shy-btn).
// Tag (P1…/正向…) giữ nguyên, đổi màu theo trạng thái chọn. ---
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  name,
  columns = 2,
}: {
  options: { value: T; label: string; tag?: string }[];
  value: T;
  onChange: (v: T) => void;
  name: string;
  columns?: 2 | 4;
}): React.JSX.Element {
  return (
    <div
      className={`grid gap-2 ${columns === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}
      role="radiogroup"
      aria-label={name}
    >
      {options.map((o) => {
        const selected = value === o.value;
        const tagCls = selected ? 'bg-white/20 text-white' : 'bg-[#facc15]/15 text-[#facc15]';
        const tag = o.tag ? (
          <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${tagCls}`}>{o.tag}</span>
        ) : null;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`uiv-shy-btn ${selected ? 'uiv-shy-selected' : ''}`}
          >
            {o.label}
            {tag}
            <ShyArrow />
          </button>
        );
      })}
    </div>
  );
}

// --- Range slider (Uiverse bright-swan-54, orange gradient) ---
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  ariaLabel: string;
}): React.JSX.Element {
  return (
    <input
      type="range"
      className="uiv-slider"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

// --- Dark panel card (inside the navy left frame, ảnh 3) ---
export function GlassCard({
  children,
  className = '',
  hover = false,
  compact = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  /** compact: padding 10px thay vì 20px — để trang Hiệu năng vừa khung
      không cần lướt ở 1366x768 (v2.4). */
  compact?: boolean;
}): React.JSX.Element {
  return (
    <motion.div
      whileHover={hover ? { y: -4 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={`panel-card ${compact ? 'p-2.5' : 'p-5'} ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }): React.JSX.Element {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-[15px] font-semibold text-[#edebe6]">{children}</h3>
      {right}
    </div>
  );
}

// --- Donut (battery) — SVG ring, orange on navy ---
export function Donut({
  value,
  size = 110,
  label,
  sub,
  accent = '#ea580c',
}: {
  value: number; // 0..100
  size?: number;
  label: string;
  sub?: string;
  /** v3.1: màu vòng — vàng (#eab308) khi Tiết kiệm pin bật. */
  accent?: string;
}): React.JSX.Element {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="11" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={accent}
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={off}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-[#edebe6]">{value}%</span>
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold text-[#edebe6]">{label}</div>
        {sub && <div className="mt-1 text-xs text-[#a2a2b0]">{sub}</div>}
      </div>
    </div>
  );
}

// --- Toasts v2.4 (Uiverse empty-wolverine-58, Cybercom682 — NGUYÊN VĂN) ---
// Activity Log ĐÃ XÓA — mọi thông báo giờ là toast NGẮN ở ĐẦU trang.
// Banner verbatim: border-l-4 + rounded-lg + flex items-center +
// transition duration-300 ease-in-out + hover:bg-…-200 + hover:scale-105,
// icon "i" tròn h-5 w-5, chữ text-xs font-semibold. Màu theo kind:
// ok = xanh lá, info = xanh dương, err = đỏ. (Bỏ biến thể dark: của gốc
// vì app không dùng class dark của Tailwind; nền pastel sáng hợp nền giấy.)
// Vào/ra: framer-motion trượt từ trên xuống + fade (chỉ transform/opacity,
// rẻ GPU) — bản gốc không có animation tự chạy, chỉ có hover scale.
export function Toasts(): React.JSX.Element {
  const { toasts } = useMouse();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-[min(480px,100%)] space-y-2">
        <AnimatePresence>
          {toasts.map((t) => {
            const color =
              t.kind === 'ok'
                ? 'bg-green-100 border-green-500 text-green-900 hover:bg-green-200'
                : t.kind === 'err'
                  ? 'bg-red-100 border-red-500 text-red-900 hover:bg-red-200'
                  : 'bg-blue-100 border-blue-500 text-blue-900 hover:bg-blue-200';
            const iconColor = t.kind === 'ok' ? 'text-green-600' : t.kind === 'err' ? 'text-red-600' : 'text-blue-600';
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                role={t.kind === 'err' ? 'alert' : 'status'}
                className={`flex items-center rounded-lg border-l-4 p-2 transition duration-300 ease-in-out hover:scale-105 ${color}`}
              >
                {t.kind === 'ok' ? (
                  <svg
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    fill="none"
                    className={`mr-2 h-5 w-5 shrink-0 ${iconColor}`}
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : t.kind === 'err' ? (
                  <svg
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    fill="none"
                    className={`mr-2 h-5 w-5 shrink-0 ${iconColor}`}
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <svg
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    fill="none"
                    className={`mr-2 h-5 w-5 shrink-0 ${iconColor}`}
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M13 16h-1v-4h1m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                <p className="text-xs font-semibold">{t.text}</p>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- Confirm modal (dark navy) ---
export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}): React.JSX.Element | null {
  // v2.5: modal mở thì khóa lướt nền (body + khung cuộn panel) — popup
  // cố định 1 chỗ, người dùng xem + tương tác trọn vẹn khung đó.
  // v2.6: PORTAL ra document.body — Shell có class .app-enter giữ
  // transform: translateY(0) (animation fill both), transform trên tổ tiên
  // làm fixed inset-0 chỉ phủ đúng khung Shell (max-w 1440, 2 mép ngoài
  // không mờ — đúng lỗi bro chụp). Portal thì phủ toàn viewport.
  useScrollLock(open);
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="panel-card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-[#edebe6]">{title}</h3>
        <div className="mt-3 text-sm leading-relaxed text-[#c9c9d6]">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          <GlassButton variant="ghost" onClick={onCancel}>
            Hủy
          </GlassButton>
          <GlassButton variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </GlassButton>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

// --- Slide-up confirm modal (v3.0.4, update confirm) ---
// Giống ConfirmModal nhưng panel TRƯỢT LÊN từ giữa màn hình (y: 24 -> 0)
// thay vì scale — dùng cho xác nhận cập nhật: "Bạn có muốn cập nhật lên
// v... không?" + dòng ghi phiên bản cũ sẽ được gỡ, thay bằng bản mới.
export function SlideUpConfirmModal({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  confirmDisabled = false,
  extraActionLabel,
  onExtraAction,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** v3.0.6 — disable the confirm button while an update is downloading. */
  confirmDisabled?: boolean;
  /** v3.0.6 — optional third action on the left (e.g. "Mở trên GitHub" on error). */
  extraActionLabel?: string;
  onExtraAction?: () => void;
}): React.JSX.Element | null {
  useScrollLock(open);
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="panel-card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-[#edebe6]">{title}</h3>
        <div className="mt-3 text-sm leading-relaxed text-[#c9c9d6]">{children}</div>
        <div className="mt-6 flex justify-end gap-3">
          {extraActionLabel && onExtraAction ? (
            <GlassButton variant="ghost" onClick={onExtraAction} className="mr-auto">
              {extraActionLabel}
            </GlassButton>
          ) : undefined}
          <GlassButton variant="ghost" onClick={onCancel}>
            Hủy
          </GlassButton>
          <GlassButton variant="primary" onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </GlassButton>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

// --- Square snake loader (Uiverse grumpy-stingray-26, dark bg only) ---
export function SnakeLoader({ label }: { label?: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3" role="status" aria-label={label ?? 'Đang tải'}>
      <div className="uiv-snake" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="uiv-snake-square" />
        ))}
      </div>
      {label && <span className="text-sm text-[#a2a2b0]">{label}</span>}
    </div>
  );
}

// --- Bottom marquee strip (ảnh 1) ---
export function Marquee({ items }: { items: string[] }): React.JSX.Element {
  const row = items.join('  •  ');
  return (
    <div className="marquee border-y border-[rgba(22,22,26,0.2)] py-2" aria-hidden="true">
      <div className="marquee-track font-mono2 text-[11px] font-medium tracking-[0.18em] text-[#55555c] uppercase">
        <span className="pr-8">{row} •&nbsp;</span>
        <span className="pr-8">{row} •&nbsp;</span>
      </div>
    </div>
  );
}

// --- Page header inside the left panel (Oswald display + mono sub) ---
export function PageHead({ title, subtitle, compact = false }: { title: string; subtitle?: string; compact?: boolean }): React.JSX.Element {
  return (
    <div className={compact ? 'mb-3' : 'mb-4'}>
      <h2 className={`font-display leading-none font-semibold tracking-wide text-[#edebe6] uppercase ${compact ? 'text-[22px]' : 'text-[26px]'}`}>
        {title}
      </h2>
      {subtitle ? <p className="mt-1.5 text-[13px] text-[#a2a2b0]">{subtitle}</p> : null}
    </div>
  );
}

// --- Small helpers ---
export function FieldLabel({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="font-mono2 mb-1.5 text-[11px] font-semibold tracking-[0.14em] text-[#a2a2b0] uppercase">
      {children}
    </div>
  );
}

export function EmptyState({ text }: { text: string }): React.JSX.Element {
  return <div className="py-8 text-center text-sm text-[#a2a2b0]">{text}</div>;
}

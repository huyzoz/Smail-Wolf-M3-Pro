/**
 * Màn chọn thiết bị v3.0 — redesign: KHUNG QUẢN LÝ trong suốt trên nền
 * lưới ô vuông (giống hệt nền ngoài khung — cùng token --grid-line /
 * --paper của body, ô 56px; trong == ngoài, không còn nền sao tối tách
 * biệt). Khung chỉ là viền + góc bản vẽ, nền trong suốt nên lưới chạy
 * liền mạch qua khung.
 * - Mở màn: navigator.hid.getDevices() liệt kê thiết bị ĐÃ cấp quyền.
 * - Bấm "Thêm thiết bị mới": navigator.hid.requestDevice({filters:
 *   [{usagePage: 0xFF01, usage: 0x10}]}) mở hộp chọn thiết bị của trình
 *   duyệt — chọn xong thiết bị mới hiện vào danh sách. Bấm Hủy trong
 *   dialog thì thôi, không lỗi.
 * - Danh sách = mọi thiết bị Smailwolf quét được (có dây qua VID 43172,
 *   2.4G qua VID 43173/14391). Bấm card là kết nối ĐÚNG thiết bị đó
 *   (store.connect('live', device)).
 * - Demo KHÔNG còn là card thiết bị nữa — chỉ là dòng link nhỏ dưới
 *   danh sách ("Không có chuột ở đây? Dùng thử Demo (mô phỏng)").
 * - PickerFx v3.0: ô vuông lưới gần con trỏ NỔI LÊN theo chuột (canvas,
 *   transform/opacity-only qua vẽ lại, rAF) + hào quang cam đi theo.
 *   Tôn trọng prefers-reduced-motion (tắt hẳn). Blob đỏ kính lỏng toàn
 *   app nằm ở CursorBlob (App root), không phải ở đây.
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
  if (vendorId === WIRED_VID) return 'Có dây · USB';
  if (vendorId === 43173 || vendorId === 14391) return '2.4G · USB Receiver';
  return 'HID · Smailwolf';
}

/** Nền tương tác (v3.0): ô vuông lưới gần con trỏ nổi lên + hào quang
    cam đi theo. Canvas phủ đúng khung picker, chỉ vẽ ô nổi + glow
    (đường lưới nền do CSS .picker-bg vẽ, giống hệt body). rAF,
    tôn trọng prefers-reduced-motion (tắt hẳn). */
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
      // v3.0.2 — LAG FIX: vòng rAF dừng khi chuột đứng yên (xem cuối tick);
      // di chuột lại thì khởi động vòng lặp.
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
        // Hào quang cam mềm đi theo con trỏ.
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 220);
        g.addColorStop(0, 'rgba(255,90,31,0.13)');
        g.addColorStop(0.55, 'rgba(255,90,31,0.05)');
        g.addColorStop(1, 'rgba(255,90,31,0)');
        ctx.fillStyle = g;
        ctx.fillRect(gx - 220, gy - 220, 440, 440);
        // Ô vuông gần con trỏ NỔI LÊN: càng gần càng sáng + nhích lên.
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
            // v3.0.2 — bỏ shadowBlur (đắt nhất trên iGPU yếu); chỉ fill +
            // stroke đã đủ hiệu ứng ô vuông nổi lên.
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
      // v3.0.2 — LAG FIX: dừng vòng rAF khi chuột đứng yên >1.5s. Khung hình
      // cuối vẫn giữ nguyên trên canvas (hào quang + ô vuông đứng yên) nên
      // nhìn không đổi, nhưng CPU/iGPU được nghỉ; di chuột lại thì onMove
      // khởi động vòng lặp.
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
      // Quét lúc mở màn lỗi thì để danh sách trống, bro bấm quét lại.
    }
  }, [mergeDevices]);

  useEffect(() => {
    void scanGranted();
  }, [scanGranted]);

  // Bấm là mở hộp chọn thiết bị của trình duyệt (dialog HID) — quét thật.
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
      // Bấm Hủy trong dialog HID → thôi, không báo lỗi.
    } finally {
      setScanning(false);
    }
  };

  const cardCls =
    'group flex w-full max-w-[240px] flex-col items-center rounded-2xl border border-[var(--line-paper)] bg-[var(--surface)] p-5 text-center shadow-[0_8px_24px_rgba(22,22,26,0.08)] transition hover:-translate-y-1 hover:border-[#ff5a1f]/60 hover:shadow-[0_12px_28px_rgba(234,88,12,0.18)] focus-visible:outline-2 focus-visible:outline-[#ff5a1f] active:scale-[0.98] disabled:opacity-50';

  return (
    <div className="picker-bg relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-8" data-testid="device-picker">
      <PickerFx />
      {/* Logo brand 800px (map theo theme) — góc trên trái. */}
      <div className="absolute top-6 left-6 z-10">
        <img src={brandLogoSrc(theme)} alt="SMAILWOLF" className="h-9 w-auto" />
      </div>

      {/* KHUNG QUẢN LÝ (v3.0): viền + góc bản vẽ, NỀN TRONG SUỐT — lưới ô
          vuông ngoài khung chạy liền mạch vào trong (trong == ngoài). */}
      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center rounded-[28px] border border-[var(--line-paper)] px-6 py-8 shadow-[0_20px_60px_rgba(22,22,26,0.10)] sm:px-10" data-testid="device-frame">
        <span className="pointer-events-none absolute top-3 left-3 h-5 w-5 border-t-2 border-l-2 border-[var(--line-paper)]" aria-hidden="true" />
        <span className="pointer-events-none absolute top-3 right-3 h-5 w-5 border-t-2 border-r-2 border-[var(--line-paper)]" aria-hidden="true" />
        <span className="pointer-events-none absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-[var(--line-paper)]" aria-hidden="true" />
        <span className="pointer-events-none absolute right-3 bottom-3 h-5 w-5 border-r-2 border-b-2 border-[var(--line-paper)]" aria-hidden="true" />
        <h1 className="text-center font-display text-2xl font-bold tracking-wide text-[var(--ink)] sm:text-3xl">
          KẾT NỐI CHUỘT SMAILWOLF
        </h1>
        <p className="mt-2 text-center text-sm text-[var(--muted-paper)]">
          Quét rộng — mọi thiết bị Smailwolf đang cắm hoặc đã ghép nối sẽ hiện ở đây. Bấm card để kết nối.
        </p>

        {/* Nút "Thêm thiết bị mới" (cam, kiểu app gốc) — bấm để quét thật. */}
        <button
          type="button"
          onClick={() => void scanNew()}
          disabled={scanning || connecting}
          className="uiv-shy-btn uiv-shy-selected mt-6 px-6 py-3 text-[15px] disabled:opacity-60"
        >
          <Plus className="h-5 w-5" />
          {scanning ? 'Đang quét…' : 'Thêm thiết bị mới'}
          <ShyArrow />
        </button>

        <p className="mt-4 text-sm text-[var(--muted-paper)]">
          {`Tìm thấy ${devices.length} thiết bị`}
          {!hidSupported ? ' — trình duyệt này không có WebHID, dùng Demo bên dưới.' : ''}
        </p>

        {/* Danh sách thiết bị QUÉT ĐƯỢC — hiện ĐÚNG PNG chuột anime. */}
        {devices.length === 0 ? (
          <div className="mt-8 w-full max-w-[240px] rounded-2xl border border-dashed border-[var(--line-paper)] p-5 text-center">
            <img src={skinThumbSrc(skinId)} alt="" className="mx-auto h-28 w-auto opacity-40" />
            <p className="mt-4 text-sm font-semibold text-[var(--ink)]">Chưa thấy thiết bị nào</p>
            <p className="mt-1 text-xs text-[var(--muted-paper)]">Cắm chuột / bật dongle rồi bấm “Thêm thiết bị mới” để quét.</p>
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
                  aria-label={`Kết nối ${name} qua ${modeLabel(d.vendorId)}`}
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

        {/* Demo tách riêng khỏi danh sách thiết bị (không phải card quét). */}
        <button
          type="button"
          onClick={() => void connect('demo')}
          disabled={connecting}
          className="mt-8 text-sm text-[var(--muted-paper)] underline decoration-[var(--line-paper)] underline-offset-4 hover:text-[var(--ink)] disabled:opacity-50"
        >
          Không có chuột ở đây? Dùng thử Demo (mô phỏng)
        </button>

        <p className="mt-4 text-xs text-[var(--muted-paper)]">
          Ngắt kết nối ở giao diện chính để quay lại đây.
        </p>
      </div>
    </div>
  );
}

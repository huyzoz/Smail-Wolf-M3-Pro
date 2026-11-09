/**
 * App v3.0 — vỏ vừa đúng 1 viewport ở desktop (pro-max §5 Layout:
 * Data-Dense Dashboard, density 9): h-dvh + overflow-hidden, topbar gọn,
 * panel trái đẩy sát lên dưới header, 4 dock dồn sang cột phải xếp 2x2,
 * chuột nằm dưới chúng — KHÔNG còn scroll trang, KHÔNG còn scroll lồng
 * trong panel. Mobile (<lg) vẫn cuộn trang bình thường.
 * v2.5: mở app → màn chọn thiết bị (DevicePicker, kiểu app gốc ảnh 3) →
 * bấm card chuột → kết nối → loading 3s đúng (ancient-yak-42, che mờ
 * hết phía sau) → giao diện chính trôi lên (app-enter).
 * v3.0: blob đỏ kính lỏng đuổi theo con trỏ toàn app (CursorBlob) +
 * defs SVG của theme-switch Uiverse render 1 lần + dải sáng sweep mỗi
 * lần đổi theme (không đổi tức thì).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Battery, Cpu, Gauge, Radio } from 'lucide-react';
import { MouseProvider, useMouse } from './store';
import { TopBar } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { MouseStage } from './components/MouseStage';
import { SkinButton, SkinPopup } from './components/SkinPopup';
import DevicePicker from './components/DevicePicker';
import LoadingScreen from './components/LoadingScreen';
import { CursorBlob } from './components/CursorBlob';
import { ThemeSwitchDefs } from './components/ThemeToggle';
import { Marquee, Toasts, SlideUpConfirmModal } from './components/ui';
import { pollingHz } from './lib/hid';
import {
  checkAppUpdate,
  openUpdateSetup,
  formatReleaseTimeWithWeekday,
  type AppUpdateInfo,
} from './lib/updater';

function Docks(): React.JSX.Element {
  const { config, simPctPrecise, simCharging, simSaver, version, mouseName, wired } = useMouse();
  const currentDpi = config ? config.dpi[config.dpiIndex] : null;
  const items = [
    {
      label: 'DPI hiện tại',
      value: currentDpi ? currentDpi.toLocaleString('vi-VN') : '—',
      sub: config ? `Nấc ${config.dpiIndex + 1}/6` : 'Chưa kết nối',
      icon: <Gauge className="h-4 w-4 text-[#c2410c]" />,
    },
    {
      label: 'Polling rate',
      value: config ? pollingHz(config.reportRateIndex, wired) : '—',
      sub: wired ? 'Có dây (125/500/1000)' : '2.4G (125/250/500/1000)',
      icon: <Radio className="h-4 w-4 text-[#c2410c]" />,
    },
    {
      label: 'Pin (ước tính)',
      value: config ? `${simPctPrecise.toFixed(1)}%` : '—',
      sub: !config ? 'Chưa kết nối' : simCharging ? 'Đang sạc · ước tính' : simSaver ? 'Tiết kiệm pin · ước tính' : 'Mô phỏng · ước tính',
      icon: <Battery className={`h-4 w-4 ${simSaver ? 'text-[#ca8a04]' : 'text-[#c2410c]'}`} />,
    },
    {
      label: 'Firmware',
      value: version || '—',
      sub: mouseName ? mouseName : 'Chưa đọc được tên chuột',
      icon: <Cpu className="h-4 w-4 text-[#c2410c]" />,
    },
  ];
  return (
    <div className="mt-2 grid shrink-0 grid-cols-2 gap-2" aria-label="Thông số chuột">
      {items.map((it) => (
        <div key={it.label} className="dock px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono2 text-[10px] font-semibold tracking-[0.16em] text-[#55555c] uppercase">
                {it.label}
              </div>
              <div className="font-display mt-1 truncate text-[24px] leading-none font-semibold text-[#16161a]">
                {it.value}
              </div>
              <div className="font-mono2 mt-1 truncate text-[10px] text-[#55555c]">{it.sub}</div>
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(22,22,26,0.12)] bg-white/60">
              {it.icon}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Shell(): React.JSX.Element {
  // v2.5: app-enter chỉ gắn khi hết loading — giao diện chính trôi lên
  // SAU khi màn loading 3s xong (gắn class lúc đó thì animation mới chạy).
  const { loading } = useMouse();
  // v2.8: popup skin (thay strip ngang v2.7).
  const [skinOpen, setSkinOpen] = useState(false);
  return (
    <div className={`relative mx-auto flex min-h-dvh max-w-[1440px] flex-col px-4 pb-2 lg:h-dvh lg:overflow-hidden${loading ? '' : ' app-enter'}`}>
      {/* Góc khung bản vẽ (ảnh 1) */}
      <div className="pointer-events-none absolute top-2 left-2 hidden h-6 w-6 border-t-2 border-l-2 border-[rgba(22,22,26,0.5)] lg:block" aria-hidden="true" />
      <div className="pointer-events-none absolute top-2 right-2 hidden h-6 w-6 border-t-2 border-r-2 border-[rgba(22,22,26,0.5)] lg:block" aria-hidden="true" />
      <TopBar />
      {/* Layout v2.2 theo yêu cầu của bro: panel trái đẩy sát lên ngay dưới
          header; 4 dock dồn hết sang cột phải, xếp 2 ô 1 dòng (2x2), chuột
          3D nằm dưới chúng. Không còn hàng dock ngang phía trên nữa. */}
      <main className="mt-2 grid flex-1 grid-cols-[minmax(0,1fr)] gap-3 lg:min-h-0 lg:grid-cols-[minmax(380px,40%)_1fr]">
        <LeftPanel />
        <div className="flex min-w-0 flex-col gap-3 lg:min-h-0">
          <Docks />
          {/* v2.8: nút layer SKIN ngay dưới dock Pin (thay strip ngang
              v2.7 — bro không muốn lướt ngang nữa) -> bấm mở popup to
              chứa toàn bộ skin, 5 skin/hàng. */}
          <SkinButton onOpen={() => setSkinOpen(true)} />
          <SkinPopup open={skinOpen} onClose={() => setSkinOpen(false)} />
          <MouseStage />
        </div>
      </main>
      <div className="mt-3 shrink-0">
        <Marquee
          items={[
            'NOTHING IDLE',
            'EVERY CLICK JUSTIFIED',
            'EVERY DPI EARNED',
            'NO WASTED CYCLES',
            'DESIGNED AT THE TRANSISTOR',
            'PAW3311 · 12000 DPI',
          ]}
        />
      </div>
      {/* Footer dài ("SMAILWOLF M3 Pro — Driver remake...") ĐÃ XÓA theo yêu
          cầu của bro (text thừa, tốn diện tích). Các giới hạn trung thực
          (macro chỉ ghi, không LED, Demo là mô phỏng) vẫn ghi đúng chỗ
          trong từng tab, không cần nhắc lại ở chân trang. */}
      {/* Toasts dời lên Root (v2.5) để hiện được cả ở màn chọn thiết bị
          (VD: bấm card Live mà lỗi) — không render 2 lần ở đây nữa. */}
    </div>
  );
}

export default function App(): React.JSX.Element {
  return (
    <MouseProvider>
      <Root />
    </MouseProvider>
  );
}

// v2.5: chưa kết nối → màn chọn thiết bị (kiểu app gốc); đã kết nối →
// giao diện chính; đang load 3s → overlay la bàn che mờ hết phía trên.
// v3.0: CursorBlob (blob đỏ đuổi theo con trỏ toàn app) + ThemeSwitchDefs
// (filters #sketchy/#sketchy-sm, 1 lần duy nhất) + dải sáng sweep mỗi
// lần đổi theme.
function Root(): React.JSX.Element {
  const { connected, loading, theme } = useMouse();
  const [sweepKey, setSweepKey] = useState(0);
  const firstTheme = useRef(true);
  // v3.0.3 — adaptive window: Rust sizes the frame to the monitor
  // (1280x720 x scale, never fullscreen). Zoom the whole document so
  // the 1280x720 design always fills the frame exactly — every layer
  // stays intact, nothing reflows or clips. Clamped [0.4, 1]: never zoom
  // in, never shrink past readable. The tray popup is a separate window
  // and never gets this zoom (it renders TrayPopupPage, not Root).
  // NOTE: after zoom is applied, window.innerWidth is in zoomed CSS px
  // (physical / zoom), so the physical width must be recovered as
  // innerWidth * currentZoom — computing zoom from innerWidth alone
  // would flip-flop between two values on every resize event.
  useLayoutEffect(() => {
    const applyZoom = (): void => {
      const current = parseFloat(document.documentElement.style.zoom || '1') || 1;
      const physicalW = window.innerWidth * current;
      const physicalH = window.innerHeight * current;
      const z = Math.min(
        1,
        Math.max(0.4, Math.min(physicalW / 1280, physicalH / 720)),
      );
      document.documentElement.style.zoom = String(z);
    };
    applyZoom();
    window.addEventListener('resize', applyZoom);
    return () => {
      window.removeEventListener('resize', applyZoom);
      document.documentElement.style.zoom = '';
    };
  }, []);
  useEffect(() => {
    if (firstTheme.current) {
      firstTheme.current = false;
      return;
    }
    setSweepKey((k) => k + 1);
  }, [theme]);
  return (
    <>
      <ThemeSwitchDefs />
      <CursorBlob />
      {sweepKey > 0 && <div key={sweepKey} className="theme-sweep-band" aria-hidden="true" />}
      {!connected ? <DevicePicker /> : <Shell />}
      <AnimatePresence>{loading && <LoadingScreen />}</AnimatePresence>
      <Toasts />
      <AppUpdateGate />
    </>
  );
}

// v3.0.4 — popup báo bản cập nhật mới: TOAST góc phải trên (khung bo tròn),
// KHÔNG còn modal giữa màn hình. Hiện mỗi lần mở app mà ping GitHub thấy
// bản mới hơn (bấm "Để sau" chỉ tắt trong phiên này — lần mở sau vẫn hiện
// lại nếu chưa cập nhật). Đợi loading 3s xong mới hiện để không đè lên
// màn loading. Bấm "Cập nhật" -> hộp xác nhận trượt lên ở giữa màn hình.
//
// v3.0.2 KHÔNG BAO GIỜ báo: fetch api.github.com bị CSP của app chặn
// (connect-src không có api.github.com) nên check luôn fail im lặng.
// Đã sửa ở tauri.conf.json — xem ghi chú ở src/lib/updater.ts.
function AppUpdateGate(): React.JSX.Element | null {
  const { loading } = useMouse();
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    void checkAppUpdate().then((res) => {
      if (!alive || !res?.available) return;
      setInfo(res);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (info && !loading) setToastOpen(true);
  }, [info, loading]);
  if (!info) return null;
  return (
    <>
      {toastOpen && (
        <div
          data-testid="update-toast"
          role="status"
          className="fixed top-4 right-4 z-50 w-[340px] rounded-2xl border border-orange-400/40 bg-[#17172b]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-md"
        >
          <div className="text-[15px] leading-snug font-bold text-white">
            Đã có bản cập nhật mới v{info.latestVersion}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-white/65">
            Phát hành {formatReleaseTimeWithWeekday(info.publishedAt)}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="min-h-[44px] flex-1 rounded-xl bg-[#ea580c] px-3 text-sm font-bold text-white transition hover:bg-[#c2410c]"
            >
              Cập nhật
            </button>
            <button
              type="button"
              onClick={() => setToastOpen(false)}
              className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white/85 transition hover:bg-white/10"
            >
              Để sau
            </button>
          </div>
        </div>
      )}
      <SlideUpConfirmModal
        open={confirmOpen}
        title={`Bạn có muốn cập nhật lên v${info.latestVersion} không?`}
        confirmLabel="Xác nhận"
        onConfirm={() => {
          setConfirmOpen(false);
          setToastOpen(false);
          void openUpdateSetup(info);
        }}
        onCancel={() => setConfirmOpen(false)}
      >
        <p>
          Phiên bản hiện tại (v{info.currentVersion}) sẽ được gỡ và thay bằng v{info.latestVersion} — bản
          chỉnh sửa, vá lỗi, tính năng mới.
        </p>
        {info.notes.trim() !== '' && (
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-black/20 p-3 whitespace-pre-line">
            {info.notes.trim()}
          </div>
        )}
      </SlideUpConfirmModal>
    </>
  );
}

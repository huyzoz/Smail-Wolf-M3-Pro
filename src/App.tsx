/**
 * App v3.0 — shell sized to exactly 1 desktop viewport (pro-max §5 Layout:
 * Data-Dense Dashboard, density 9): h-dvh + overflow-hidden, compact topbar,
 * left panel pushed up right under the header, 4 docks packed into the right column in a 2x2 grid,
 * mouse below them — NO more page scroll, NO more nested scroll
 * inside the panel. Mobile (<lg) still scrolls the page normally.
 * v2.5: open the app → device picker (DevicePicker, original-app style, image 3) →
 * click a mouse card → connect → exactly 3s loading (ancient-yak-42, fully blurring
 * everything behind) → the main UI rises up (app-enter).
 * v3.0: red liquid-glass blob chasing the pointer app-wide (CursorBlob) +
 * Uiverse theme-switch SVG defs rendered once + a light sweep band on every
 * theme change (no instant switch).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Battery, Cpu, Gauge, Radio } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { MouseProvider, useMouse } from './store';
import { TopBar } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { MouseStage } from './components/MouseStage';
import { SkinButton, SkinPopup } from './components/SkinPopup';
import DevicePicker from './components/DevicePicker';
import LoadingScreen from './components/LoadingScreen';
import { CursorBlob } from './components/CursorBlob';
import { ThemeSwitchDefs } from './components/ThemeToggle';
import { Marquee, Toasts, WideModal } from './components/ui';
import { pollingHz } from './lib/hid';
import {
  checkAppUpdate,
  downloadUpdate,
  finishUpdate,
  openReleasePage,
  formatReleaseTimeWithWeekday,
  type AppUpdateInfo,
  type UpdateDownloaded,
  type UpdateProgressEvent,
} from './lib/updater';

function Docks(): React.JSX.Element {
  const { config, simPctPrecise, simCharging, simSaver, version, mouseName, wired } = useMouse();
  const currentDpi = config ? config.dpi[config.dpiIndex] : null;
  const items = [
    {
      label: 'Current DPI',
      value: currentDpi ? currentDpi.toLocaleString('en-GB') : '—',
      sub: config ? `Stage ${config.dpiIndex + 1}/6` : 'Not connected',
      icon: <Gauge className="h-4 w-4 text-[#c2410c]" />,
    },
    {
      label: 'Polling rate',
      value: config ? pollingHz(config.reportRateIndex, wired) : '—',
      sub: wired ? 'Wired (125/500/1000)' : '2.4G (125/250/500/1000)',
      icon: <Radio className="h-4 w-4 text-[#c2410c]" />,
    },
    {
      label: 'Battery (estimated)',
      value: config ? `${simPctPrecise.toFixed(1)}%` : '—',
      sub: !config ? 'Not connected' : simCharging ? 'Charging · estimated' : simSaver ? 'Battery saver · estimated' : 'Simulated · estimated',
      icon: <Battery className={`h-4 w-4 ${simSaver ? 'text-[#ca8a04]' : 'text-[#c2410c]'}`} />,
    },
    {
      label: 'Firmware',
      value: version || '—',
      sub: mouseName ? mouseName : 'Could not read mouse name',
      icon: <Cpu className="h-4 w-4 text-[#c2410c]" />,
    },
  ];
  return (
    <div className="mt-2 grid shrink-0 grid-cols-2 gap-2" aria-label="Mouse specs">
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
  // v2.5: app-enter is only attached after loading ends — the main UI rises up
  // AFTER the 3s loading screen finishes (attaching the class then is what runs the animation).
  const { loading } = useMouse();
  // v2.8: popup skin (thay strip ngang v2.7).
  const [skinOpen, setSkinOpen] = useState(false);
  return (
    <div className={`relative mx-auto flex min-h-dvh max-w-[1440px] flex-col px-4 pb-2 lg:h-dvh lg:overflow-hidden${loading ? '' : ' app-enter'}`}>
      {/* Blueprint frame corners (image 1) */}
      <div className="pointer-events-none absolute top-2 left-2 hidden h-6 w-6 border-t-2 border-l-2 border-[rgba(22,22,26,0.5)] lg:block" aria-hidden="true" />
      <div className="pointer-events-none absolute top-2 right-2 hidden h-6 w-6 border-t-2 border-r-2 border-[rgba(22,22,26,0.5)] lg:block" aria-hidden="true" />
      <TopBar />
      {/* Layout v2.2 per Ethan's request: left panel pushed up right under the
          header; all 4 docks packed into the right column, 2 cells per row (2x2), mouse
          below them. No more horizontal dock row on top. */}
      <main className="mt-2 grid flex-1 grid-cols-[minmax(0,1fr)] gap-3 lg:min-h-0 lg:grid-cols-[minmax(380px,40%)_1fr]">
        <LeftPanel />
        <div className="flex min-w-0 flex-col gap-3 lg:min-h-0">
          <Docks />
          {/* v2.8: SKIN layer button right below the Battery dock (replacing the horizontal
              v2.7 strip — Ethan didn't want horizontal scrolling anymore) -> click to open the large popup
              with all skins, 5 per row. */}
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
      {/* The long footer ("SMAILWOLF M3 Pro — Driver remake...") was REMOVED per
          Ethan's request (extra text, wasted space). The honest limits
          (macros are write-only, no LED, Demo is simulated) are still written in the right places
          in each tab, no need to repeat them in the footer. */}
      {/* Toasts moved up to Root (v2.5) so they also show on the device picker
          screen (e.g. clicking a Live card that fails) — no longer rendered twice here. */}
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

// v2.5: not connected → device picker (original-app style); connected →
// main UI; loading 3s → compass overlay blurring everything above.
// v3.0: CursorBlob (red blob chasing the pointer app-wide) + ThemeSwitchDefs
// (filters #sketchy/#sketchy-sm, once only) + a light sweep band on every
// theme change.
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
  // W6: was AnimatePresence + framer exit (0.3s fade). Now: when `loading`
  // ends, keep the screen mounted 300ms with the fading class, then unmount.
  // If loading starts again mid-fade, the cleanup cancels the timeout.
  const [loadingVisible, setLoadingVisible] = useState(false);
  const [loadingFading, setLoadingFading] = useState(false);
  useEffect(() => {
    if (loading) {
      setLoadingVisible(true);
      setLoadingFading(false);
      return;
    }
    setLoadingFading(true);
    const t = window.setTimeout(() => {
      setLoadingVisible(false);
      setLoadingFading(false);
    }, 300);
    return () => window.clearTimeout(t);
  }, [loading]);
  return (
    <>
      <ThemeSwitchDefs />
      <CursorBlob />
      {sweepKey > 0 && <div key={sweepKey} className="theme-sweep-band" aria-hidden="true" />}
      {!connected ? <DevicePicker /> : <Shell />}
      {loadingVisible && <LoadingScreen fading={loadingFading} />}
      <Toasts />
      <AppUpdateGate />
    </>
  );
}

// v3.0.4 — new-update notice: a TOAST at the top-right corner (rounded frame),
// NO more centered modal. Shows every time the app opens and the GitHub ping finds
// a newer build (clicking "Later" only dismisses it for this session — it shows again
// next time if not updated yet). It waits for the 3s loading to finish so it doesn't cover
// the loading screen.
//
// v3.0.9 — silent in-client updater (redesign §n, no CMD/curl window, ever):
// clicking "Update" downloads INSIDE the client (Rust streams the installer to
// the %LOCALAPPDATA% cache and emits `update-progress` events) and shows a
// progress popup with the changelog below the bar. When the download finishes,
// the popup asks whether to delete all old client data: Confirm → the client
// exits, wipes the old data and opens the new installer right away; Close →
// no update, the downloaded installer stays cached in %LOCALAPPDATA%.
// On success the Rust side quits the whole process, so finishUpdate() never
// resolves — no success UI is needed here.
function AppUpdateGate(): React.JSX.Element | null {
  const { loading, registerUpdateStarter } = useMouse();
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [toastOpen, setToastOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [phase, setPhase] = useState<'downloading' | 'downloaded' | 'error'>('downloading');
  const [progress, setProgress] = useState({ downloaded: 0, total: 0 });
  const [downloaded, setDownloaded] = useState<UpdateDownloaded | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);
  const listeningStoppedRef = useRef(false);
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
  useEffect(
    () => () => {
      listeningStoppedRef.current = true;
      unlistenRef.current?.();
    },
    [],
  );
  const stopListening = (): void => {
    listeningStoppedRef.current = true;
    unlistenRef.current?.();
    unlistenRef.current = null;
  };
  const mb = (b: number): string => `${(b / 1048576).toFixed(1)} MB`;
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : 0;
  const startDownload = useCallback((): void => {
    if (!info) return;
    setInstallError(null);
    setDownloaded(null);
    setFinishing(false);
    setProgress({ downloaded: 0, total: 0 });
    setPhase('downloading');
    setToastOpen(false);
    setModalOpen(true);
    listeningStoppedRef.current = false;
    unlistenRef.current = null;
    // Live progress via the Rust `update-progress` events. In a plain browser
    // (dev server) there is no Tauri runtime, so listen() rejects — the
    // download promise below still drives the phases, the bar just stays
    // indeterminate until it resolves or fails.
    void listen<UpdateProgressEvent>('update-progress', (e) => {
      setProgress({ downloaded: e.payload.downloaded, total: e.payload.total });
    })
      .then((fn) => {
        if (listeningStoppedRef.current) fn();
        else unlistenRef.current = fn;
      })
      .catch(() => {});
    void downloadUpdate(info)
      .then((res) => {
        stopListening();
        setDownloaded(res);
        setProgress({ downloaded: res.size, total: res.size });
        setPhase('downloaded');
      })
      .catch((e: unknown) => {
        stopListening();
        setInstallError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      });
  }, [info]);
  // v3.0.9 — the Firmware section's Update button opens this same flow
  // through the store instead of running its own copy.
  useEffect(() => {
    registerUpdateStarter(startDownload);
    return () => registerUpdateStarter(null);
  }, [registerUpdateStarter, startDownload]);
  if (!info) return null;
  const handleConfirm = (): void => {
    if (finishing) return;
    setFinishing(true);
    void finishUpdate(info, true).catch((e: unknown) => {
      setFinishing(false);
      setInstallError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    });
  };
  const handleClose = (): void => {
    // Close = no update; the downloaded installer stays cached in
    // %LOCALAPPDATA% for next time.
    setModalOpen(false);
    setToastOpen(false);
  };
  const modalTitle =
    phase === 'downloading'
      ? 'Downloading the latest update'
      : phase === 'downloaded'
        ? 'Update downloaded'
        : 'Update failed';
  return (
    <>
      {toastOpen && (
        <div
          data-testid="update-toast"
          role="status"
          className="fixed top-4 right-4 z-50 w-[340px] rounded-2xl border border-orange-400/40 bg-[#17172b]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-md"
        >
          <div className="text-[15px] leading-snug font-bold text-white">
            A new update is available: v{info.latestVersion}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-white/65">
            Released {formatReleaseTimeWithWeekday(info.publishedAt)}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={startDownload}
              className="min-h-[44px] flex-1 rounded-xl bg-[#ea580c] px-3 text-sm font-bold text-white transition hover:bg-[#c2410c]"
            >
              Update
            </button>
            <button
              type="button"
              onClick={() => setToastOpen(false)}
              className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white/85 transition hover:bg-white/10"
            >
              Later
            </button>
          </div>
        </div>
      )}
      <WideModal open={modalOpen} title={modalTitle} onClose={handleClose} closable={phase !== 'downloading'}>
        {phase === 'downloading' && (
          <div>
            <p>
              Downloading v{info.latestVersion} — the installer downloads silently inside the client, no extra
              window opens.
            </p>
            <div
              className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuenow={progress.total > 0 ? pct : undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Update download progress"
            >
              <div
                className={`h-full rounded-full bg-[#ea580c] transition-[width] duration-150 ${
                  progress.total > 0 ? '' : 'w-full animate-pulse'
                }`}
                style={progress.total > 0 ? { width: `${pct}%` } : undefined}
              />
            </div>
            <p className="mt-2 font-mono text-xs text-white/70">
              {progress.total > 0
                ? `${mb(progress.downloaded)} of ${mb(progress.total)} (${pct}%)`
                : progress.downloaded > 0
                  ? `${mb(progress.downloaded)} downloaded…`
                  : 'Connecting…'}
            </p>
            {info.notes.trim() !== '' && (
              <div className="mt-4">
                <div className="mb-1 font-semibold text-[#edebe6]">What&apos;s new in v{info.latestVersion}</div>
                <div className="max-h-48 overflow-y-auto rounded-lg bg-black/20 p-3 whitespace-pre-line">
                  {info.notes.trim()}
                </div>
              </div>
            )}
          </div>
        )}
        {phase === 'downloaded' && downloaded && (
          <div>
            <p>
              The installer for v{info.latestVersion} is ready
              {downloaded.cached ? ' (already downloaded)' : ` (${mb(downloaded.size)})`}.
            </p>
            <p className="mt-3 font-semibold text-[#edebe6]">
              Do you want to delete all old client data?
            </p>
            <p className="mt-1">
              Confirm deletes the old client data (settings, battery estimate and saved data) and then opens the
              new installer right away. Close keeps your data — the downloaded installer stays cached, and no
              update happens.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={finishing}
                className="min-h-[44px] flex-1 rounded-xl bg-[#ea580c] px-3 text-sm font-bold text-white transition hover:bg-[#c2410c] disabled:opacity-50"
              >
                {finishing ? 'Starting the installer…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={finishing}
                className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white/85 transition hover:bg-white/10 disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        )}
        {phase === 'error' && (
          <div>
            <p className="font-semibold text-red-300">Update failed: {installError ?? 'Unknown error'}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={startDownload}
                className="min-h-[44px] flex-1 rounded-xl bg-[#ea580c] px-3 text-sm font-bold text-white transition hover:bg-[#c2410c]"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => void openReleasePage(info)}
                className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white/85 transition hover:bg-white/10"
              >
                Open on GitHub
              </button>
            </div>
          </div>
        )}
      </WideModal>
    </>
  );
}

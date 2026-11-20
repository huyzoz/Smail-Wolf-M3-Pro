/**
 * LeftPanel v2.4 — per image 3 + Ethan's request: rounded navy frame,
 * header "● M3", then RIGHT BELOW it the MENU BAR with 4 main items (Key Bindings / DPI /
 * Performance / More — each item with its icon AFTER the label).
 * Create / Import / Onboard configuration REMOVED from the top of the panel (v2.3):
 * they are only side actions (save/import profiles, view the running config) —
 * that functionality already exists in More → Profile (OthersPage). Inside
 * is the tab content. Activity Log REMOVED in v2.4 (notifications are now short
 * toasts at the top of the page). FIX v2.1: fixed blocks are shrink-0 (Onboard was once
 * squeezed to 38px). FIX v2.4: removed AnimatePresence mode="wait" (exit stuck after
 * the macro modal) — tabs use key + pure CSS animation (tabIn).
 */
import { useState } from 'react';
import {
  Download,
  Gauge,
  Keyboard,
  MoreHorizontal,
  RotateCcw,
  Settings,
  Zap,
} from 'lucide-react';
import { useMouse, type TabId } from '../store';
import { ConfirmModal, PageHead } from './ui';
import Dashboard from '../pages/Dashboard';
import DpiPage from '../pages/DpiPage';
import KeysPage from '../pages/KeysPage';
import PerformancePage from '../pages/PerformancePage';
import MacroPage from '../pages/MacroPage';
import {
  AppSettingsCard,
  BatteryBadge,
  BatterySaverCard,
  FirmwareBody,
  FirmwareTag,
  MoreSection,
  ProfileCard,
  RawReplyCard,
  RestoreCard,
} from '../pages/OthersPage';

export function LeftPanel(): React.JSX.Element {
  const { tab, setTab, config, keys, restoreFactory } = useMouse();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const exportJson = (): void => {
    if (!config || !keys) return;
    const data = {
      name: 'Onboard configuration',
      savedAt: new Date().toLocaleString('en-GB'),
      config,
      keys,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smailwolf-m3pro-onboard.json';
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  return (
    <section
      id="left-panel"
      className="dark-panel flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-white/10 shadow-[0_20px_50px_rgba(22,22,26,0.35)] lg:h-full lg:min-h-0"
      aria-label="M3 control panel"
    >
      {/* Image-3 style header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 pt-4 pb-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[20px] leading-none font-semibold tracking-wide text-[#edebe6]">M3</div>
          <div className="font-mono2 mt-1 text-[10px] tracking-[0.18em] text-[#a2a2b0] uppercase">
            Onboard · M3 Pro
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Config options"
            aria-expanded={menuOpen}
            className="flex h-[44px] w-[44px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#edebe6] transition hover:bg-white/10"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-20 mt-2 w-[240px] overflow-hidden rounded-xl border border-white/10 bg-[#262640] shadow-2xl">
                <button
                  className="flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-sm text-[#edebe6] hover:bg-white/10"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmRestore(true);
                  }}
                >
                  <RotateCcw className="h-4 w-4 text-[#ff8a3d]" /> Restore defaults
                </button>
                <button
                  className="flex min-h-[44px] w-full items-center gap-2 px-4 text-left text-sm text-[#edebe6] hover:bg-white/10"
                  onClick={exportJson}
                >
                  <Download className="h-4 w-4 text-[#ff8a3d]" /> Export config JSON
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Menu bar with 4 main items — RIGHT BELOW the header (v2.3). Create / Import /
          Onboard moved into More → Profile (OthersPage has them all).
          Each item: label + its icon AFTER the label. */}
      <nav
        className="mx-4 mt-3 flex shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#1f1f38]"
        aria-label="Config section"
      >
        {(
          [
            { id: 'keys', label: 'Key Bindings', icon: <Keyboard className="h-4 w-4" /> },
            { id: 'dpi', label: 'DPI', icon: <Gauge className="h-4 w-4" /> },
            { id: 'performance', label: 'Performance', icon: <Zap className="h-4 w-4" /> },
            { id: 'others', label: 'More', icon: <Settings className="h-4 w-4" /> },
          ] as { id: TabId; label: string; icon: React.ReactNode }[]
        ).map(({ id, label, icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 px-1 text-[12px] font-semibold whitespace-nowrap transition ${
                active ? 'bg-[#ff5a1f]/15 text-[#ffb37a]' : 'text-[#a2a2b0] hover:bg-white/5 hover:text-[#edebe6]'
              }`}
            >
              {label}
              <span className={active ? 'text-[#ff8a3d]' : 'text-[#55555c]'} aria-hidden="true">
                {icon}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Tab content — the only scrollable block in the panel.
          v2.4: REMOVED AnimatePresence mode="wait" — it STUCK the exit after opening/closing
          the macro modal (the tab changed state but the old content didn't unmount, and new
          content piled up below → clicking More didn't change the tab). Replaced with
          key={tab} + pure CSS animation (tabIn) — no exit tracking
          to get stuck, smoother (opacity/transform only, runs on the GPU). */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div key={tab} className="tab-enter">
          {tab === 'keys' && (
            <>
              <KeysPage />
              <div className="mt-6 border-t border-white/10 pt-5">
                <MacroPage />
              </div>
            </>
          )}
          {tab === 'dpi' && <DpiPage />}
          {tab === 'performance' && <PerformancePage />}
          {tab === 'others' && (
            <div>
              <PageHead title="More" subtitle="Battery · Firmware · Profiles · Settings · Restore · Raw." />
              {/* Redesign 2026-11-19 (a): single-column stack, Battery FIRST, every
                  section collapsible in a Firmware-card blue-glass frame. Battery +
                  Firmware open by default; open/closed persists per section. */}
              <div className="space-y-4">
                <MoreSection id="battery" eyebrow="Battery" title="Battery" badge={<BatteryBadge />}>
                  <Dashboard bare />
                  <div className="mt-4">
                    <BatterySaverCard />
                  </div>
                </MoreSection>
                <MoreSection id="firmware" eyebrow="Firmware · duyzoz" title={<FirmwareTag />}>
                  <FirmwareBody />
                </MoreSection>
                <MoreSection id="profiles" eyebrow="Profiles" title="Profiles">
                  <ProfileCard />
                </MoreSection>
                <MoreSection id="settings" eyebrow="Settings" title="Settings">
                  <AppSettingsCard />
                </MoreSection>
                <MoreSection id="restore" eyebrow="Restore" title="Restore defaults">
                  <RestoreCard />
                </MoreSection>
                <MoreSection id="raw" eyebrow="Raw" title="Latest raw reply">
                  <RawReplyCard />
                </MoreSection>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Activity Log REMOVED in v2.4 (per Ethan's request) — every notification is now a
          SHORT toast at the top of the page (Toasts), no more log lines in the panel. */}
      <ConfirmModal
        open={confirmRestore}
        title="Restore factory defaults?"
        confirmLabel="Restore"
        danger
        onConfirm={() => {
          setConfirmRestore(false);
          void restoreFactory();
        }}
        onCancel={() => setConfirmRestore(false)}
      >
        Writes the original app's default config (DPI 800/1600/2400/3200/6400/12000, stage 2, polling index 3, sleep 10
        min) + default keys to the mouse.
      </ConfirmModal>
    </section>
  );
}

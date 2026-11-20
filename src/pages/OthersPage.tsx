/**
 * More — redesign 2026-11-19 (a): single-column stack of collapsible sections,
 * Battery FIRST, then Firmware, Profiles, Settings, Restore, Raw. Every section
 * is a blue-glass frame like the old Firmware card (.uiv-blueglass) with a
 * header button (title + chevron); open/closed persists per section in
 * localStorage (smailwolf_m3pro_more_sections_v1). Battery + Firmware open by
 * default, the rest closed.
 *
 * Firmware section (o): "View source" opens the repo, "What's new?" opens a
 * wide (landscape) modal with the full release-notes log of the latest version.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Code, Download, FileText, RotateCcw, Save, Upload } from 'lucide-react';
import { hexDump, verifyChecksum } from '../lib/hid';
import { useMouse } from '../store';
import { autostartGet, autostartSet, isTauri } from '../lib/tauri';
import {
  checkAppUpdate,
  refreshAppUpdate,
  openReleasePage,
  openRepoPage,
  fetchCurrentReleaseNotes,
  formatReleaseTimeWithWeekday,
  currentAppVersionTag,
  FALLBACK_APP_VERSION,
  type AppUpdateInfo,
} from '../lib/updater';
import {
  CardTitle,
  ConfirmModal,
  EmptyState,
  FieldLabel,
  GlassButton,
  GlassCard,
  Toggle,
  WideModal,
} from '../components/ui';

// ---------------------------------------------------------------------------
// Collapsible blue-glass section (redesign 2026-11-19).
// ---------------------------------------------------------------------------

const MORE_SECTIONS_KEY = 'smailwolf_m3pro_more_sections_v1';
type MoreSectionId = 'battery' | 'firmware' | 'profiles' | 'settings' | 'restore' | 'raw';
const MORE_SECTION_DEFAULTS: Record<MoreSectionId, boolean> = {
  battery: true,
  firmware: true,
  profiles: false,
  settings: false,
  restore: false,
  raw: false,
};

function loadMoreSectionsMap(): Partial<Record<MoreSectionId, boolean>> {
  try {
    const raw = window.localStorage.getItem(MORE_SECTIONS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Record<MoreSectionId, boolean>>;
  } catch {
    return {};
  }
}

function useMoreSectionOpen(id: MoreSectionId): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(() => loadMoreSectionsMap()[id] ?? MORE_SECTION_DEFAULTS[id]);
  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    try {
      const map = loadMoreSectionsMap();
      map[id] = next;
      window.localStorage.setItem(MORE_SECTIONS_KEY, JSON.stringify(map));
    } catch {
      /* storage unavailable — open state just won't persist */
    }
  };
  return [open, toggle];
}

/** One collapsible section: Firmware-card blue glass (.uiv-blueglass) with a
 *  header button (mono eyebrow + title + optional live badge + chevron). */
export function MoreSection({
  id,
  eyebrow,
  title,
  badge,
  children,
}: {
  id: MoreSectionId;
  eyebrow: string;
  title: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  const [open, toggle] = useMoreSectionOpen(id);
  return (
    <div className="uiv-blueglass">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="uiv-blueglass-top w-full cursor-pointer text-left"
      >
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono2 text-[11px] font-semibold tracking-[0.18em] text-white/80 uppercase">
              {eyebrow}
            </div>
            <div className="title font-display truncate">{title}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2 pb-1">
            {badge}
            <span aria-hidden className="text-2xl leading-none text-white/85">
              {open ? '▾' : '▸'}
            </span>
          </div>
        </div>
      </button>
      {open ? <div className="px-4 pt-4 pb-4">{children}</div> : undefined}
    </div>
  );
}

/** Live battery pill for the Battery section header (visible when collapsed). */
export function BatteryBadge(): React.JSX.Element {
  const { simPctPrecise, simCharging, simSaver } = useMouse();
  return (
    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold whitespace-nowrap text-white">
      {simPctPrecise}%{simCharging ? ' · Charging' : simSaver ? ' · Saver' : ''} · estimated
    </span>
  );
}

/** Live app version tag (e.g. "v3.0.8-rust") for the Firmware section header. */
export function FirmwareTag(): React.JSX.Element {
  const [appTag, setAppTag] = useState(`v${FALLBACK_APP_VERSION}-rust`);
  useEffect(() => {
    let alive = true;
    void currentAppVersionTag().then((tag) => {
      if (alive) setAppTag(tag);
    });
    return () => {
      alive = false;
    };
  }, []);
  return <>{appTag}</>;
}

/** Battery saver toggle only — lives in the Battery section under Dashboard. */
export function BatterySaverCard(): React.JSX.Element {
  const { connected, busy, simSaver, setBatterySaver } = useMouse();
  return (
    <GlassCard>
      <CardTitle>Battery saver</CardTitle>
      <Toggle
        checked={simSaver}
        disabled={!connected || busy}
        onChange={(v) => void setBatterySaver(v)}
        label="Battery saver"
      />
      <p className="mt-2 text-xs leading-relaxed text-[#a2a2b0]">
        Locks 125 Hz + DPI 1600 to stretch the battery — estimated only, the mouse is unchanged.
      </p>
    </GlassCard>
  );
}

/** App settings — Lite mode + start with Windows. Lives in the Settings section. */
export function AppSettingsCard(): React.JSX.Element {
  const { lite, toggleLite } = useMouse();
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const webMode = !isTauri();

  useEffect(() => {
    let alive = true;
    void autostartGet().then((v) => {
      if (alive) setAutostart(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <GlassCard>
      <CardTitle>Settings</CardTitle>
      <div className="space-y-3">
        <div>
          <Toggle checked={lite} onChange={() => toggleLite()} label="Lite mode (low-end PCs)" />
          <p className="mt-2 text-xs leading-relaxed text-[#a2a2b0]">
            Turns off all background blur effects (red blob, toasts, modal frames) to lighten the GPU — UI only, the mouse
            is unchanged. Turn it on if your PC still lags.
          </p>
        </div>
        <div className="border-t border-white/10 pt-3">
          <Toggle
            checked={autostart ?? false}
            disabled={webMode || autostart === null}
            onChange={(v) => {
              setAutostart(v);
              void autostartSet(v);
            }}
            label="Open app on Windows startup"
          />
          <p className="mt-2 text-xs leading-relaxed text-[#a2a2b0]">
            {webMode
              ? 'Only works in the Windows app (Tauri) — running in a browser, so it cannot be changed here.'
              : autostart === null
                ? 'Reading status…'
                : autostart
                  ? 'On — the app opens automatically when Windows starts.'
                  : 'Off.'}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

export function FirmwareBody(): React.JSX.Element {
  // v3.0.4 — this is the APP VERSION + updates (no longer the mouse firmware
  // or the original app here: the mouse firmware still shows in the Device & battery tab).
  // The version tag lives in the section header (FirmwareTag); this is the body only.
  // v3.0.9 — the Update button opens the AppUpdateGate's shared download →
  // progress → wipe flow through the store; no own copy of that flow here.
  const { startAppUpdate } = useMouse();
  // v3.0.2 — checks for updates of THIS app itself from the GitHub repo
  // (duyzoz/Smail-Wolf-M3-Pro). undefined = checking, null = could not
  // check (offline — stays silent, no error shown).
  const [update, setUpdate] = useState<AppUpdateInfo | null | undefined>(undefined);
  // "What's new?" landscape modal (redesign 2026-11-19, o).
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [whatsNewTitle, setWhatsNewTitle] = useState("What's new");
  const [whatsNewNotes, setWhatsNewNotes] = useState<string | null>(null);
  const [whatsNewError, setWhatsNewError] = useState(false);

  useEffect(() => {
    let alive = true;
    void checkAppUpdate().then((info) => {
      if (alive) setUpdate(info);
    });
    return () => {
      alive = false;
    };
  }, []);

  const loadWhatsNewFromApi = (): void => {
    setWhatsNewError(false);
    setWhatsNewNotes(null);
    void fetchCurrentReleaseNotes().then((body) => {
      if (body === null) {
        setWhatsNewError(true);
      } else {
        setWhatsNewNotes(body.trim() === '' ? 'No release notes for this version.' : body.trim());
      }
    });
  };

  const openWhatsNew = (): void => {
    setWhatsNewOpen(true);
    // The update check's notes ARE the latest release's log: when an update is
    // available that's the new version's notes; when up to date, latest ==
    // current, so the same notes are the current version's log.
    if (update !== undefined && update !== null) {
      setWhatsNewError(false);
      setWhatsNewTitle(`What's new in v${update.latestVersion}`);
      setWhatsNewNotes(update.notes.trim() === '' ? 'No release notes for this version.' : update.notes.trim());
      return;
    }
    // Check still running / failed: fetch the current release directly.
    setWhatsNewTitle("What's new");
    void currentAppVersionTag().then((tag) => setWhatsNewTitle(`What's new in ${tag}`));
    loadWhatsNewFromApi();
  };

  const sourceButtons = (
    <>
      <GlassButton variant="ghost" onClick={() => void openRepoPage()}>
        <Code className="h-4 w-4" /> View source
      </GlassButton>
      <GlassButton variant="ghost" onClick={openWhatsNew}>
        <FileText className="h-4 w-4" /> What's new?
      </GlassButton>
    </>
  );

  return (
    <>
      {/* Update the APP (this driver) — from the repo's latest release */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-[13px] font-semibold text-white/90">App update</div>
        {update === undefined ? (
          <>
            <p className="mt-1 text-[13px] leading-relaxed text-white/60">Checking for updates…</p>
            <div className="mt-3 flex flex-wrap gap-2">{sourceButtons}</div>
          </>
        ) : update === null ? (
          <>
            <p className="mt-1 text-[13px] leading-relaxed text-white/60">
              Couldn't check for updates (offline?).{' '}
              <button
                type="button"
                className="font-semibold text-white underline underline-offset-2"
                onClick={() => {
                  setUpdate(undefined);
                  void refreshAppUpdate().then((info) => setUpdate(info));
                }}
              >
                Retry
              </button>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">{sourceButtons}</div>
          </>
        ) : update.available ? (
          <div className="mt-2 space-y-2">
            <p className="text-[13px] leading-relaxed text-orange-200">
              A new update is available: <span className="font-bold">v{update.latestVersion}</span>
              {' '}· released {formatReleaseTimeWithWeekday(update.publishedAt)}
            </p>
            {update.notes.trim() !== '' && (
              <details className="text-[13px] leading-relaxed text-white/70">
                <summary className="cursor-pointer font-semibold text-white/85">What's new</summary>
                <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-line pr-1">{update.notes.trim()}</p>
              </details>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <GlassButton variant="primary" onClick={startAppUpdate}>
                <Download className="h-4 w-4" /> Update
              </GlassButton>
              <GlassButton variant="ghost" onClick={() => void openReleasePage(update)}>
                View on GitHub
              </GlassButton>
              {sourceButtons}
            </div>
          </div>
        ) : (
          <>
            <p className="mt-1 text-[13px] leading-relaxed text-emerald-200">
              You're on the latest version v{update.currentVersion}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">{sourceButtons}</div>
          </>
        )}
      </div>
      <WideModal open={whatsNewOpen} title={whatsNewTitle} onClose={() => setWhatsNewOpen(false)}>
        {whatsNewError ? (
          <div className="space-y-3">
            <p>Couldn't load release notes.</p>
            <GlassButton variant="ghost" onClick={loadWhatsNewFromApi}>
              Retry
            </GlassButton>
          </div>
        ) : whatsNewNotes === null ? (
          <p>Loading release notes…</p>
        ) : (
          <p className="whitespace-pre-line">{whatsNewNotes}</p>
        )}
      </WideModal>
    </>
  );
}

export function RestoreCard(): React.JSX.Element {
  const { config, mode, restoreFactory, busy } = useMouse();
  const [confirmRestore, setConfirmRestore] = useState(false);
  return (
    <>
      <GlassCard>
        <CardTitle>Restore defaults</CardTitle>
        <p className="text-sm leading-relaxed text-[#a2a2b0]">
          Writes the original app's default config + keys.
        </p>
        <div className="mt-4">
          <GlassButton variant="danger" onClick={() => setConfirmRestore(true)} disabled={!config || busy}>
            <RotateCcw className="h-4 w-4" /> Restore defaults
          </GlassButton>
        </div>
      </GlassCard>

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
        Will write the default config (DPI 800–12000, stage 2, polling index 3, sleep 10 min) + default keys{' '}
        {mode === 'demo' ? '(simulated).' : 'to the mouse.'}
        All current changes will be lost — save them as a profile first if you want to keep them.
      </ConfirmModal>
    </>
  );
}

export function ProfileCard(): React.JSX.Element {
  const { config, keys, version, mouseName, profiles, saveProfile, applyProfile, deleteProfile, busy, addLog } = useMouse();
  const [profileName, setProfileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const exportProfile = (): void => {
    if (!config || !keys) return;
    const data = {
      app: 'SMAILWOLF M3 Pro Driver (remake)',
      firmware: version,
      mouse: mouseName,
      exportedAt: new Date().toISOString(),
      config,
      keys: keys.map((k) => ({ type: k.type, code1: k.code1, code2: k.code2, code3: k.code3 })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smailwolf-m3pro-profile.json';
    a.click();
    URL.revokeObjectURL(url);
    addLog('Profile exported to a JSON file.');
  };

  const importProfile = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as { config?: unknown; keys?: unknown };
        if (!data.config || !data.keys) throw new Error('File is missing config/keys');
        addLog('Profile file loaded — click Save profile to keep it, or apply it directly from the list.');
        void applyProfile({
          name: file.name.replace(/\.json$/i, ''),
          savedAt: new Date().toLocaleString('en-GB'),
          config: data.config as never,
          keys: data.keys as never,
        });
      } catch (e) {
        addLog(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <GlassCard>
      <CardTitle>Profiles (saved on this PC)</CardTitle>
      <div className="flex gap-2">
        <input
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          placeholder="Profile name, e.g. Gaming"
          aria-label="Profile name"
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white"
        />
        <GlassButton
          onClick={() => {
            if (profileName.trim()) {
              saveProfile(profileName.trim());
              setProfileName('');
            }
          }}
          disabled={!config || !profileName.trim() || busy}
        >
          <Save className="h-4 w-4" /> Save
        </GlassButton>
      </div>
      {profiles.length === 0 ? (
        <div className="mt-3"><EmptyState text="No profiles saved yet." /></div>
      ) : (
        <div className="mt-3 space-y-2">
          {profiles.map((p) => (
            <div key={p.name} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{p.name}</div>
                <div className="text-[11px] text-[#a2a2b0]">Saved at {p.savedAt}</div>
              </div>
              <GlassButton variant="ghost" onClick={() => void applyProfile(p)} disabled={busy}>
                Apply
              </GlassButton>
              <button
                onClick={() => deleteProfile(p.name)}
                aria-label={`Delete profile ${p.name}`}
                className="px-2 text-xs text-red-300 hover:text-red-200"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <GlassButton variant="ghost" onClick={exportProfile} disabled={!config}>
          <Download className="h-4 w-4" /> Export JSON
        </GlassButton>
        <GlassButton variant="ghost" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Import JSON
        </GlassButton>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Choose a profile JSON file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importProfile(f);
            e.target.value = '';
          }}
        />
      </div>
    </GlassCard>
  );
}

export function RawReplyCard(): React.JSX.Element {
  const { configRaw, keysRaw } = useMouse();
  // v2.5: raw reply is debug info, collapsed by default — this is the longest block
  // in the More tab (2x 64-byte hex dumps), opened only when Ethan needs to see it.
  const [rawOpen, setRawOpen] = useState(false);
  const cfgCs = configRaw.length ? verifyChecksum(configRaw) : null;
  return (
    <GlassCard>
      <button
        type="button"
        onClick={() => setRawOpen((o) => !o)}
        aria-expanded={rawOpen}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-base font-bold text-white">Latest raw reply</span>
          {cfgCs ? (
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${cfgCs.ok ? 'bg-emerald-400/15 text-emerald-200' : 'bg-red-400/15 text-red-200'}`}>
              Checksum {cfgCs.ok ? `OK (${configRaw[2]})` : `BAD (reply ${configRaw[2]}, expected ${cfgCs.expected})`}
            </span>
          ) : undefined}
        </span>
        <span aria-hidden className="text-lg text-[#a2a2b0]">{rawOpen ? '▾' : '▸'}</span>
      </button>
      {rawOpen ? (
        <>
          <FieldLabel>Config reply ([240, 14, …], 64 byte)</FieldLabel>
          <pre className="max-h-[120px] overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-[#ffd2ae]">
            {configRaw.length ? hexDump(configRaw) : 'No data yet.'}
          </pre>
          <div className="mt-3">
            <FieldLabel>Keys reply ([240, 8, …], 64 byte)</FieldLabel>
            <pre className="max-h-[120px] overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-[#ffd2ae]">
              {keysRaw.length ? hexDump(keysRaw) : 'No data yet.'}
            </pre>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#a2a2b0]">
            Checksum: byte [2] = sum of bytes [3..63] mod 256.
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-[#a2a2b0]">Click to view the 2x 64-byte hex dumps.</p>
      )}
    </GlassCard>
  );
}

// (No default export: the More tab lays out its sections directly in LeftPanel.)

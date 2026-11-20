/**
 * App store — one backend (demo or live), one shared state.
 * All writes go through the backend and are verified by re-reading
 * (intended-vs-actual field diff), exactly like test-write.html.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { LiveMouse } from './lib/hid';
import {
  BATTERY_POLL_MS,
  DemoMouse,
  appendBatteryHistory,
  loadMacros,
  loadProfiles,
  saveMacros as persistMacros,
  saveProfiles as persistProfiles,
  type BatteryHistoryEntry,
  type MouseBackend,
  type Profile,
} from './lib/mouse';
import {
  chargeTick,
  defaultState,
  indexForHz,
  loadWithElapsed,
  percentOf,
  percentOfPrecise,
  rateHz,
  shouldNotifyLow,
  tick as batteryTick,
  LOW_RESET_PCT,
  PERSIST_EVERY_S,
} from './lib/battery';
import {
  getBatteryState,
  notifyLowBattery,
  setBatteryState,
  storeGet,
  storeSet,
  type BatteryState,
} from './lib/tauri';
import {
  DEFAULT_CONFIG,
  DEFAULT_KEYS,
  WIRED_VID,
  isWiredDevicePresent,
  type FullRead,
  type KeyBinding,
  type MacroDef,
  type MouseConfig,
  type ParsedKey,
  type StatusEvent,
} from './lib/hid';
import type { AppTheme } from './lib/brand';

export type TabId = 'keys' | 'dpi' | 'performance' | 'others';

export interface Toast {
  id: number;
  kind: 'ok' | 'err' | 'info';
  text: string;
  /** W6: true while the toast is fading out (250ms) before removal. */
  exiting?: boolean;
}

const ts = (): string => new Date().toLocaleTimeString('en-GB');

interface MouseStore {
  mode: 'demo' | 'live';
  connected: boolean;
  connecting: boolean;
  /** v2.5: 3s loading (ancient-yak-42) after connecting, before entering
      the main UI. (v3.0: cut from 5s to 3s per Ethan's request.) */
  loading: boolean;
  /** v3.0: app-wide light/dark theme (Uiverse toggle in TopBar). */
  theme: AppTheme;
  toggleTheme: () => void;
  /** W4 (v3.0.8): Lite mode — turns off all background blur (blob, toast, modal) for
      low-end PCs; UI-only, never touches the mouse. */
  lite: boolean;
  toggleLite: () => void;
  busy: boolean;
  wired: boolean;
  deviceLabel: string;
  version: string;
  mouseName: string;
  battery: number | null;
  chargeFlag: number | null;
  batteryHistory: BatteryHistoryEntry[];
  /** v3.1 — SIMULATED battery (estimated, see src/lib/battery.ts). `battery`
      (report 48) is the firmware's raw value, NO LONGER shown in the UI. */
  simPct: number;
  /** v3.0.2 — battery % with 1 decimal (display): at 3 mA drain the whole % sits
      still at 100% for the first 13 hours, while 1 decimal drops 0.1 every ~8 min — you can
      actually see the battery drop. Logic (20% threshold, saver) still uses whole simPct. */
  simPctPrecise: number;
  simCharging: boolean;
  simSaver: boolean;
  simRemainingMah: number;
  simPollingHz: number;
  /** Toggle Battery saver: writes polling 125 Hz + DPI 1600 via setConfig,
      off restores the saved rate/DPI. Returns false if not connected or the write fails. */
  setBatterySaver: (on: boolean) => Promise<boolean>;
  lastBatteryRead: string | null;
  batteryReads: number;
  config: MouseConfig | null;
  keys: ParsedKey[] | null;
  configRaw: number[];
  keysRaw: number[];
  toasts: Toast[];
  macros: MacroDef[];
  profiles: Profile[];
  dpiListening: boolean;
  tab: TabId;
  setTab: (t: TabId) => void;
  // v2.7: selected mouse skin (UI-only, saved to localStorage).
  skinId: string;
  setSkinId: (id: string) => void;
  // v2.6: picked = the specific device Ethan clicked in the scan list.
  connect: (mode: 'demo' | 'live', picked?: unknown) => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  // v3.0.9 — shared update starter: the AppUpdateGate owns the download →
  // progress → wipe flow; the Firmware section's Update button just opens
  // that same flow instead of running its own copy.
  registerUpdateStarter: (fn: (() => void) | null) => void;
  startAppUpdate: () => void;
  readBatteryNow: () => Promise<void>;
  saveConfig: (next: MouseConfig) => Promise<boolean>;
  saveKeys: (next: KeyBinding[]) => Promise<boolean>;
  writeMacros: (slot?: number) => Promise<boolean>;
  setMacros: (m: MacroDef[]) => void;
  saveProfile: (name: string) => void;
  applyProfile: (p: Profile) => Promise<boolean>;
  deleteProfile: (name: string) => void;
  restoreFactory: () => Promise<boolean>;
  simulateDpiPush: () => void;
  listenDpiPush: () => void;
  addLog: (text: string) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<MouseStore | null>(null);

export function useMouse(): MouseStore {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMouse must be used inside <MouseProvider>');
  return v;
}

export function MouseProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // v3.0: app-wide theme — light by default, choice saved to localStorage.
  const [theme, setTheme] = useState<AppTheme>(() => {
    try {
      return localStorage.getItem('smailwolf_m3pro_theme_v1') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);
  // Apply the theme to <html data-theme> so CSS tokens + the dark-mode shim follow;
  // save the choice so it persists across restarts.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('smailwolf_m3pro_theme_v1', theme);
    } catch {
      /* storage locked — theme still changes for this session */
    }
  }, [theme]);
  // W4 (v3.0.8): Lite mode — OFF by default, choice saved to localStorage.
  // Apply the `lite` class to <html> so CSS turns off background blur (see end of index.css).
  const [lite, setLite] = useState<boolean>(() => {
    try {
      return localStorage.getItem('smailwolf_m3pro_lite_v1') === '1';
    } catch {
      return false;
    }
  });
  const toggleLite = useCallback(() => {
    setLite((v) => !v);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('lite', lite);
    try {
      localStorage.setItem('smailwolf_m3pro_lite_v1', lite ? '1' : '0');
    } catch {
      /* storage locked — lite still changes for this session */
    }
  }, [lite]);
  const [busy, setBusy] = useState(false);
  const [wired, setWired] = useState(false);
  // Redesign 2026-11-19 (d): the cable is plugged in (mouse charging) even when
  // the app stays connected over the 2.4G dongle — `wired` alone misses that.
  // Set by the HID plug/unplug listeners + the 30s poll below; only the battery
  // engine reads it, never the polling-rate lists (the mouse still talks 2.4G).
  const [cableCharging, setCableCharging] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState('not connected');
  const [version, setVersion] = useState('');
  const [mouseName, setMouseName] = useState('');
  const [battery, setBattery] = useState<number | null>(null);
  const [chargeFlag, setChargeFlag] = useState<number | null>(null);
  const [batteryHistory, setBatteryHistory] = useState<BatteryHistoryEntry[]>([]);
  const [lastBatteryRead, setLastBatteryRead] = useState<string | null>(null);
  const [batteryReads, setBatteryReads] = useState(0);
  const batteryRef = useRef<number | null>(null);
  const batteryFailStreak = useRef(0);
  // v3.1 — simulated battery (estimated): durable state in the store
  // "battery-state-v1" (xem src/lib/battery.ts + src/lib/tauri.ts).
  // NEVER reset to 100%/0% on restart: on load, apply the time actually
  // elapsed since updated_at (loadWithElapsed).
  const [simBattery, setSimBattery] = useState<BatteryState | null>(null);
  const simRef = useRef<BatteryState | null>(null);
  const simLoadedRef = useRef(false);
  const lastPersistRef = useRef(0);
  const simPct = percentOf(simBattery);
  const simPctPrecise = percentOfPrecise(simBattery);
  const simCharging = simBattery?.charging ?? false;
  const simSaver = simBattery?.saver ?? false;
  const simRemainingMah = simBattery?.remaining_mah ?? 400;
  const simPollingHz = simBattery?.last_polling_rate ?? 125;

  const persistSim = useCallback((s: BatteryState) => {
    simRef.current = s;
    lastPersistRef.current = Math.floor(Date.now() / 1000);
    void setBatteryState(s);
  }, []);

  // Load once at app start: read the saved state, apply elapsed time
  // (charge/drain while the app was closed), show % immediately — no waiting for the mouse.
  useEffect(() => {
    if (simLoadedRef.current) return;
    simLoadedRef.current = true;
    const now = Math.floor(Date.now() / 1000);
    void getBatteryState().then((saved) => {
      const next = saved ? loadWithElapsed(saved, now) : defaultState(now);
      setSimBattery(next);
      persistSim(next);
    });
  }, [persistSim]);

  // Save on tab close/reload (beforeunload) — % is not lost when the app closes.
  useEffect(() => {
    const onUnload = (): void => {
      if (simRef.current) void setBatteryState(simRef.current);
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);
  const [config, setConfig] = useState<MouseConfig | null>(null);
  const [keys, setKeys] = useState<ParsedKey[] | null>(null);
  const [configRaw, setConfigRaw] = useState<number[]>([]);
  const [keysRaw, setKeysRaw] = useState<number[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [macros, setMacrosState] = useState<MacroDef[]>(() => loadMacros());
  const [profiles, setProfilesState] = useState<Profile[]>(() => loadProfiles());
  const [dpiListening, setDpiListening] = useState(false);
  const [tab, setTab] = useState<TabId>('keys');
  // v2.7: selected mouse skin — UI-only (never written to the mouse),
  // saved to localStorage so it persists across restarts.
  const [skinId, setSkinIdState] = useState<string>(() => {
    try {
      return localStorage.getItem('smailwolf_m3pro_skin_v1') ?? 'default';
    } catch {
      return 'default';
    }
  });
  const setSkinId = useCallback((id: string) => {
    setSkinIdState(id);
    try {
      localStorage.setItem('smailwolf_m3pro_skin_v1', id);
    } catch {
      /* storage full/locked — skin still changes for this session */
    }
  }, []);

  const backendRef = useRef<MouseBackend | null>(null);
  const busyRef = useRef(false);
  const toastId = useRef(0);

  // v2.4: Activity Log REMOVED (per Ethan's request) — every notification is now a
  // SHORT toast at the top of the page. addLog keeps its name (many callers) but
  // now pushes one short info toast and no longer keeps a log list.
  const addLog = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-2), { id, kind: 'info', text }]);
    // W6: exit is two steps — mark `exiting` (CSS fades it out over 250ms),
    // then remove it. Was a single filter at 4500ms (framer exit).
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 250);
    }, 4500);
  }, []);

  const pushToast = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, kind, text }]);
    // W6: two-step exit, same as addLog above.
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 250);
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    // W6: two-step exit — mark, fade 250ms, then remove.
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 250);
  }, []);

  const applyFullRead = useCallback((r: FullRead, isWired: boolean) => {
    setVersion(r.version);
    setMouseName(r.mouseName);
    setBattery(r.battery);
    setChargeFlag(r.chargeFlag);
    setKeys(r.keys);
    setKeysRaw(r.keysRaw);
    setConfig(r.config);
    setConfigRaw(r.configRaw);
    setWired(isWired);
  }, []);

  const handleStatus = useCallback(
    (s: StatusEvent) => {
      if (s.type === 'dpi-push' && s.dpiIndex !== undefined) {
        const idx = s.dpiIndex;
        setConfig((prev) => (prev ? { ...prev, dpiIndex: idx } : prev));
        addLog(
          mode === 'demo'
            ? `Demo (simulated): DPI button pressed — moved to stage ${idx + 1}.`
            : `DPI button pressed: moved to stage ${idx + 1}.`,
        );
      } else if (s.type === 'battery' && s.battery !== undefined) {
        // Every battery read (on connect, 30s poll, "Read battery now" click, or
        // mouse-pushed report 48) goes through here: history is recorded in one place only.
        const now = ts();
        const prev = batteryRef.current;
        const src = backendRef.current?.kind ?? 'demo';
        const bat = s.battery;
        const flag = s.chargeFlag ?? 0;
        batteryRef.current = bat;
        setBattery(bat);
        setChargeFlag(flag);
        setLastBatteryRead(now);
        setBatteryReads((n) => n + 1);
        setBatteryHistory((h) =>
          appendBatteryHistory(h, {
            time: now,
            battery: bat,
            chargeFlag: flag,
            source: src,
          }),
        );
        if (prev !== null && prev !== bat) {
          addLog(
            src === 'demo'
              ? `Demo (simulated): battery ${prev}% → ${bat}% (sample data).`
              : `Battery: ${prev}% → ${bat}% (at ${now}).`,
          );
        }
      }
    },
    [addLog, mode],
  );

  const setBusyBoth = (b: boolean): void => {
    busyRef.current = b;
    setBusy(b);
  };

  const connect = useCallback(
    // v2.6: picked = the specific device Ethan clicked in the scan list
    // (DevicePicker) — open exactly that device, no re-scan.
    async (nextMode: 'demo' | 'live', picked?: unknown) => {
      if (connecting || busyRef.current) return;
      setConnecting(true);
      try {
        if (backendRef.current?.connected) await backendRef.current.disconnect();
        const backend: MouseBackend = nextMode === 'demo' ? new DemoMouse() : new LiveMouse();
        backend.onStatus = handleStatus;
        // v2.4: backend.onLog is NO LONGER wired into addLog — onLog was made for the
        // Activity Log (removed); wiring it in would show 2 duplicate toasts
        // on every config write (1 from the backend, 1 from the store's pushToast).
        backendRef.current = backend;
        await backend.connect(picked);
        setMode(nextMode);
        setDeviceLabel(backend.label);
        const r = await backend.readAll();
        applyFullRead(r, backend.isWired);
        setConnected(true);
        // v2.5: entering the UI REQUIRES exactly 3 seconds of loading (ancient-yak-42,
        // compass in the middle, layers behind fully blurred) before the UI rises up.
        // (v3.0: cut from 5s to 3s.) The connect toast is pushed AFTER loading finishes
        // (pushed earlier it would sink behind the loading layer and dismiss before Ethan sees it).
        setLoading(true);
        if (loadingTimer.current) clearTimeout(loadingTimer.current);
        loadingTimer.current = setTimeout(() => {
          setLoading(false);
          pushToast(
            'ok',
            nextMode === 'demo' ? 'Demo enabled (simulated) — not a real mouse.' : 'Real mouse connected.',
          );
        }, 3000);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushToast('err', `Connection failed: ${msg}`);
      } finally {
        setConnecting(false);
      }
    },
    [addLog, applyFullRead, connecting, handleStatus, pushToast],
  );

  const disconnect = useCallback(async () => {
    try {
      if (backendRef.current) await backendRef.current.disconnect();
    } finally {
      if (loadingTimer.current) {
        clearTimeout(loadingTimer.current);
        loadingTimer.current = null;
      }
      setLoading(false);
      backendRef.current = null;
      setConnected(false);
      setCableCharging(false);
      setConfig(null);
      setKeys(null);
      setConfigRaw([]);
      setKeysRaw([]);
      setBattery(null);
      setBatteryHistory([]);
      setLastBatteryRead(null);
      setBatteryReads(0);
      batteryRef.current = null;
      batteryFailStreak.current = 0;
      setVersion('');
      setMouseName('');
      setDeviceLabel('not connected');
      addLog('Disconnected.');
    }
  }, [addLog]);

  const refresh = useCallback(async () => {
    const b = backendRef.current;
    if (!b?.connected || busyRef.current) return;
    setBusyBoth(true);
    // Redesign 2026-11-19 (j): reload shows the same picker-style loading — it has
    // a purpose (the re-read runs behind it, so its length follows the machine /
    // mouse instead of a blind timer), and when it lifts the UI floats up again
    // via app-enter, exactly like after connecting.
    setLoading(true);
    try {
      const r = await b.readAll();
      applyFullRead(r, b.isWired);
      addLog(mode === 'demo' ? 'Demo (simulated): re-read everything (sample data).' : 'Re-read everything from the mouse.');
    } catch (e) {
      pushToast('err', `Re-read failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyBoth(false);
      setLoading(false);
    }
  }, [addLog, applyFullRead, pushToast, mode]);

  /** Ask for the battery now ("Read battery now" button). The value arrives via onStatus('battery')
   *  so history + ask count are recorded in handleStatus; here only handle
   *  timeout/errors: if the mouse is asleep keep the old %, log once, then stay quiet. */
  const readBatteryNow = useCallback(async (): Promise<void> => {
    const b = backendRef.current;
    if (!b?.connected) {
      pushToast('err', 'Mouse not connected.');
      return;
    }
    try {
      const r = await b.readBattery();
      if (r === null) {
        batteryFailStreak.current += 1;
        if (batteryFailStreak.current === 1) {
          addLog('Battery ask: mouse did not answer (may be asleep) — keeping old %, will ask again later.');
        }
        return;
      }
      batteryFailStreak.current = 0;
    } catch (e) {
      addLog(`Battery ask failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [addLog, pushToast]);

  // Battery poll in Live mode: ask the mouse once every 30 seconds. Only Live polls
  // — Demo keeps its sample value (no fabricated drain curve).
  useEffect(() => {
    if (!connected || mode !== 'live') return undefined;
    const id = setInterval(() => {
      void readBatteryNow();
      // Redesign 2026-11-19 (d): re-check the cable every poll too — a plug/unplug
      // event can be missed (e.g. the cable was already in before the app opened).
      void isWiredDevicePresent().then(setCableCharging);
    }, BATTERY_POLL_MS);
    return () => clearInterval(id);
  }, [connected, mode, readBatteryNow]);

  // Redesign 2026-11-19 (d): cable plug/unplug while the app runs. navigator.hid
  // fires connect/disconnect for HID devices as they appear — a wired mouse
  // (VID 43172) plugging in means the cable is charging the mouse even though
  // the app's connection stays on the 2.4G dongle. The initial check covers a
  // cable that was already in when the app opened (no event fires for it).
  // NOTE: this only ever sets the CHARGING flag — it never touches `connected`
  // (a pulled dongle leaving the UI "connected" is W3's gap, fixed in W3).
  useEffect(() => {
    if (!connected || mode !== 'live' || !('hid' in navigator)) return undefined;
    const hid = (
      navigator as Navigator & {
        hid: {
          addEventListener?: (t: string, f: (e: { device: { vendorId: number } }) => void) => void;
          removeEventListener?: (t: string, f: (e: { device: { vendorId: number } }) => void) => void;
        };
      }
    ).hid;
    // Real Chrome/Edge have these; the sandbox mock HID does not — guard so a
    // missing listener API can never crash the app (the 30s poll re-check below
    // still covers the cable in that case).
    const canListen = typeof hid.addEventListener === 'function' && typeof hid.removeEventListener === 'function';
    const onPlug = (e: { device: { vendorId: number } }): void => {
      if (e.device?.vendorId === WIRED_VID) setCableCharging(true);
    };
    const onUnplug = (e: { device: { vendorId: number } }): void => {
      if (e.device?.vendorId === WIRED_VID) setCableCharging(false);
    };
    if (canListen) {
      hid.addEventListener!('connect', onPlug);
      hid.addEventListener!('disconnect', onUnplug);
    }
    void isWiredDevicePresent().then(setCableCharging);
    return () => {
      if (canListen) {
        hid.removeEventListener!('connect', onPlug);
        hid.removeEventListener!('disconnect', onUnplug);
      }
    };
  }, [connected, mode]);

  // v3.1 — simulated battery engine: ticks every 1 second while connected, using the
  // CURRENT polling rate from the live config. Demo: uses the demo rate, assumes drain
  // over 2.4G (demo has no cable). No tick while disconnected — that time
  // is caught up by loadWithElapsed on the next app start.
  // Charging = wired connection OR cable plugged in while on 2.4G (cableCharging):
  // battery rises at 150 mA. 2.4G with no cable: drains.
  // Save: every 10 seconds + immediately on rate/charge change + on unload (effect above).
  useEffect(() => {
    if (!connected || !simBattery) return undefined;
    const id = setInterval(() => {
      const prev = simRef.current ?? simBattery;
      const hz = config ? rateHz(config.reportRateIndex, wired) : prev.last_polling_rate;
      // Redesign 2026-11-19 (d): charging = wired connection OR cable plugged in
      // while on 2.4G. The cmd-48 charge_flag byte is live-proven always 0, so
      // the cable's presence is the only signal we have.
      const charging = wired || cableCharging;
      const prevPct = percentOf(prev);
      let next = charging ? chargeTick(prev, 1) : batteryTick(prev, 1, hz);
      next = { ...next, charging, last_polling_rate: hz };
      const nextPct = percentOf(next);
      // Low battery: fires only once per discharge cycle when dropping BELOW 20%.
      if (shouldNotifyLow(prevPct, nextPct, prev)) {
        next = { ...next, low_notified: true };
        void notifyLowBattery();
      }
      // Reset the flag when charging starts or the battery rises back above 25%.
      if (next.low_notified && (charging || nextPct > LOW_RESET_PCT)) {
        next = { ...next, low_notified: false };
      }
      const nowS = Math.floor(Date.now() / 1000);
      const rateChanged = next.last_polling_rate !== prev.last_polling_rate;
      const chargingChanged = next.charging !== prev.charging;
      // v3.0.2 — LAG FIX: don't setState every second. The exact state still runs
      // inside simRef (persist + low-battery notification use the ref); only re-render
      // when a DISPLAYED value changes: % with 1 decimal, mAh with 1 decimal, charge/rate/saver.
      // At 125 Hz (3 mA) the decimal % changes every ~8 min, decimal mAh every ~2 min — instead of
      // the whole component tree re-rendering once per second on a weak PC.
      const displayChanged =
        percentOfPrecise(next) !== percentOfPrecise(prev) ||
        Math.round(next.remaining_mah * 10) !== Math.round(prev.remaining_mah * 10) ||
        chargingChanged ||
        rateChanged ||
        next.saver !== prev.saver;
      if (displayChanged) setSimBattery(next);
      simRef.current = next;
      if (
        rateChanged ||
        chargingChanged ||
        nowS - lastPersistRef.current >= PERSIST_EVERY_S
      ) {
        lastPersistRef.current = nowS;
        void setBatteryState(next);
      }
    }, 1000);
    return () => clearInterval(id);
    // simBattery only starts the effect; the tick reads the latest state via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, config, wired, cableCharging, simBattery !== null]);

  const saveConfig = useCallback(
    async (next: MouseConfig): Promise<boolean> => {
      const b = backendRef.current;
      if (!b?.connected) {
        pushToast('err', 'Mouse not connected.');
        return false;
      }
      if (busyRef.current) {
        pushToast('info', 'Another operation is running, please wait.');
        return false;
      }
      setBusyBoth(true);
      try {
        const res = await b.writeConfig(next);
        const reread = await b.readConfigKeys();
        setConfig(reread.config);
        setConfigRaw(reread.configRaw);
        if (res.matched) {
          pushToast('ok', mode === 'demo' ? 'Demo: config saved (simulated).' : 'Config saved.');
          return true;
        }
        pushToast('err', `Saved but read-back differs: ${res.diff.map((d) => d.field).join(', ')}`);
        return false;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushToast('err', `Failed to save config: ${msg}`);
        return false;
      } finally {
        setBusyBoth(false);
      }
    },
    [pushToast, mode],
  );

  // v3.1 — Battery saver (More tab): ON = save the current rate/DPI, then write
  // polling 125 Hz + DPI 1600 to the mouse via setConfig (write path already proven
  // live, no new command bytes); OFF = restore the saved rate/DPI.
  // The battery bar turns YELLOW (tray popup + in-app indicator) while saver is on.
  const setBatterySaver = useCallback(
    async (on: boolean): Promise<boolean> => {
      const cur = config;
      if (!cur) {
        pushToast('err', 'Mouse not connected.');
        return false;
      }
      const SNAP_KEY = 'battery-saver-snapshot-v1';
      if (on) {
        const snap = {
          reportRateIndex: cur.reportRateIndex,
          dpiIndex: cur.dpiIndex,
          dpi: [...cur.dpi],
        };
        await storeSet(SNAP_KEY, JSON.stringify(snap));
        const dpi1600 = cur.dpi.indexOf(1600);
        const next: MouseConfig =
          dpi1600 >= 0
            ? { ...cur, reportRateIndex: indexForHz(125, wired), dpiIndex: dpi1600 }
            : {
                ...cur,
                reportRateIndex: indexForHz(125, wired),
                dpi: cur.dpi.map((d, i) => (i === cur.dpiIndex ? 1600 : d)),
              };
        const ok = await saveConfig(next);
        if (!ok) return false;
        setSimBattery((prev) => {
          if (!prev) return prev;
          const s = { ...prev, saver: true };
          persistSim(s);
          return s;
        });
        pushToast('ok', 'Battery saver on: polling 125 Hz, DPI 1600.');
        return true;
      }
      const raw = await storeGet(SNAP_KEY);
      if (raw) {
        try {
          const snap = JSON.parse(raw) as {
            reportRateIndex: number;
            dpiIndex: number;
            dpi: number[];
          };
          const ok = await saveConfig({ ...cur, ...snap });
          if (!ok) return false;
        } catch {
          pushToast('err', 'Could not read the config saved before battery saver.');
          return false;
        }
        await storeSet(SNAP_KEY, '');
      }
      setSimBattery((prev) => {
        if (!prev) return prev;
        const s = { ...prev, saver: false };
        persistSim(s);
        return s;
      });
      pushToast('ok', 'Battery saver off — restored previous polling + DPI.');
      return true;
    },
    [config, wired, saveConfig, pushToast, persistSim],
  );

  const saveKeys = useCallback(
    async (next: KeyBinding[]): Promise<boolean> => {
      const b = backendRef.current;
      if (!b?.connected) {
        pushToast('err', 'Mouse not connected.');
        return false;
      }
      if (busyRef.current) {
        pushToast('info', 'Another operation is running, please wait.');
        return false;
      }
      setBusyBoth(true);
      try {
        const res = await b.writeKeys(next);
        const reread = await b.readConfigKeys();
        setKeys(reread.keys);
        setKeysRaw(reread.keysRaw);
        if (res.matched) {
          pushToast('ok', mode === 'demo' ? 'Demo: key remap saved (simulated).' : 'Key remap saved.');
          return true;
        }
        pushToast('err', `Keys saved but read-back differs: ${res.diff.map((d) => d.field).join(', ')}`);
        return false;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushToast('err', `Failed to save keys: ${msg}`);
        return false;
      } finally {
        setBusyBoth(false);
      }
    },
    [pushToast, mode],
  );

  const writeMacros = useCallback(
    async (slot = 0): Promise<boolean> => {
      const b = backendRef.current;
      if (!b?.connected) {
        pushToast('err', 'Mouse not connected.');
        return false;
      }
      if (busyRef.current) return false;
      setBusyBoth(true);
      try {
        await b.writeMacro(macros, slot);
        pushToast('ok', mode === 'demo' ? `Demo: saved ${macros.length} macros (simulated).` : `Saved ${macros.length} macros to the mouse.`);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushToast('err', `Failed to save macros: ${msg}`);
        return false;
      } finally {
        setBusyBoth(false);
      }
    },
    [macros, pushToast, mode],
  );

  const setMacros = useCallback(
    (m: MacroDef[]) => {
      setMacrosState(m);
      persistMacros(m);
    },
    [],
  );

  const saveProfile = useCallback(
    (name: string) => {
      if (!config || !keys) {
        pushToast('err', 'No mouse data to save as a profile.');
        return;
      }
      const p: Profile = {
        name,
        savedAt: new Date().toLocaleString('en-GB'),
        config: JSON.parse(JSON.stringify(config)) as MouseConfig,
        keys: keys.map((k) => ({ type: k.type, code1: k.code1, code2: k.code2, code3: k.code3 })),
      };
      setProfilesState((prev) => {
        const next = [...prev.filter((x) => x.name !== name), p];
        persistProfiles(next);
        return next;
      });
      pushToast('ok', `Profile "${name}" saved.`);
    },
    [config, keys, pushToast],
  );

  const applyProfile = useCallback(
    async (p: Profile): Promise<boolean> => {
      const okCfg = await saveConfig(p.config);
      if (!okCfg) return false;
      const okKeys = await saveKeys(p.keys);
      return okKeys;
    },
    [saveConfig, saveKeys],
  );

  const deleteProfile = useCallback(
    (name: string) => {
      setProfilesState((prev) => {
        const next = prev.filter((x) => x.name !== name);
        persistProfiles(next);
        return next;
      });
    },
    [],
  );

  const restoreFactory = useCallback(async (): Promise<boolean> => {
    const ok = await saveConfig({ ...DEFAULT_CONFIG });
    if (ok) {
      const okKeys = await saveKeys(DEFAULT_KEYS);
      return okKeys;
    }
    return false;
  }, [saveConfig, saveKeys]);

  const simulateDpiPush = useCallback(() => {
    const b = backendRef.current;
    if (b && b.kind === 'demo') {
      (b as DemoMouse).simulateDpiPush();
    }
  }, []);

  const listenDpiPush = useCallback(() => {
    if (dpiListening) return;
    setDpiListening(true);
    addLog('Listening for the DPI button for 30 seconds — press the DPI button on the mouse a few times.');
    setTimeout(() => {
      setDpiListening(false);
      addLog('DPI button listening ended (30s).');
    }, 30000);
  }, [addLog, dpiListening]);

  // v1.1: do NOT auto-connect Demo on app start. v1.0 auto-enabled Demo and showed
  // "Connected" even though the browser never asked for WebHID permission — looked fabricated.
  // data. Now the app opens in the NOT CONNECTED state and Ethan chooses explicitly:
  // v3.0.9 — shared update starter: the AppUpdateGate owns the download →
  // progress → wipe flow; the Firmware section's Update button just opens
  // that same flow instead of running its own copy.
  const updateStarterRef = useRef<(() => void) | null>(null);
  const registerUpdateStarter = useCallback((fn: (() => void) | null) => {
    updateStarterRef.current = fn;
  }, []);
  const startAppUpdate = useCallback(() => {
    updateStarterRef.current?.();
  }, []);

  // "Try the Demo (simulated)" or "Connect a real mouse (WebHID)".
  const value = useMemo<MouseStore>(
    () => ({
      mode, connected, connecting, loading, theme, toggleTheme, lite, toggleLite, busy, wired, deviceLabel, version, mouseName,
      battery, chargeFlag, batteryHistory, lastBatteryRead, batteryReads,
      simPct, simPctPrecise, simCharging, simSaver, simRemainingMah, simPollingHz, setBatterySaver,
      config, keys, configRaw, keysRaw, toasts,
      macros, profiles, dpiListening, tab, setTab, skinId, setSkinId, connect, disconnect, refresh,
      registerUpdateStarter, startAppUpdate,
      readBatteryNow,
      saveConfig, saveKeys, writeMacros, setMacros, saveProfile, applyProfile,
      deleteProfile, restoreFactory, simulateDpiPush, listenDpiPush, addLog, dismissToast,
    }),
    [
      mode, connected, connecting, loading, theme, toggleTheme, lite, toggleLite, busy, wired, deviceLabel, version, mouseName,
      battery, chargeFlag, batteryHistory, lastBatteryRead, batteryReads,
      simPct, simPctPrecise, simCharging, simSaver, simRemainingMah, simPollingHz, setBatterySaver,
      config, keys, configRaw, keysRaw, toasts,
      macros, profiles, dpiListening, tab, skinId, setSkinId, connect, disconnect, refresh,
      registerUpdateStarter, startAppUpdate,
      readBatteryNow,
      saveConfig, saveKeys, writeMacros, setMacros, saveProfile, applyProfile,
      deleteProfile, restoreFactory, simulateDpiPush, listenDpiPush, addLog, dismissToast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

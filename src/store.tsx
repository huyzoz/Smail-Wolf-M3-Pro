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
}

const ts = (): string => new Date().toLocaleTimeString('vi-VN');

interface MouseStore {
  mode: 'demo' | 'live';
  connected: boolean;
  connecting: boolean;
  /** v2.5: đang load 3s (ancient-yak-42) sau khi kết nối, trước khi vào
      giao diện chính. (v3.0: rút từ 5s xuống 3s theo yêu cầu của bro.) */
  loading: boolean;
  /** v3.0: theme sáng/tối toàn app (Uiverse toggle ở TopBar). */
  theme: AppTheme;
  toggleTheme: () => void;
  busy: boolean;
  wired: boolean;
  deviceLabel: string;
  version: string;
  mouseName: string;
  battery: number | null;
  chargeFlag: number | null;
  batteryHistory: BatteryHistoryEntry[];
  /** v3.1 — pin MÔ PHỎNG (ước tính, xem src/lib/battery.ts). `battery`
      (report 48) là giá trị thô của firmware, KHÔNG hiện ra UI nữa. */
  simPct: number;
  /** v3.0.2 — % pin 1 số thập phân (hiển thị): xả 3 mA thì % nguyên ngồi
      yên ở 100% suốt 13 giờ đầu, còn 1 số lẻ tụt 0.1 mỗi ~8 phút — nhìn
      thấy pin tụt thật. Logic (ngưỡng 20%, saver) vẫn dùng simPct nguyên. */
  simPctPrecise: number;
  simCharging: boolean;
  simSaver: boolean;
  simRemainingMah: number;
  simPollingHz: number;
  /** Bật/tắt Tiết kiệm pin: ghi polling 125 Hz + DPI 1600 qua setConfig,
      tắt thì khôi phục rate/DPI đã lưu. Trả false nếu chưa kết nối/ghi lỗi. */
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
  // v2.7: skin chuột đang chọn (chỉ giao diện, lưu localStorage).
  skinId: string;
  setSkinId: (id: string) => void;
  // v2.6: picked = thiết bị cụ thể bro bấm trong danh sách quét.
  connect: (mode: 'demo' | 'live', picked?: unknown) => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
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
  // v3.0: theme toàn app — mặc định sáng, nhớ lựa chọn vào localStorage.
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
  // Áp theme lên <html data-theme> để CSS token + shim dark-mode ăn theo;
  // lưu lựa chọn để mở lại vẫn giữ.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('smailwolf_m3pro_theme_v1', theme);
    } catch {
      /* storage khóa — theme vẫn đổi trong phiên */
    }
  }, [theme]);
  const [busy, setBusy] = useState(false);
  const [wired, setWired] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState('chưa kết nối');
  const [version, setVersion] = useState('');
  const [mouseName, setMouseName] = useState('');
  const [battery, setBattery] = useState<number | null>(null);
  const [chargeFlag, setChargeFlag] = useState<number | null>(null);
  const [batteryHistory, setBatteryHistory] = useState<BatteryHistoryEntry[]>([]);
  const [lastBatteryRead, setLastBatteryRead] = useState<string | null>(null);
  const [batteryReads, setBatteryReads] = useState(0);
  const batteryRef = useRef<number | null>(null);
  const batteryFailStreak = useRef(0);
  // v3.1 — pin mô phỏng (ước tính): state bền vững trong store
  // "battery-state-v1" (xem src/lib/battery.ts + src/lib/tauri.ts).
  // KHÔNG reset về 100%/0% khi khởi động lại: lúc load áp dụng thời gian
  // thực đã trôi qua kể từ updated_at (loadWithElapsed).
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

  // Load 1 lần lúc mở app: đọc state đã lưu, áp dụng thời gian đã trôi
  // qua (sạc/xả khi app đóng), hiện % ngay — không chờ kết nối chuột.
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

  // Lưu lại khi đóng/reload tab (beforeunload) — % không mất khi tắt app.
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
  // v2.7: skin chuột đang chọn — chỉ là giao diện (không ghi xuống chuột),
  // lưu localStorage để mở lại vẫn giữ skin.
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
      /* storage đầy/khóa — skin vẫn đổi trong phiên */
    }
  }, []);

  const backendRef = useRef<MouseBackend | null>(null);
  const busyRef = useRef(false);
  const toastId = useRef(0);

  // v2.4: Activity Log ĐÃ XÓA (theo yêu cầu bro) — mọi thông báo giờ là
  // toast NGẮN ở đầu trang. addLog giữ nguyên tên (nhiều chỗ gọi) nhưng
  // giờ đẩy 1 toast info ngắn, không lưu danh sách log nữa.
  const addLog = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev.slice(-2), { id, kind: 'info', text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const pushToast = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
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
            ? `Demo (mô phỏng): nút DPI bấm — chuyển sang nấc ${idx + 1}.`
            : `Nút DPI bấm: chuyển sang nấc ${idx + 1}.`,
        );
      } else if (s.type === 'battery' && s.battery !== undefined) {
        // Mọi lần đọc pin (lúc kết nối, poll 30s, bấm "Đọc pin ngay", hoặc
        // chuột tự đẩy report 48) đều đi qua đây: ghi lịch sử 1 chỗ duy nhất.
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
              ? `Demo (mô phỏng): pin ${prev}% → ${bat}% (dữ liệu mẫu).`
              : `Pin: ${prev}% → ${bat}% (lúc ${now}).`,
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
    // v2.6: picked = thiết bị cụ thể bro bấm trong danh sách quét
    // (DevicePicker) — mở đúng thiết bị đó, không quét lại.
    async (nextMode: 'demo' | 'live', picked?: unknown) => {
      if (connecting || busyRef.current) return;
      setConnecting(true);
      try {
        if (backendRef.current?.connected) await backendRef.current.disconnect();
        const backend: MouseBackend = nextMode === 'demo' ? new DemoMouse() : new LiveMouse();
        backend.onStatus = handleStatus;
        // v2.4: backend.onLog KHÔNG nối vào addLog nữa — onLog sinh ra cho
        // Activity Log (đã xóa); nối vào thì mỗi lần ghi config lại hiện
        // 2 toast trùng nhau (1 từ backend, 1 từ pushToast của store).
        backendRef.current = backend;
        await backend.connect(picked);
        setMode(nextMode);
        setDeviceLabel(backend.label);
        const r = await backend.readAll();
        applyFullRead(r, backend.isWired);
        setConnected(true);
        // v2.5: vào giao diện BẮT BUỘC load đúng 3 giây (ancient-yak-42,
        // la bàn ở giữa, các layer sau che mờ hết) rồi UI mới trôi lên.
        // (v3.0: rút từ 5s xuống 3s.) Toast kết nối đẩy SAU khi load xong
        // (đẩy trước thì nó chìm sau lớp loading và tự tắt trước khi bro thấy).
        setLoading(true);
        if (loadingTimer.current) clearTimeout(loadingTimer.current);
        loadingTimer.current = setTimeout(() => {
          setLoading(false);
          pushToast(
            'ok',
            nextMode === 'demo' ? 'Đã bật Demo (mô phỏng) — không phải chuột thật.' : 'Đã kết nối chuột thật.',
          );
        }, 3000);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushToast('err', `Kết nối lỗi: ${msg}`);
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
      setDeviceLabel('chưa kết nối');
      addLog('Đã ngắt kết nối.');
    }
  }, [addLog]);

  const refresh = useCallback(async () => {
    const b = backendRef.current;
    if (!b?.connected || busyRef.current) return;
    setBusyBoth(true);
    try {
      const r = await b.readAll();
      applyFullRead(r, b.isWired);
      addLog(mode === 'demo' ? 'Demo (mô phỏng): đã đọc lại toàn bộ (dữ liệu mẫu).' : 'Đã đọc lại toàn bộ từ chuột.');
    } catch (e) {
      pushToast('err', `Đọc lại lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusyBoth(false);
    }
  }, [addLog, applyFullRead, pushToast, mode]);

  /** Hỏi pin ngay (nút "Đọc pin ngay"). Giá trị về qua onStatus('battery')
   *  nên lịch sử + số lần hỏi được ghi ở handleStatus, ở đây chỉ xử lý
   *  timeout/lỗi: chuột ngủ thì giữ % cũ, log 1 lần rồi im. */
  const readBatteryNow = useCallback(async (): Promise<void> => {
    const b = backendRef.current;
    if (!b?.connected) {
      pushToast('err', 'Chưa kết nối chuột.');
      return;
    }
    try {
      const r = await b.readBattery();
      if (r === null) {
        batteryFailStreak.current += 1;
        if (batteryFailStreak.current === 1) {
          addLog('Hỏi pin: chuột không trả lời (có thể đang ngủ) — giữ % cũ, sẽ hỏi lại sau.');
        }
        return;
      }
      batteryFailStreak.current = 0;
    } catch (e) {
      addLog(`Hỏi pin lỗi: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [addLog, pushToast]);

  // Poll pin ở chế độ Live: mỗi 30 giây hỏi chuột 1 lần. Chỉ Live mới poll
  // — Demo giữ nguyên giá trị mẫu (không bịa đường pin tụt).
  useEffect(() => {
    if (!connected || mode !== 'live') return undefined;
    const id = setInterval(() => {
      void readBatteryNow();
    }, BATTERY_POLL_MS);
    return () => clearInterval(id);
  }, [connected, mode, readBatteryNow]);

  // v3.1 — engine pin mô phỏng: tick mỗi 1 giây khi đã kết nối, dùng polling
  // rate HIỆN TẠI từ config live. Demo: dùng rate của demo, giả định xả
  // qua 2.4G (demo không có dây). Chưa kết nối thì không tick — thời gian
  // đó được bù bằng loadWithElapsed ở lần mở app sau.
  // Sạc = cắm dây (VID 43172 → wired=true): pin lên 150 mA. 2.4G: xả.
  // Lưu: mỗi 10 giây + ngay khi đổi rate/sạc + khi unload (effect trên).
  useEffect(() => {
    if (!connected || !simBattery) return undefined;
    const id = setInterval(() => {
      const prev = simRef.current ?? simBattery;
      const hz = config ? rateHz(config.reportRateIndex, wired) : prev.last_polling_rate;
      const charging = wired;
      const prevPct = percentOf(prev);
      let next = charging ? chargeTick(prev, 1) : batteryTick(prev, 1, hz);
      next = { ...next, charging, last_polling_rate: hz };
      const nextPct = percentOf(next);
      // Pin yếu: chỉ bắn 1 lần mỗi chu kỳ xả khi tụt QUA 20%.
      if (shouldNotifyLow(prevPct, nextPct, prev)) {
        next = { ...next, low_notified: true };
        void notifyLowBattery();
      }
      // Reset cờ khi bắt đầu sạc hoặc pin lên lại trên 25%.
      if (next.low_notified && (charging || nextPct > LOW_RESET_PCT)) {
        next = { ...next, low_notified: false };
      }
      const nowS = Math.floor(Date.now() / 1000);
      const rateChanged = next.last_polling_rate !== prev.last_polling_rate;
      const chargingChanged = next.charging !== prev.charging;
      // v3.0.2 — LAG FIX: đừng setState mỗi giây. State chính xác vẫn chạy
      // trong simRef (persist + thông báo pin yếu dùng ref), chỉ re-render
      // khi giá trị HIỂN THỊ đổi: % 1 số lẻ, mAh 1 số lẻ, sạc/rate/saver.
      // Ở 125 Hz (3 mA) % lẻ đổi mỗi ~8 phút, mAh lẻ mỗi ~2 phút — thay vì
      // cả cây component re-render 1 lần/giây trên máy yếu.
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
    // simBattery chỉ để khởi động effect; tick đọc state mới nhất qua ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, config, wired, simBattery !== null]);

  const saveConfig = useCallback(
    async (next: MouseConfig): Promise<boolean> => {
      const b = backendRef.current;
      if (!b?.connected) {
        pushToast('err', 'Chưa kết nối chuột.');
        return false;
      }
      if (busyRef.current) {
        pushToast('info', 'Đang chạy thao tác khác, đợi xong đã.');
        return false;
      }
      setBusyBoth(true);
      try {
        const res = await b.writeConfig(next);
        const reread = await b.readConfigKeys();
        setConfig(reread.config);
        setConfigRaw(reread.configRaw);
        if (res.matched) {
          pushToast('ok', mode === 'demo' ? 'Demo: đã ghi config (mô phỏng) — khớp 100%.' : 'Đã ghi config — đọc lại khớp 100%.');
          return true;
        }
        pushToast('err', `Ghi xong nhưng đọc lại lệch: ${res.diff.map((d) => d.field).join(', ')}`);
        return false;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushToast('err', `Ghi config lỗi: ${msg}`);
        return false;
      } finally {
        setBusyBoth(false);
      }
    },
    [pushToast, mode],
  );

  // v3.1 — Tiết kiệm pin (mục Khác): BẬT = lưu rate/DPI hiện tại rồi ghi
  // polling 125 Hz + DPI 1600 xuống chuột qua setConfig (đường ghi đã chứng
  // minh live, không byte lệnh mới); TẮT = khôi phục rate/DPI đã lưu.
  // Thanh pin chuyển VÀNG (tray popup + chỉ báo trong app) khi saver bật.
  const setBatterySaver = useCallback(
    async (on: boolean): Promise<boolean> => {
      const cur = config;
      if (!cur) {
        pushToast('err', 'Chưa kết nối chuột.');
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
        pushToast('ok', 'Đã bật Tiết kiệm pin: polling 125 Hz, DPI 1600.');
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
          pushToast('err', 'Không đọc được cấu hình đã lưu trước khi tiết kiệm pin.');
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
      pushToast('ok', 'Đã tắt Tiết kiệm pin — khôi phục polling + DPI cũ.');
      return true;
    },
    [config, wired, saveConfig, pushToast, persistSim],
  );

  const saveKeys = useCallback(
    async (next: KeyBinding[]): Promise<boolean> => {
      const b = backendRef.current;
      if (!b?.connected) {
        pushToast('err', 'Chưa kết nối chuột.');
        return false;
      }
      if (busyRef.current) {
        pushToast('info', 'Đang chạy thao tác khác, đợi xong đã.');
        return false;
      }
      setBusyBoth(true);
      try {
        const res = await b.writeKeys(next);
        const reread = await b.readConfigKeys();
        setKeys(reread.keys);
        setKeysRaw(reread.keysRaw);
        if (res.matched) {
          pushToast('ok', mode === 'demo' ? 'Demo: đã ghi remap phím (mô phỏng) — khớp 100%.' : 'Đã ghi remap phím — đọc lại khớp 100%.');
          return true;
        }
        pushToast('err', `Ghi phím xong nhưng đọc lại lệch: ${res.diff.map((d) => d.field).join(', ')}`);
        return false;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushToast('err', `Ghi phím lỗi: ${msg}`);
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
        pushToast('err', 'Chưa kết nối chuột.');
        return false;
      }
      if (busyRef.current) return false;
      setBusyBoth(true);
      try {
        await b.writeMacro(macros, slot);
        pushToast('ok', mode === 'demo' ? `Demo: đã ghi ${macros.length} macro (mô phỏng).` : `Đã ghi ${macros.length} macro xuống chuột.`);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushToast('err', `Ghi macro lỗi: ${msg}`);
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
        pushToast('err', 'Chưa có dữ liệu chuột để lưu profile.');
        return;
      }
      const p: Profile = {
        name,
        savedAt: new Date().toLocaleString('vi-VN'),
        config: JSON.parse(JSON.stringify(config)) as MouseConfig,
        keys: keys.map((k) => ({ type: k.type, code1: k.code1, code2: k.code2, code3: k.code3 })),
      };
      setProfilesState((prev) => {
        const next = [...prev.filter((x) => x.name !== name), p];
        persistProfiles(next);
        return next;
      });
      pushToast('ok', `Đã lưu profile "${name}".`);
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
    addLog('Đang nghe nút DPI trong 30 giây — bấm nút DPI trên chuột vài lần.');
    setTimeout(() => {
      setDpiListening(false);
      addLog('Hết 30 giây nghe nút DPI.');
    }, 30000);
  }, [addLog, dpiListening]);

  // v1.1: KHÔNG tự kết nối Demo khi mở app. v1.0 tự bật Demo và hiện
  // "Đã kết nối" dù trình duyệt chưa hề hỏi quyền WebHID — nhìn như bịa
  // dữ liệu. Giờ app mở ở trạng thái CHƯA KẾT NỐI, bro chọn rõ ràng:
  // "Dùng thử Demo (mô phỏng)" hoặc "Kết nối chuột thật (WebHID)".
  const value = useMemo<MouseStore>(
    () => ({
      mode, connected, connecting, loading, theme, toggleTheme, busy, wired, deviceLabel, version, mouseName,
      battery, chargeFlag, batteryHistory, lastBatteryRead, batteryReads,
      simPct, simPctPrecise, simCharging, simSaver, simRemainingMah, simPollingHz, setBatterySaver,
      config, keys, configRaw, keysRaw, toasts,
      macros, profiles, dpiListening, tab, setTab, skinId, setSkinId, connect, disconnect, refresh,
      readBatteryNow,
      saveConfig, saveKeys, writeMacros, setMacros, saveProfile, applyProfile,
      deleteProfile, restoreFactory, simulateDpiPush, listenDpiPush, addLog, dismissToast,
    }),
    [
      mode, connected, connecting, loading, theme, toggleTheme, busy, wired, deviceLabel, version, mouseName,
      battery, chargeFlag, batteryHistory, lastBatteryRead, batteryReads,
      simPct, simPctPrecise, simCharging, simSaver, simRemainingMah, simPollingHz, setBatterySaver,
      config, keys, configRaw, keysRaw, toasts,
      macros, profiles, dpiListening, tab, skinId, setSkinId, connect, disconnect, refresh,
      readBatteryNow,
      saveConfig, saveKeys, writeMacros, setMacros, saveProfile, applyProfile,
      deleteProfile, restoreFactory, simulateDpiPush, listenDpiPush, addLog, dismissToast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

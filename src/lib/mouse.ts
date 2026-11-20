/**
 * Demo backend + shared app types.
 *
 * The demo backend simulates Ethan's real mouse (state as read live on
 * 2026-11-07 20:59:13) using the SAME builders/parsers as the live path:
 * it synthesizes wire-format replies (with correct checksums) and runs
 * them through parseConfig/parseKeys, so the UI code path is identical
 * in demo and live mode. The only difference is the transport.
 */
import {
  buildMacroCommands,
  buildSetConfig,
  buildSetKeys,
  diffConfigFields,
  diffKeyFields,
  parseConfig,
  parseKeys,
  verifyChecksum,
  type FullRead,
  type KeyBinding,
  type MacroDef,
  type MouseConfig,
  type ParsedKey,
  type StatusEvent,
} from './hid';

export interface ConfigKeysRead {
  keys: ParsedKey[];
  keysRaw: number[];
  config: MouseConfig;
  configRaw: number[];
}

export interface MouseBackend {
  kind: 'demo' | 'live';
  connected: boolean;
  isWired: boolean;
  label: string;
  onStatus: (s: StatusEvent) => void;
  onLog: (line: string) => void;
  connect(device?: unknown): Promise<unknown>;
  disconnect(): Promise<void>;
  readAll(): Promise<FullRead>;
  readConfigKeys(): Promise<ConfigKeysRead>;
  /** Ask for battery now (report 48) — also fires onStatus('battery'). */
  readBattery(): Promise<{ battery: number; chargeFlag: number } | null>;
  writeConfig(cfg: MouseConfig): Promise<{
    sent: number[];
    matched: boolean;
    diff: ReturnType<typeof diffConfigFields>;
  }>;
  writeKeys(keys: KeyBinding[]): Promise<{
    sent: number[];
    matched: boolean;
    diff: ReturnType<typeof diffKeyFields>;
  }>;
  writeMacro(macros: MacroDef[], slot?: number): Promise<{ sent: number[][] }>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Ethan's live mouse state (20:59:13 snapshot) — demo starts here. */
export function demoInitialConfig(): MouseConfig {
  return {
    lightMode: 0,
    reportRateIndex: 0,
    dpiCount: 6,
    dpiIndex: 1,
    dpi: [800, 1600, 2400, 3200, 6400, 12000],
    scrollFlag: 0,
    lodValue: 0,
    sensorFlag: 0,
    keyRespond: 0,
    sleepLight: 5,
    highspeedMode: 0,
    wakeupFlag: 0,
    moveLightFlag: 0,
    byte53Raw: 0,
    byte54Raw: 0,
    checksumOk: true,
    checksumByte: 196,
    checksumExpected: 196,
    fallback: false,
  };
}

export function demoInitialKeys(): KeyBinding[] {
  return [
    { type: 32, code1: 1, code2: 0, code3: 0 },
    { type: 32, code1: 2, code2: 0, code3: 0 },
    { type: 32, code1: 4, code2: 0, code3: 0 },
    { type: 16, code1: 1, code2: 25, code3: 0 }, // Ctrl+V
    { type: 16, code1: 1, code2: 6, code3: 0 }, // Ctrl+C
    { type: 33, code1: 85, code2: 0, code3: 0 },
  ];
}

/** How often to ask for the battery in Live mode (ms). The battery command is only 64 bytes and goes through
 *  the serial queue, so 30 seconds is light — enough to see the battery drop in real time
 *  without bothering other commands. */
export const BATTERY_POLL_MS = 30000;

/** One battery read, recorded for the history chart. */
export interface BatteryHistoryEntry {
  time: string; // HH:MM:SS at read time
  battery: number; // % the mouse reports (byte 7 of report 48, shown directly)
  chargeFlag: number; // 0 = not charging, 1 = charging
  source: 'live' | 'demo';
}

/** Add one read to the history. Only record when the value CHANGES (battery or charge
 *  state) or when there's nothing yet — asking again after 30 seconds with no change doesn't
 *  spam the history; the ask count is still tracked separately in the store. Keeps at most `max` entries. */
export function appendBatteryHistory(
  prev: BatteryHistoryEntry[],
  next: BatteryHistoryEntry,
  max = 120,
): BatteryHistoryEntry[] {
  const last = prev[prev.length - 1];
  if (last && last.battery === next.battery && last.chargeFlag === next.chargeFlag) return prev;
  return [...prev, next].slice(-max);
}
export function buildConfigReply(cfg: MouseConfig): number[] {
  const t = Array(64).fill(0);
  t[0] = 14; t[1] = 165; t[3] = 46; t[4] = 1; t[5] = 1; t[6] = 1;
  t[8] = cfg.lightMode;
  t[9] = cfg.reportRateIndex + 1;
  t[10] = cfg.dpiCount;
  t[11] = cfg.dpiIndex + 1;
  for (let i = 0; i < 6; i++) {
    t[12 + i * 2] = cfg.dpi[i] & 0xff;
    t[13 + i * 2] = (cfg.dpi[i] >> 8) & 0xff;
  }
  t[47] = cfg.scrollFlag;
  t[48] = cfg.lodValue;
  t[49] = cfg.sensorFlag;
  t[50] = cfg.keyRespond;
  t[51] = cfg.sleepLight;
  t[52] = cfg.highspeedMode;
  t[53] = cfg.byte53Raw;
  t[54] = cfg.byte54Raw;
  let s = 0;
  for (let i = 3; i < 64; i++) s += t[i];
  t[2] = s & 0xff;
  return t;
}

/** Build a wire-format keys reply from state (checksum included). */
export function buildKeysReply(keys: KeyBinding[]): number[] {
  const t = Array(64).fill(0);
  t[0] = 8; t[1] = 165; t[3] = 32; t[4] = 1; t[5] = 1; t[6] = 1;
  for (let i = 0; i < 6; i++) {
    const k = keys[i] || { type: 0, code1: 0, code2: 0, code3: 0 };
    t[7 + i * 4] = k.type;
    t[8 + i * 4] = k.code1;
    t[9 + i * 4] = k.code2;
    t[10 + i * 4] = k.code3;
  }
  // extra slots, exactly as the real mouse returns
  t[31] = 33; t[32] = 56; t[33] = 1; t[34] = 0;
  t[35] = 33; t[36] = 56; t[37] = 255; t[38] = 0;
  let s = 0;
  for (let i = 3; i < 64; i++) s += t[i];
  t[2] = s & 0xff;
  return t;
}

export class DemoMouse implements MouseBackend {
  kind = 'demo' as const;
  connected = false;
  isWired = false;
  label = 'Demo mouse (simulated)';
  onStatus: (s: StatusEvent) => void = () => {};
  onLog: (line: string) => void = () => {};

  private config: MouseConfig = demoInitialConfig();
  private keys: KeyBinding[] = demoInitialKeys();
  private battery = 100;
  private version = '2.1.3';
  private mouseName = '20251225190600-F189-3311';

  async connect(): Promise<void> {
    await sleep(350);
    this.connected = true;
    this.onLog('Demo: simulated mouse connected (live state 20:59:13 from Ethan).');
  }

  async disconnect(): Promise<void> {
    await sleep(120);
    this.connected = false;
  }

  private synthConfig(): { config: MouseConfig; raw: number[] } {
    const raw = buildConfigReply(this.config);
    const parsed = parseConfig(raw);
    if ('error' in parsed) throw new Error(parsed.error);
    return { config: parsed, raw };
  }

  private synthKeys(): { keys: ParsedKey[]; raw: number[] } {
    const raw = buildKeysReply(this.keys);
    const parsed = parseKeys(raw);
    if ('error' in parsed) throw new Error(parsed.error);
    return { keys: parsed.keys, raw };
  }

  async readAll(): Promise<FullRead> {
    await sleep(420);
    const { config, raw: configRaw } = this.synthConfig();
    const { keys, raw: keysRaw } = this.synthKeys();
    // Demo also goes through onStatus('battery') like the real mouse (report 48 arrives
    // via inputreport) so the store records battery history through exactly one path.
    this.onStatus({ type: 'battery', battery: this.battery, chargeFlag: 0 });
    return {
      version: this.version,
      mouseName: this.mouseName,
      battery: this.battery,
      chargeFlag: 0,
      keys,
      keysRaw,
      config,
      configRaw,
      status: 1,
    };
  }

  async readBattery(): Promise<{ battery: number; chargeFlag: number } | null> {
    await sleep(120);
    const r = { battery: this.battery, chargeFlag: 0 };
    this.onStatus({ type: 'battery', battery: r.battery, chargeFlag: 0 });
    return r;
  }

  async readConfigKeys(): Promise<ConfigKeysRead> {
    await sleep(180);
    const { config, raw: configRaw } = this.synthConfig();
    const { keys, raw: keysRaw } = this.synthKeys();
    return { keys, keysRaw, config, configRaw };
  }

  async writeConfig(cfg: MouseConfig): Promise<{
    sent: number[];
    matched: boolean;
    diff: ReturnType<typeof diffConfigFields>;
  }> {
    const bytes = buildSetConfig(cfg);
    if (!bytes) throw new Error('Write failed: config fallback or checksum BAD');
    await sleep(260);
    // Apply the write the way the mouse would: rebuild state from the
    // sent bytes (same layout the live mouse stores).
    const next: MouseConfig = {
      ...cfg,
      checksumOk: true,
      checksumByte: 0,
      checksumExpected: 0,
      fallback: false,
    };
    this.config = next;
    const after = await this.readConfigKeys();
    const diff = diffConfigFields(cfg, after.config);
    this.onLog(`Demo: config ${diff.length === 0 ? 'saved' : `saved but differs in ${diff.length} fields`}.`);
    return { sent: bytes, matched: diff.length === 0, diff };
  }

  async writeKeys(keys: KeyBinding[]): Promise<{
    sent: number[];
    matched: boolean;
    diff: ReturnType<typeof diffKeyFields>;
  }> {
    const bytes = buildSetKeys(keys);
    await sleep(260);
    this.keys = keys.map((k) => ({ ...k }));
    const after = await this.readConfigKeys();
    const diff = diffKeyFields(keys, after.keys);
    return { sent: bytes, matched: diff.length === 0, diff };
  }

  async writeMacro(macros: MacroDef[], slot = 0): Promise<{ sent: number[][] }> {
    await sleep(300);
    const cmds = buildMacroCommands(macros, slot);
    this.onLog(`Demo: wrote ${macros.length} macros (slot ${slot}, ${cmds.length} commands incl. commit) — macros cannot be read back from the mouse.`);
    return { sent: cmds };
  }

  /** Simulate the physical DPI button: cycles dpi_index 0..5 like report 250. */
  simulateDpiPush(): void {
    this.config = { ...this.config, dpiIndex: (this.config.dpiIndex + 1) % 6 };
    this.onStatus({
      type: 'dpi-push',
      dpiIndex: this.config.dpiIndex,
      reportRateIndex: this.config.reportRateIndex,
    });
  }
}

// ---------------------------------------------------------------- macros + profiles in localStorage
const MACRO_KEY = 'smailwolf_m3pro_macros_v1';
const PROFILE_KEY = 'smailwolf_m3pro_profiles_v1';

export function loadMacros(): MacroDef[] {
  try {
    const raw = localStorage.getItem(MACRO_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as MacroDef[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveMacros(macros: MacroDef[]): void {
  localStorage.setItem(MACRO_KEY, JSON.stringify(macros));
}

export interface Profile {
  name: string;
  savedAt: string;
  config: MouseConfig;
  keys: KeyBinding[];
}

export function loadProfiles(): Profile[] {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Profile[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveProfiles(profiles: Profile[]): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
}

/** Verify a config reply's checksum the same way the app does (for tests). */
export function checkReply(t: number[]): boolean {
  return verifyChecksum(t).ok;
}

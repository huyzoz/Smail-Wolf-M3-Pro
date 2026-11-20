/**
 * SMAILWOLF M3 Pro — HID protocol, ported 1:1 from the proven test pages
 * (test-read.html v3.2 + test-write.html) and PROTOCOL.md.
 *
 * Proven live 2026-11-07 on Ethan's real mouse (2.4G dongle, firmware 2.1.3):
 * - full read sequence, config write round-trip matched 100% (3 runs)
 * - reply checksum byte[2] = sum(bytes[3..63]) mod 256 (9/9 live replies)
 * - DPI-button report 250, full polling ladder 125/250/500/1000
 *
 * Transport rules that must never be broken:
 * - ONE command at a time (serial queue) — replies cannot be told apart.
 * - All config commands are 64-byte arrays, byte 0 = Report ID 240.
 * - readReply: 500 ms timeout resolves [] (not an error).
 * - sendReport wrapped in a 3 s timeout so a stuck device fails loudly.
 * - Macro READ ([6,12,...]) is DEAD: report 6 is not an output report.
 *   Macros live in localStorage and are WRITE-ONLY via [240,13]+commit.
 */

// ---------------------------------------------------------------- types
export interface KeyBinding {
  type: number;
  code1: number;
  code2: number;
  code3: number;
}

export interface ParsedKey extends KeyBinding {
  index: number;
  name: string;
}

export interface MouseConfig {
  lightMode: number;
  reportRateIndex: number; // 0..3 -> Hz via pollingHz()
  dpiCount: number; // 6
  dpiIndex: number; // 0..5
  dpi: number[]; // 6 stages, each 50..50000
  scrollFlag: number; // 0 = normal (正向), 1 = reverse (反向)
  lodValue: number;
  sensorFlag: number; // bit0 = Line correction
  keyRespond: number; // no UI in original app — round-trip as read
  sleepLight: number; // 0 = Never, 1..100 minutes
  highspeedMode: number;
  /** both parsed from the HIGH nibble of read byte 53 (original-app bug) */
  wakeupFlag: number;
  moveLightFlag: number;
  byte53Raw: number;
  byte54Raw: number;
  checksumOk: boolean;
  checksumByte: number;
  checksumExpected: number;
  /** true when bytes 13..15 are all 0 or all 255: mouse returned empty,
   *  original app falls back to hardcoded defaults */
  fallback: boolean;
}

export interface StatusEvent {
  type: 'dpi-push' | 'mouse_status' | 'battery' | 'match';
  dpiIndex?: number;
  reportRateIndex?: number;
  mouseStatus?: number;
  battery?: number;
  chargeFlag?: number;
}

export interface FullRead {
  version: string;
  mouseName: string;
  battery: number | null;
  chargeFlag: number | null;
  keys: ParsedKey[];
  keysRaw: number[];
  config: MouseConfig;
  configRaw: number[];
  status: number | null;
}

// ---------------------------------------------------------------- constants
export const HID_FILTER = { usagePage: 65281, usage: 16 }; // 0xFF01 / 0x10
export const MOUSE_VIDS = [43172, 43173, 14391];
export const WIRED_VID = 43172;

export const POLLING_24G = [125, 250, 500, 1000];
export const POLLING_WIRED = [125, 500, 1000];

export const DEFAULT_DPI = [800, 1600, 2400, 3200, 6400, 12000];

/** Shipped default profile (mouse_info_v348.json DefaultProfile). */
export const DEFAULT_CONFIG: MouseConfig = {
  lightMode: 0,
  reportRateIndex: 3,
  dpiCount: 6,
  dpiIndex: 1,
  dpi: [...DEFAULT_DPI],
  scrollFlag: 0,
  lodValue: 1,
  sensorFlag: 0,
  keyRespond: 8,
  sleepLight: 10,
  highspeedMode: 0,
  wakeupFlag: 0,
  moveLightFlag: 0,
  byte53Raw: 0,
  byte54Raw: 0,
  checksumOk: true,
  checksumByte: 0,
  checksumExpected: 0,
  fallback: false,
};

/** Factory fallback the original app uses when the mouse returns empty. */
export const FALLBACK_CONFIG: MouseConfig = {
  ...DEFAULT_CONFIG,
  reportRateIndex: 3,
  dpiIndex: 2,
  dpi: [800, 1600, 2400, 3200, 5000, 12000],
  lodValue: 1,
  sensorFlag: 53,
  keyRespond: 8,
  sleepLight: 10,
  wakeupFlag: 1,
  moveLightFlag: 0,
  fallback: true,
};

export const DEFAULT_KEYS: KeyBinding[] = [
  { type: 32, code1: 1, code2: 0, code3: 0 }, // Left
  { type: 32, code1: 2, code2: 0, code3: 0 }, // Right
  { type: 32, code1: 4, code2: 0, code3: 0 }, // Middle
  { type: 32, code1: 8, code2: 0, code3: 0 }, // Backward
  { type: 32, code1: 16, code2: 0, code3: 0 }, // Forward
  { type: 33, code1: 85, code2: 0, code3: 0 }, // DPI button (fixed, not remappable)
];

export const KEY_LABELS = ['Left Button', 'Right Button', 'Middle Button', 'Back Button', 'Forward Button', 'DPI Button'];

// ---------------------------------------------------------------- helpers
export const hexDump = (arr: number[]): string =>
  arr.length ? arr.map((b) => b.toString(16).padStart(2, '0')).join(' ') : '(empty)';

const u16le = (lo: number, hi: number): number => (hi << 8) | lo;
export const clampDpi = (v: number): number =>
  Number.isNaN(v) || v < 50 ? 50 : v > 50000 ? 50000 : Math.round(v);

export function pollingHz(index: number, isWired: boolean): string {
  const list = isWired ? POLLING_WIRED : POLLING_24G;
  return list[index] !== undefined ? `${list[index]} Hz` : `index ${index} (?)`;
}

/** byte[2] = (sum of bytes [3..63]) mod 256 — proven on 9 live replies. */
export function verifyChecksum(t: number[]): { ok: boolean; expected: number } {
  if (t.length < 3) return { ok: false, expected: 0 };
  let s = 0;
  for (let i = 3; i < t.length; i++) s += t[i];
  return { ok: (s & 0xff) === t[2], expected: s & 0xff };
}

// ---------------------------------------------------------------- key names (KC table + module 3954, verbatim)
export const KC: Record<number, string> = {
  4: 'A', 5: 'B', 6: 'C', 7: 'D', 8: 'E', 9: 'F', 10: 'G', 11: 'H', 12: 'I',
  13: 'J', 14: 'K', 15: 'L', 16: 'M', 17: 'N', 18: 'O', 19: 'P', 20: 'Q',
  21: 'R', 22: 'S', 23: 'T', 24: 'U', 25: 'V', 26: 'W', 27: 'X', 28: 'Y',
  29: 'Z', 30: '1', 31: '2', 32: '3', 33: '4', 34: '5', 35: '6', 36: '7',
  37: '8', 38: '9', 39: '0', 40: 'Enter', 41: 'Esc', 42: 'Backspace',
  43: 'Tab', 44: 'Space', 45: '-', 46: '=', 47: '[', 48: ']', 49: '\\',
  51: ';', 52: "'", 53: '`', 54: ',', 55: '.', 56: '/', 57: 'CapsLock',
  58: 'F1', 59: 'F2', 60: 'F3', 61: 'F4', 62: 'F5', 63: 'F6', 64: 'F7',
  65: 'F8', 66: 'F9', 67: 'F10', 68: 'F11', 69: 'F12', 70: 'PrintScreen',
  71: 'ScrollLock', 72: 'Pause', 73: 'Insert', 74: 'Home', 75: 'PgUp',
  76: 'Delete', 77: 'End', 78: 'PgDn', 79: 'Right', 80: 'Left', 81: 'Down',
  82: 'Up', 83: 'NumLock', 84: 'Num/', 85: 'Num*', 86: 'Num-', 87: 'Num+',
  88: 'NumEnter', 89: 'Num1', 90: 'Num2', 91: 'Num3', 92: 'Num4', 93: 'Num5',
  94: 'Num6', 95: 'Num7', 96: 'Num8', 97: 'Num9', 98: 'Num0', 99: 'Num.',
  101: 'Menu', 103: 'Num=', 104: 'F13', 105: 'F14', 106: 'F15', 107: 'F16',
  108: 'F17', 109: 'F18', 110: 'F19', 111: 'F20', 112: 'F21', 113: 'F22',
  114: 'F23', 115: 'F24', 117: 'Help', 135: 'Ro', 137: 'Yen', 168: 'Mute',
  169: 'VolUp', 170: 'VolDown', 224: 'LCtrl', 225: 'LShift', 226: 'LAlt',
  227: 'LGUI', 228: 'RCtrl', 229: 'RShift', 230: 'RAlt', 231: 'RGUI',
};
const MODS: [number, string][] = [
  [1, 'Ctrl'], [2, 'Shift'], [4, 'Alt'], [8, 'Win'],
  [16, 'RCtrl'], [32, 'RShift'], [64, 'RAlt'],
];
const MOUSE_BTN: Record<number, string> = {
  1: 'Left', 2: 'Right', 4: 'Middle', 8: 'Backward', 16: 'Forward',
};

/** Consumer (multimedia/system) keys — type 48, from the original app's
 *  systemKey catalog (chunk 515, module 5608). code1 = usage, code2 = page
 *  (0 = consumer, 1 = generic desktop, 2 = browser). */
export const CONSUMER_KEYS: Record<string, string> = {
  '205,0': 'Play/Pause',
  '226,0': 'Mute',
  '183,0': 'Stop',
  '182,0': 'Previous Track',
  '181,0': 'Next Track',
  '233,0': 'Volume +',
  '234,0': 'Volume -',
  '131,1': 'Multimedia',
  '111,0': 'Brightness +',
  '112,0': 'Brightness -',
  '35,2': 'Browser Home',
  '39,2': 'Browser Refresh',
  '38,2': 'Browser Stop',
  '37,2': 'Browser Forward',
  '36,2': 'Browser Backward',
  '42,2': 'Browser Favorites',
  '33,2': 'Browser Search',
  '146,1': 'Calculator',
  '148,1': 'My Computer',
  '138,1': 'Mail',
};

export function keyName(type: number, code1: number, code2: number, code3: number): string {
  if (type === 32) return 'Mouse: ' + (MOUSE_BTN[code1] || `button-bit ${code1}`);
  if (type === 33) {
    if (code1 === 85) return 'DPI button';
    if (code1 === 56) return code2 === 1 ? 'Scroll wheel up' : code2 === 255 ? 'Scroll wheel down' : `Scroll (${code2})`;
    return `Special (${code1},${code2},${code3})`;
  }
  if (type === 48) {
    const name = CONSUMER_KEYS[`${code1},${code2}`];
    return name ? `Media: ${name}` : `Consumer (${code1},${code2},${code3})`;
  }
  if (type === 16) {
    if (code1 === 0 && code2 === 0) return '(empty)';
    const mods = MODS.filter(([bit]) => code1 & bit).map(([, n]) => n);
    const key = KC[code2] || `HID ${code2}`;
    return 'Keyboard: ' + [...mods, key].join('+');
  }
  if (type === 112) return `Macro #${code1} (type ${code3})`;
  if (type === 0 || type === 255) return '(empty)';
  return `type ${type} (${code1},${code2},${code3})`;
}

/** Assignable actions in the original app's key-setting popup
 *  (systemKey catalog, chunk 515 module 5608 — verbatim values).
 *  Groups mirror the popup tabs: System = Mouse + Edit, Instruction =
 *  Multimedia + System (consumer keys). */
export interface SystemAction {
  id: string;
  label: string;
  binding: KeyBinding;
}
export interface SystemActionGroup {
  id: string;
  title: string;
  actions: SystemAction[];
}
export const SYSTEM_KEY_ACTIONS: SystemActionGroup[] = [
  {
    id: 'mouse',
    title: 'Mouse',
    actions: [
      { id: 'left', label: 'Left button', binding: { type: 32, code1: 1, code2: 0, code3: 0 } },
      { id: 'right', label: 'Right button', binding: { type: 32, code1: 2, code2: 0, code3: 0 } },
      { id: 'middle', label: 'Middle button', binding: { type: 32, code1: 4, code2: 0, code3: 0 } },
      { id: 'forward', label: 'Forward', binding: { type: 32, code1: 16, code2: 0, code3: 0 } },
      { id: 'backward', label: 'Backward', binding: { type: 32, code1: 8, code2: 0, code3: 0 } },
      { id: 'scrollUp', label: 'Scroll wheel up', binding: { type: 33, code1: 56, code2: 1, code3: 0 } },
      { id: 'scrollDown', label: 'Scroll wheel down', binding: { type: 33, code1: 56, code2: 255, code3: 0 } },
      { id: 'dpi', label: 'DPI', binding: { type: 33, code1: 85, code2: 0, code3: 0 } },
    ],
  },
  {
    id: 'edit',
    title: 'Edit',
    actions: [
      { id: 'cut', label: 'Cut', binding: { type: 16, code1: 1, code2: 27, code3: 0 } },
      { id: 'copy', label: 'Copy', binding: { type: 16, code1: 1, code2: 6, code3: 0 } },
      { id: 'paste', label: 'Paste', binding: { type: 16, code1: 1, code2: 25, code3: 0 } },
    ],
  },
  {
    id: 'media',
    title: 'Multimedia',
    actions: [
      { id: 'playPause', label: 'Play/Pause', binding: { type: 48, code1: 205, code2: 0, code3: 0 } },
      { id: 'mute', label: 'Mute', binding: { type: 48, code1: 226, code2: 0, code3: 0 } },
      { id: 'stop', label: 'Stop', binding: { type: 48, code1: 183, code2: 0, code3: 0 } },
      { id: 'prev', label: 'Previous Track', binding: { type: 48, code1: 182, code2: 0, code3: 0 } },
      { id: 'next', label: 'Next Track', binding: { type: 48, code1: 181, code2: 0, code3: 0 } },
      { id: 'volUp', label: 'Volume +', binding: { type: 48, code1: 233, code2: 0, code3: 0 } },
      { id: 'volDown', label: 'Volume -', binding: { type: 48, code1: 234, code2: 0, code3: 0 } },
    ],
  },
  {
    id: 'system',
    title: 'System',
    actions: [
      { id: 'brightUp', label: 'Brightness +', binding: { type: 48, code1: 111, code2: 0, code3: 0 } },
      { id: 'brightDown', label: 'Brightness -', binding: { type: 48, code1: 112, code2: 0, code3: 0 } },
      { id: 'browserHome', label: 'Browser Home', binding: { type: 48, code1: 35, code2: 2, code3: 0 } },
      { id: 'browserRefresh', label: 'Browser Refresh', binding: { type: 48, code1: 39, code2: 2, code3: 0 } },
      { id: 'browserForward', label: 'Browser Forward', binding: { type: 48, code1: 37, code2: 2, code3: 0 } },
      { id: 'browserBackward', label: 'Browser Backward', binding: { type: 48, code1: 36, code2: 2, code3: 0 } },
      { id: 'calculator', label: 'Calculator', binding: { type: 48, code1: 146, code2: 1, code3: 0 } },
      { id: 'myComputer', label: 'My Computer', binding: { type: 48, code1: 148, code2: 1, code3: 0 } },
      { id: 'mail', label: 'Mail', binding: { type: 48, code1: 138, code2: 1, code3: 0 } },
      { id: 'disable', label: 'Disable', binding: { type: 16, code1: 0, code2: 0, code3: 0 } },
    ],
  },
];

/** Map a browser KeyboardEvent.code to a HID usage (for key capture). */
export const CODE_TO_HID: Record<string, number> = {
  KeyA: 4, KeyB: 5, KeyC: 6, KeyD: 7, KeyE: 8, KeyF: 9, KeyG: 10, KeyH: 11,
  KeyI: 12, KeyJ: 13, KeyK: 14, KeyL: 15, KeyM: 16, KeyN: 17, KeyO: 18,
  KeyP: 19, KeyQ: 20, KeyR: 21, KeyS: 22, KeyT: 23, KeyU: 24, KeyV: 25,
  KeyW: 26, KeyX: 27, KeyY: 28, KeyZ: 29,
  Digit1: 30, Digit2: 31, Digit3: 32, Digit4: 33, Digit5: 34, Digit6: 35,
  Digit7: 36, Digit8: 37, Digit9: 38, Digit0: 39,
  Enter: 40, Escape: 41, Backspace: 42, Tab: 43, Space: 44,
  Minus: 45, Equal: 46, BracketLeft: 47, BracketRight: 48, Backslash: 49,
  Semicolon: 51, Quote: 52, Backquote: 53, Comma: 54, Period: 55, Slash: 56,
  CapsLock: 57,
  F1: 58, F2: 59, F3: 60, F4: 61, F5: 62, F6: 63, F7: 64, F8: 65, F9: 66,
  F10: 67, F11: 68, F12: 69,
  PrintScreen: 70, ScrollLock: 71, Pause: 72, Insert: 73, Home: 74,
  PageUp: 75, Delete: 76, End: 77, PageDown: 78,
  ArrowRight: 79, ArrowLeft: 80, ArrowDown: 81, ArrowUp: 82,
  NumLock: 83, NumpadDivide: 84, NumpadMultiply: 85, NumpadSubtract: 86,
  NumpadAdd: 87, NumpadEnter: 88, Numpad1: 89, Numpad2: 90, Numpad3: 91,
  Numpad4: 92, Numpad5: 93, Numpad6: 94, Numpad7: 95, Numpad8: 96,
  Numpad9: 97, Numpad0: 98, NumpadDecimal: 99,
};

// ---------------------------------------------------------------- parsers
export function parseVersion(t: number[]): string {
  return t
    .filter((b) => b !== 0)
    .slice(-5)
    .map((b) => String.fromCharCode(b))
    .join('');
}

export function parseMouseInfo(t: number[]): string {
  if (t[0] !== 82 || t[8] === 0) return '(empty)';
  return t
    .slice(8, 32)
    .filter((b) => b !== 0)
    .map((b) => String.fromCharCode(b))
    .join('');
}

export function parseConfig(t: number[]): MouseConfig | { error: string } {
  if (t[0] !== 14) return { error: `reply[0]=${t[0]} (expected 14)` };
  const cs = verifyChecksum(t);
  const base = {
    checksumOk: cs.ok,
    checksumByte: t[2],
    checksumExpected: cs.expected,
  };
  if (
    (t[13] === 0 && t[14] === 0 && t[15] === 0) ||
    (t[13] === 255 && t[14] === 255 && t[15] === 255)
  ) {
    return { ...FALLBACK_CONFIG, ...base };
  }
  const nib = (t[53] >> 4) & 15;
  return {
    ...base,
    lightMode: t[8],
    reportRateIndex: t[9] - 1,
    dpiCount: t[10],
    dpiIndex: t[11] - 1 > 0 ? t[11] - 1 : 0,
    dpi: [0, 1, 2, 3, 4, 5].map((i) => clampDpi(u16le(t[12 + i * 2], t[13 + i * 2]))),
    scrollFlag: t[47],
    lodValue: t[48],
    sensorFlag: t[49],
    keyRespond: t[50],
    sleepLight: t[51],
    highspeedMode: t[52],
    wakeupFlag: nib,
    moveLightFlag: nib,
    byte53Raw: t[53],
    byte54Raw: t[54],
    fallback: false,
  };
}

export function parseKeys(t: number[]): { keys: ParsedKey[]; extraSlots: number[] } | { error: string } {
  if (t[0] !== 8) return { error: `reply[0]=${t[0]} (expected 8)` };
  const o = t.slice(7);
  const keys: ParsedKey[] = [];
  for (let i = 0; i < 6; i++) {
    const type = o[4 * i];
    const code1 = o[4 * i + 1];
    const code2 = o[4 * i + 2];
    const code3 = o[4 * i + 3];
    keys.push({ index: i, type, code1, code2, code3, name: keyName(type, code1, code2, code3) });
  }
  // The real reply contains 2 extra slots (bytes 31-38): (33,56,1,0) and (33,56,255,0)
  return { keys, extraSlots: t.slice(31, 39) };
}

export function fieldNameForByte(i: number): string {
  if (i === 0) return 'reply-id (14)';
  if (i === 2) return 'checksum (sum of bytes 3..63 mod 256)';
  if (i === 8) return 'light_mode';
  if (i === 9) return 'report_rate (wire = index+1)';
  if (i === 10) return 'dpi_count';
  if (i === 11) return 'dpi_index (wire = index+1)';
  if (i >= 12 && i <= 23)
    return `dpi${Math.floor((i - 12) / 2) + 1}_value (${i % 2 === 0 ? 'lo' : 'hi'})`;
  if (i === 47) return 'scroll_flag (scroll direction)';
  if (i === 48) return 'lod_value';
  if (i === 49) return 'sensor_flag (bit0: line correction)';
  if (i === 50) return 'key_respond';
  if (i === 51) return 'sleep_light (minutes, 0 = never)';
  if (i === 52) return 'highspeed_mode';
  if (i === 53) return 'byte53 (wakeup/move nibble cao)';
  if (i === 54) return 'byte54 (ghi: wakeup<<4|move)';
  return `byte ${i}`;
}

/** Compare an intended config against the config re-read after a write.
 *  `matched` means the mouse now holds exactly what was sent. */
export function diffConfigFields(
  intended: MouseConfig,
  actual: MouseConfig,
): { field: string; from: number | number[]; to: number | number[] }[] {
  const out: { field: string; from: number | number[]; to: number | number[] }[] = [];
  const cmp = (field: string, x: number | number[], y: number | number[]): void => {
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ field, from: x, to: y });
  };
  cmp('reportRateIndex', intended.reportRateIndex, actual.reportRateIndex);
  cmp('dpiIndex', intended.dpiIndex, actual.dpiIndex);
  cmp('dpi', intended.dpi, actual.dpi);
  cmp('scrollFlag', intended.scrollFlag, actual.scrollFlag);
  cmp('lodValue', intended.lodValue, actual.lodValue);
  cmp('sensorFlag', intended.sensorFlag, actual.sensorFlag);
  cmp('keyRespond', intended.keyRespond, actual.keyRespond);
  cmp('sleepLight', intended.sleepLight, actual.sleepLight);
  cmp('highspeedMode', intended.highspeedMode, actual.highspeedMode);
  cmp('wakeupFlag', intended.wakeupFlag, actual.wakeupFlag);
  cmp('moveLightFlag', intended.moveLightFlag, actual.moveLightFlag);
  return out;
}

/** Compare intended keys (first 5 remappable) against the re-read keys. */
export function diffKeyFields(
  intended: KeyBinding[],
  actual: ParsedKey[],
): { field: string; from: string; to: string }[] {
  const out: { field: string; from: string; to: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const a = intended[i];
    const b = actual[i];
    if (!a || !b) continue;
    if (a.type !== b.type || a.code1 !== b.code1 || a.code2 !== b.code2 || a.code3 !== b.code3) {
      out.push({
        field: `key ${i}`,
        from: keyName(a.type, a.code1, a.code2, a.code3),
        to: b.name,
      });
    }
  }
  return out;
}

export function diffBytes(
  a: number[],
  b: number[],
): { byte: number; field: string; from: number; to: number }[] {
  const out: { byte: number; field: string; from: number; to: number }[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) out.push({ byte: i, field: fieldNameForByte(i), from: x, to: y });
  }
  return out;
}

// ---------------------------------------------------------------- builders (write commands, verbatim chunk 515)
/** setMouseConfigData — PROVEN LIVE (round-trip matched 100%, 3 runs).
 *  The written byte 54 takes the high nibble of byte 53, NOT the read byte 54. */
export function buildSetConfig(cfg: MouseConfig): number[] | null {
  if (cfg.fallback || !cfg.checksumOk) return null;
  const t = Array(64).fill(0);
  const lo = (v: number): number => v & 0xff;
  const hi = (v: number): number => (v >> 8) & 0xff;
  t[0] = 240; t[1] = 15; t[2] = 174; t[3] = 10; t[4] = 47;
  t[5] = 1; t[6] = 1; t[7] = 1; t[8] = 0; t[9] = 0;
  t[10] = cfg.reportRateIndex + 1;
  t[11] = cfg.dpiCount;
  t[12] = cfg.dpiIndex + 1;
  for (let i = 0; i < 6; i++) {
    t[13 + i * 2] = lo(cfg.dpi[i]);
    t[14 + i * 2] = hi(cfg.dpi[i]);
  }
  t[48] = cfg.scrollFlag;
  t[49] = cfg.lodValue;
  t[50] = cfg.sensorFlag;
  t[51] = cfg.keyRespond;
  t[52] = cfg.sleepLight;
  t[53] = cfg.highspeedMode;
  t[54] = ((cfg.wakeupFlag & 15) << 4) | (cfg.moveLightFlag & 15);
  return t;
}

/** setMouseKeys — verbatim chunk 515. Only the first 5 keys come from the
 *  caller; bytes 28..39 are hardcoded (DPI key + 2 extra slots). */
export function buildSetKeys(keys: KeyBinding[]): number[] {
  const t = Array(64).fill(0);
  const defaults: KeyBinding[] = [
    { type: 32, code1: 1, code2: 0, code3: 0 },
    { type: 32, code1: 2, code2: 0, code3: 0 },
    { type: 32, code1: 4, code2: 0, code3: 0 },
    { type: 32, code1: 8, code2: 0, code3: 0 },
    { type: 32, code1: 16, code2: 0, code3: 0 },
    { type: 33, code1: 85, code2: 0, code3: 0 },
    { type: 33, code1: 56, code2: 1, code3: 0 },
    { type: 33, code1: 56, code2: 255, code3: 0 },
  ];
  t[0] = 240; t[1] = 9; t[2] = 165; t[3] = 34; t[4] = 44;
  for (let i = 0; i < 8; i++) {
    t[8 + i * 4] = defaults[i].type;
    t[9 + i * 4] = defaults[i].code1;
    t[10 + i * 4] = defaults[i].code2;
    t[11 + i * 4] = defaults[i].code3;
  }
  for (let o = 0; o < 5; o++) {
    const k = keys[o] || defaults[o];
    t[8 + o * 4] = k.type;
    t[9 + o * 4] = k.code1;
    t[10 + o * 4] = k.code2;
    t[11 + o * 4] = k.code3;
  }
  return t;
}

// ---------------------------------------------------------------- macro encoding (PROTOCOL.md §3, verbatim chunk 515)
export type MacroAction =
  | { kind: 'key'; code: number; action: 'keydown' | 'keyup'; delayMs: number }
  | { kind: 'mouse'; button: number; action: 'mousedown' | 'mouseup'; delayMs: number }
  | { kind: 'delay'; delayMs: number };

export interface MacroDef {
  id: string;
  name: string;
  actions: MacroAction[];
}

const r16 = (v: number): [number, number] => [v & 0xff, (v >> 8) & 0xff];

/** Compile macros to the wire payload, then split into 56-byte chunks.
 *  Returns the full command arrays ([240,13,...] per chunk + commit).
 *  UNPROVEN LIVE — same transport as the proven config write. */
export function buildMacroCommands(macros: MacroDef[], slot = 0): number[][] {
  const offsetTable = Array(64).fill(0);
  let d = 0;
  const compiled: { list: { delay: number; code: number; action: string }[] }[] = [];
  macros.forEach((m, t) => {
    const list: { delay: number; code: number; action: string }[] = [];
    for (const a of m.actions) {
      if (a.kind === 'key') {
        list.push({ code: a.code, action: a.action, delay: 0 });
      } else if (a.kind === 'mouse') {
        const code = a.button === 0 ? 1 : a.button === 1 ? 4 : a.button === 2 ? 2 : a.button === 3 ? 8 : 16;
        list.push({ code, action: a.action, delay: 0 });
      } else {
        const last = list[list.length - 1];
        if (last) last.delay = last.delay + (a.delayMs || 10);
      }
    }
    compiled.push({ list });
    if (list.length) {
      const [lo, hi] = r16(d + 68);
      offsetTable[2 * t] = lo;
      offsetTable[2 * t + 1] = hi;
      d += 4 * list.length;
    } else {
      offsetTable[2 * t] = 64;
      offsetTable[2 * t + 1] = 0;
    }
  });
  const records: number[] = [];
  compiled.forEach((m) => {
    m.list.forEach((rec, o) => {
      const [dl, dh] = r16(rec.delay || 2);
      const isLast = o === m.list.length - 1 ? 1 : 0;
      const isDown = rec.action === 'keydown' || rec.action === 'mousedown' ? 1 : 0;
      const isMouse = rec.action === 'mousedown' || rec.action === 'mouseup';
      const flags = (rec.code >= 224 ? 1 : isMouse ? 3 : 2) | (isDown << 6) | (isLast << 7);
      const codeByte = rec.code >= 224 ? 1 << (rec.code & 15) : rec.code;
      records.push(dl, dh, flags, codeByte);
    });
  });
  const payload = [...offsetTable, 0, 0, 128, 0, ...records];
  const out: number[][] = [];
  for (let e = 0; e * 56 < payload.length; e++) {
    const chunk = payload.slice(e * 56, Math.min((e + 1) * 56, payload.length));
    const [alo, ahi] = r16(2048 * slot + 56 * e);
    const data = [chunk.length, alo, ahi, 0, ...chunk];
    const checksum = data.reduce((s, b) => s + b, 0) & 0xff;
    out.push([240, 13, 0, checksum, ...data]);
  }
  out.push([240, 16, 165, 34, 0, 0, 0, 5]); // commit
  return out;
}

// ---------------------------------------------------------------- live transport (WebHID)
export type HidLike = {
  vendorId: number;
  productId: number;
  productName: string;
  collections: {
    usagePage: number;
    usage: number;
    inputReports: { reportId: number }[];
    outputReports: { reportId: number }[];
    featureReports: { reportId: number }[];
  }[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: Uint8Array): Promise<void>;
  addEventListener(type: 'inputreport', listener: (e: { data: DataView }) => void): void;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`timeout ${ms}ms waiting for ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Live WebHID backend — the same code path as test-read v3.2 / test-write. */
export class LiveMouse {
  kind = 'live' as const;
  private device: HidLike | null = null;
  private wired = false;
  private queue: Promise<unknown> = Promise.resolve();
  private replies: { currTime: number; message: number[] }[] = [];
  private replyWaiter: ((bytes: number[]) => void) | null = null;
  private statusWaiters: { name: string; res: (d: StatusEvent | null) => void; timer: ReturnType<typeof setTimeout> }[] = [];
  onStatus: (s: StatusEvent) => void = () => {};
  onLog: (line: string) => void = () => {};

  get connected(): boolean {
    return !!this.device;
  }
  get isWired(): boolean {
    return this.wired;
  }
  get label(): string {
    return this.device ? `${this.device.productName} (VID ${this.device.vendorId})` : 'not connected';
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn) as Promise<T>;
    this.queue = run.catch(() => {});
    return run;
  }

  private pruneReplies(now: number): void {
    while (this.replies.length && this.replies[0].currTime < now - 2000) this.replies.shift();
  }

  private readReply(): Promise<number[]> {
    this.pruneReplies(Date.now());
    if (this.replies.length) return Promise.resolve(this.replies.shift()!.message);
    return new Promise((res) => {
      const timer = setTimeout(() => {
        if (this.replyWaiter === res) {
          this.replyWaiter = null;
          res([]);
        }
      }, 500);
      this.replyWaiter = (bytes) => {
        clearTimeout(timer);
        res(bytes);
      };
    });
  }

  private handleReport(bytes: number[]): void {
    if (bytes[0] === 250 && bytes[8] !== 208) {
      this.onStatus({ type: 'dpi-push', dpiIndex: bytes[8] - 1, reportRateIndex: bytes[9] - 1 });
    } else if (bytes[0] === 237) {
      this.onStatus({ type: 'mouse_status', mouseStatus: bytes[7] });
    } else if (bytes[0] === 48) {
      this.onStatus({ type: 'battery', battery: bytes[7], chargeFlag: bytes[8] });
    } else if (bytes[0] === 19 && bytes[1] === 226) {
      this.onStatus({ type: 'match' });
    }
    if (this.replyWaiter) {
      const w = this.replyWaiter;
      this.replyWaiter = null;
      w(bytes);
    } else {
      this.replies.push({ currTime: Date.now(), message: bytes });
    }
  }

  private waitStatus(name: string, timeoutMs = 2000): Promise<StatusEvent | null> {
    return new Promise((res) => {
      const waiter: { name: string; res: (d: StatusEvent | null) => void; timer: ReturnType<typeof setTimeout> } = {
        name,
        res,
        timer: setTimeout(() => {
          this.statusWaiters = this.statusWaiters.filter((w) => w !== waiter);
          res(null);
        }, timeoutMs),
      };
      this.statusWaiters.push(waiter);
    });
  }

  private fireStatus(name: string, data: StatusEvent): void {
    this.statusWaiters = this.statusWaiters.filter((w) => {
      if (w.name === name) {
        clearTimeout(w.timer);
        w.res(data);
        return false;
      }
      return true;
    });
  }

  private async writeCommand(cmd: number[]): Promise<number[]> {
    if (!this.device) throw new Error('Mouse not connected');
    const padded = Array(64).fill(0);
    cmd.forEach((b, i) => {
      padded[i] = b;
    });
    await withTimeout(
      this.device.sendReport(padded[0], new Uint8Array(padded.slice(1))),
      3000,
      'sendReport',
    );
    return this.readReply();
  }

  private queuedWrite(cmd: number[]): Promise<number[]> {
    return this.enqueue(() => this.writeCommand(cmd));
  }

  // v2.6: connect(device?) — DevicePicker does a real scan (requestDevice), then
  // clicking one specific device in the list opens exactly that device,
  // no re-scan / no more taking the first device by VID.
  async connect(picked?: unknown): Promise<HidLike> {
    if (!('hid' in navigator)) throw new Error('This browser has no WebHID. Use Chrome/Edge.');
    const hid = (navigator as Navigator & { hid: { getDevices(): Promise<HidLike[]>; requestDevice(o: unknown): Promise<HidLike[]> } }).hid;
    let device: HidLike;
    if (picked && typeof picked === 'object' && 'open' in picked) {
      device = picked as HidLike;
    } else {
      let devices = (await hid.getDevices()).filter((d) =>
        d.collections?.some((c) => c.usagePage === 65281 && c.usage === 16),
      );
      if (!devices.length) {
        this.onLog('No device has been granted permission yet, opening the device picker…');
        devices = await hid.requestDevice({ filters: [HID_FILTER] });
      }
      if (!devices.length) throw new Error('No device selected.');
      devices.sort((a, b) => a.vendorId - b.vendorId);
      device = devices[0];
    }
    this.wired = device.vendorId === WIRED_VID;
    await device.open();
    device.addEventListener('inputreport', (e) => {
      const bytes = Array.from(new Uint8Array(e.data.buffer));
      // status listener path also resolves waitStatus waiters
      if (bytes[0] === 48) this.fireStatus('battery', { type: 'battery', battery: bytes[7], chargeFlag: bytes[8] });
      if (bytes[0] === 237) this.fireStatus('mouse_status', { type: 'mouse_status', mouseStatus: bytes[7] });
      this.handleReport(bytes);
    });
    this.device = device;
    return device;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.device) await this.device.close();
    } finally {
      this.device = null;
    }
  }

  /** Full startup read sequence, exactly like the original app. */
  async readAll(): Promise<FullRead> {
    const v = await this.queuedWrite([240, 4]);
    const version = parseVersion(v);
    const info = await this.queuedWrite([240, 82]);
    const mouseName = parseMouseInfo(info);
    const batteryP = this.waitStatus('battery');
    await this.queuedWrite([240, 48, 165, 11, 46, 1, 1, 1, 0, 0]);
    const bat = await batteryP;
    const k = await this.queuedWrite([240, 8, 165, 11, 44, 0, 0, 0, 0, 0]);
    const parsedKeys = parseKeys(k);
    if ('error' in parsedKeys) throw new Error(`Failed to read keys: ${parsedKeys.error}`);
    const t = await this.queuedWrite([240, 14, 165, 11, 46, 1, 1, 1, 0, 0]);
    const cfg = parseConfig(t);
    if ('error' in cfg) throw new Error(`Failed to read config: ${cfg.error}`);
    const stP = this.waitStatus('mouse_status');
    await this.queuedWrite([240, 237]);
    const st = await stP;
    return {
      version,
      mouseName,
      battery: bat?.battery ?? null,
      chargeFlag: bat?.chargeFlag ?? null,
      keys: parsedKeys.keys,
      keysRaw: k,
      config: cfg,
      configRaw: t,
      status: st?.mouseStatus ?? null,
    };
  }

  /** Ask the mouse for its battery right now (report 48). Used by the
   *  Live battery poller — the original app only asks once at startup,
   *  so its % goes stale. The same report also fires onStatus (which
   *  records history), so this return is only for success/failure.
   *  Returns null on timeout (e.g. mouse asleep); caller keeps the
   *  last good value. */
  async readBattery(): Promise<{ battery: number; chargeFlag: number } | null> {
    const p = this.waitStatus('battery');
    await this.queuedWrite([240, 48, 165, 11, 46, 1, 1, 1, 0, 0]);
    const bat = await p;
    if (bat?.battery === undefined) return null;
    return { battery: bat.battery, chargeFlag: bat.chargeFlag ?? 0 };
  }

  /** Fast read (keys + config only, ~1 s) — for snapshot/diff. */
  async readConfigKeys(): Promise<{ keys: ParsedKey[]; keysRaw: number[]; config: MouseConfig; configRaw: number[] }> {
    let last: { keys: ParsedKey[]; keysRaw: number[]; config: MouseConfig; configRaw: number[] } | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const k = await this.queuedWrite([240, 8, 165, 11, 44, 0, 0, 0, 0, 0]);
      const parsedKeys = parseKeys(k);
      const t = await this.queuedWrite([240, 14, 165, 11, 46, 1, 1, 1, 0, 0]);
      const cfg = parseConfig(t);
      if ('error' in parsedKeys || 'error' in cfg) {
        last = null;
        continue;
      }
      last = { keys: parsedKeys.keys, keysRaw: k, config: cfg, configRaw: t };
      if (cfg.checksumOk) return last;
    }
    if (!last) throw new Error('Failed to read keys/config twice in a row');
    return last;
  }

  /** Write config, then re-read and verify the mouse now holds exactly
   *  what was sent (intended-vs-actual field diff). */
  async writeConfig(cfg: MouseConfig): Promise<{
    sent: number[];
    matched: boolean;
    diff: ReturnType<typeof diffConfigFields>;
  }> {
    const bytes = buildSetConfig(cfg);
    if (!bytes) throw new Error('Write failed: config fallback or checksum BAD');
    const ack = await this.queuedWrite(bytes);
    if (ack[0] !== 15) throw new Error(`Write ack error: reply[0]=${ack[0]} (expected 15)`);
    const ackCs = verifyChecksum(ack);
    if (!ackCs.ok) throw new Error(`Ack checksum BAD: reply=${ack[2]}, expected=${ackCs.expected}`);
    const after = await this.readConfigKeys();
    const diff = diffConfigFields(cfg, after.config);
    return { sent: bytes, matched: diff.length === 0, diff };
  }

  async writeKeys(keys: KeyBinding[]): Promise<{
    sent: number[];
    matched: boolean;
    diff: ReturnType<typeof diffKeyFields>;
  }> {
    const bytes = buildSetKeys(keys);
    await this.queuedWrite(bytes);
    const after = await this.readConfigKeys();
    const diff = diffKeyFields(keys, after.keys);
    return { sent: bytes, matched: diff.length === 0, diff };
  }

  /** Write macros (write-only — cannot be read back). */
  async writeMacro(macros: MacroDef[], slot = 0): Promise<{ sent: number[][] }> {
    const cmds = buildMacroCommands(macros, slot);
    for (const c of cmds) await this.queuedWrite(c);
    return { sent: cmds };
  }
}

/** Redesign 2026-11-19 (d): is a WIRED Smailwolf mouse (VID 43172) present among
    the devices this browser has been granted? A cable charges the mouse even
    while the app stays connected over the 2.4G dongle — that is the case the old
    `wired` flag missed. getDevices() only returns GRANTED devices, so this
    answers true once the wired mouse was ever connected (the grant persists);
    the plug/unplug event listener in the store covers cables plugged in while
    the app runs. Never throws — false when WebHID is absent or the call fails. */
export async function isWiredDevicePresent(): Promise<boolean> {
  try {
    if (!('hid' in navigator)) return false;
    const hid = (navigator as Navigator & { hid: { getDevices(): Promise<HidLike[]> } }).hid;
    const devices = await hid.getDevices();
    return devices.some((d) => d.vendorId === WIRED_VID);
  } catch {
    return false;
  }
}

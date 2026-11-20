/**
 * Protocol tests — run with: npx tsx tests/hid.test.ts
 * Ports the assertions from test-read.html v3.2 / test-write.html vm tests,
 * plus the demo-backend round-trip. All vectors are Ethan's real live replies.
 */
import {
  BATTERY_POLL_MS,
  appendBatteryHistory,
  buildKeysReply,
  buildConfigReply,
  DemoMouse,
  demoInitialConfig,
  demoInitialKeys,
  type BatteryHistoryEntry,
} from '../src/lib/mouse';
import {
  buildMacroCommands,
  buildSetConfig,
  buildSetKeys,
  clampDpi,
  diffBytes,
  keyName,
  parseConfig,
  parseKeys,
  parseMouseInfo,
  parseVersion,
  pollingHz,
  SYSTEM_KEY_ACTIONS,
  verifyChecksum,
  type MouseConfig,
} from '../src/lib/hid';

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  if (ok) pass++;
  else fail++;
}

// --- live vectors (2026-11-07, checksums verified in Python) ---
// 18:43 state: dpiIndex 2, sensor 1 (line correction ON), sleep 5, byte2=198
const cfg198 = [
  0x0e, 0xa5, 0xc6, 0x2e, 0x01, 0x01, 0x01, 0x00, 0x00, 0x01, 0x06, 0x03, 0x20, 0x03, 0x40, 0x06, 0x60, 0x09, 0x80, 0x0c, 0x00, 0x19, 0xe0, 0x2e,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x01, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];
// 20:59:13 snapshot: dpiIndex 1, sensor 0, sleep 5, byte2=196 (matches live log)
const cfg196 = [
  0x0e, 0xa5, 0xc4, 0x2e, 0x01, 0x01, 0x01, 0x00, 0x00, 0x01, 0x06, 0x02, 0x20, 0x03, 0x40, 0x06, 0x60, 0x09, 0x80, 0x0c, 0x00, 0x19, 0xe0, 0x2e,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];
const keysLive = [
  0x08, 0xa5, 0xf0, 0x20, 0, 0, 0,
  0x20, 0x01, 0, 0, 0x20, 0x02, 0, 0, 0x20, 0x04, 0, 0,
  0x10, 0x01, 0x19, 0, 0x10, 0x01, 0x06, 0, 0x21, 0x55, 0, 0,
  0x21, 0x38, 0x01, 0, 0x21, 0x38, 0xff, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

// --- checksum ---
eq('checksum cfg198', verifyChecksum(cfg198).ok, true);
eq('checksum cfg196', verifyChecksum(cfg196).ok, true);
eq('checksum keys', verifyChecksum(keysLive).ok, true);
eq('checksum bad detected', verifyChecksum([14, 165, 99, 46, 1, 1, 1]).ok, false);

// --- parsers ---
const p198 = parseConfig(cfg198);
if ('error' in p198) throw new Error('parse failed');
eq('parse dpi_index', p198.dpiIndex, 2);
eq('parse dpi stages', p198.dpi, [800, 1600, 2400, 3200, 6400, 12000]);
eq('parse polling idx', p198.reportRateIndex, 0);
eq('parse sleep', p198.sleepLight, 5);
eq('parse sensor', p198.sensorFlag, 1);
eq('parse checksumOk', p198.checksumOk, true);
const p196 = parseConfig(cfg196);
if ('error' in p196) throw new Error('parse failed');
eq('parse dpi_index 196', p196.dpiIndex, 1);
eq('parse sensor 196', p196.sensorFlag, 0);

const pk = parseKeys(keysLive);
if ('error' in pk) throw new Error('keys parse failed');
eq('keys count', pk.keys.length, 6);
eq('key3 Ctrl+V', pk.keys[3].name, 'Keyboard: Ctrl+V');
eq('key4 Ctrl+C', pk.keys[4].name, 'Keyboard: Ctrl+C');
eq('key5 DPI', pk.keys[5].name, 'DPI button');
eq('extra slots', pk.extraSlots, [33, 56, 1, 0, 33, 56, 255, 0]);

eq('version parse', parseVersion([0x04, 0x7a, 0x2e, 0x32, 0x2e, 0x31, 0x2e, 0x33]), '2.1.3');
eq(
  'mouseinfo parse',
  parseMouseInfo([0x52, 0, 0, 0x1a, 0, 0, 0, 0x19, ...[...'20251225190600-F189-3311'].map((c) => c.charCodeAt(0))]),
  '20251225190600-F189-3311',
);
eq('polling 125', pollingHz(0, false), '125 Hz');
eq('polling 1000', pollingHz(3, false), '1000 Hz');
eq('polling wired 500', pollingHz(1, true), '500 Hz');
eq('clamp dpi low', clampDpi(10), 50);
eq('clamp dpi high', clampDpi(99999), 50000);
eq('keyName mouse', keyName(32, 2, 0, 0), 'Mouse: Right');
eq('keyName macro', keyName(112, 2, 0, 1), 'Macro #2 (type 1)');

// --- builders ---
const cfgForWrite: MouseConfig = { ...demoInitialConfig(), dpiIndex: 2, sleepLight: 10 };
const wb = buildSetConfig(cfgForWrite);
eq('buildSetConfig header', wb?.slice(0, 10), [240, 15, 174, 10, 47, 1, 1, 1, 0, 0]);
eq('buildSetConfig rate/count/index', wb?.slice(10, 13), [1, 6, 3]);
eq('buildSetConfig dpi1 LE', wb?.slice(13, 15), [0x20, 0x03]);
eq('buildSetConfig tail', wb?.slice(48, 55), [0, 0, 0, 0, 10, 0, 0]);
eq('buildSetConfig blocks fallback', buildSetConfig({ ...cfgForWrite, fallback: true }), null);
eq(
  'buildSetConfig blocks bad checksum',
  buildSetConfig({ ...cfgForWrite, checksumOk: false }),
  null,
);

const kb = buildSetKeys(demoInitialKeys());
eq('buildSetKeys header', kb.slice(0, 8), [240, 9, 165, 34, 44, 0, 0, 0]);
eq('buildSetKeys key3 Ctrl+V', kb.slice(20, 24), [16, 1, 25, 0]);
eq('buildSetKeys hardcoded DPI slot', kb.slice(28, 32), [33, 85, 0, 0]);
eq('buildSetKeys hardcoded extra', kb.slice(32, 40), [33, 56, 1, 0, 33, 56, 255, 0]);

// --- diff ---
eq('diff finds changed bytes', diffBytes(cfg198, cfg196).map((d) => d.byte), [2, 11, 49]);

// --- macro builder ---
const macroCmds = buildMacroCommands([
  {
    id: 'm1',
    name: 'Test',
    actions: [
      { kind: 'key', code: 6, action: 'keydown', delayMs: 0 },
      { kind: 'key', code: 6, action: 'keyup', delayMs: 0 },
      { kind: 'delay', delayMs: 50 },
      { kind: 'key', code: 25, action: 'keydown', delayMs: 0 },
      { kind: 'key', code: 25, action: 'keyup', delayMs: 0 },
    ],
  },
]);
eq('macro ends with commit', macroCmds[macroCmds.length - 1], [240, 16, 165, 34, 0, 0, 0, 5]);
eq('macro first chunk header', macroCmds[0].slice(0, 4), [240, 13, 0, macroCmds[0][3]]);
eq('macro chunk checksum ok', verifyChecksum([240, 165, macroCmds[0][3], ...macroCmds[0].slice(4)]).ok, true);

// --- keyName extensions (v2.0 popup: scroll + consumer keys) ---
eq('keyName scroll up', keyName(33, 56, 1, 0), 'Scroll wheel up');
eq('keyName scroll down', keyName(33, 56, 255, 0), 'Scroll wheel down');
eq('keyName volume up', keyName(48, 233, 0, 0), 'Media: Volume +');
eq('keyName mute', keyName(48, 226, 0, 0), 'Media: Mute');
eq('keyName play/pause', keyName(48, 205, 0, 0), 'Media: Play/Pause');
eq('keyName calculator', keyName(48, 146, 1, 0), 'Media: Calculator');
eq('keyName disable', keyName(16, 0, 0, 0), '(empty)');
eq('keyName ctrl+v', keyName(16, 1, 25, 0), 'Keyboard: Ctrl+V');
eq('keyName dpi', keyName(33, 85, 0, 0), 'DPI button');

// --- systemKey catalog (verbatim from original app, chunk 515 mod 5608) ---
eq('systemKey groups', SYSTEM_KEY_ACTIONS.map((g) => g.id), ['mouse', 'edit', 'media', 'system']);
const mouseGroup = SYSTEM_KEY_ACTIONS.find((g) => g.id === 'mouse');
eq('systemKey mouse scrollUp', mouseGroup?.actions.find((a) => a.id === 'scrollUp')?.binding, {
  type: 33,
  code1: 56,
  code2: 1,
  code3: 0,
});
eq('systemKey mouse dpi', mouseGroup?.actions.find((a) => a.id === 'dpi')?.binding, {
  type: 33,
  code1: 85,
  code2: 0,
  code3: 0,
});
const editGroup = SYSTEM_KEY_ACTIONS.find((g) => g.id === 'edit');
eq('systemKey edit copy', editGroup?.actions.find((a) => a.id === 'copy')?.binding, {
  type: 16,
  code1: 1,
  code2: 6,
  code3: 0,
});
eq('systemKey edit paste', editGroup?.actions.find((a) => a.id === 'paste')?.binding, {
  type: 16,
  code1: 1,
  code2: 25,
  code3: 0,
});

// --- battery history ---
eq('battery poll interval is 30s', BATTERY_POLL_MS, 30000);
const h0: BatteryHistoryEntry[] = [];
const h1 = appendBatteryHistory(h0, { time: '22:00:00', battery: 100, chargeFlag: 0, source: 'live' });
eq('battery history first append', h1.length, 1);
const h1b = appendBatteryHistory(h1, { time: '22:00:30', battery: 100, chargeFlag: 0, source: 'live' });
eq('battery history identical value not appended', h1b.length, 1);
const h2 = appendBatteryHistory(h1b, { time: '22:01:00', battery: 99, chargeFlag: 0, source: 'live' });
eq('battery history drop appended', h2.length, 2);
eq('battery history drop value', h2[1].battery, 99);
const h3 = appendBatteryHistory(h2, { time: '22:01:30', battery: 99, chargeFlag: 1, source: 'live' });
eq('battery history charge-flag change appended', h3.length, 3);
const hCap = appendBatteryHistory(
  [
    { time: '22:00:00', battery: 100, chargeFlag: 0, source: 'live' },
    { time: '22:00:30', battery: 99, chargeFlag: 0, source: 'live' },
    { time: '22:01:00', battery: 98, chargeFlag: 0, source: 'live' },
  ],
  { time: '22:01:30', battery: 97, chargeFlag: 0, source: 'live' },
  3,
);
eq('battery history capped at max', hCap.length, 3);
eq('battery history cap drops oldest', hCap[0].battery, 99);
eq('battery history cap keeps newest', hCap[2].battery, 97);

// --- demo backend round-trip ---
const demo = new DemoMouse();
const cfgReply = buildConfigReply(demoInitialConfig());
eq('demo config reply checksum', verifyChecksum(cfgReply).ok, true);
const keysReply = buildKeysReply(demoInitialKeys());
eq('demo keys reply checksum', verifyChecksum(keysReply).ok, true);

async function demoFlow(): Promise<void> {
  await demo.connect();
  const all = await demo.readAll();
  eq('demo version', all.version, '2.1.3');
  eq('demo battery', all.battery, 100);
  const rb = await demo.readBattery();
  eq('demo readBattery', rb, { battery: 100, chargeFlag: 0 });
  eq('demo dpiIndex', all.config.dpiIndex, 1);
  eq('demo key3', all.keys[3].name, 'Keyboard: Ctrl+V');
  const next: MouseConfig = { ...all.config, dpiIndex: 3, sleepLight: 17 };
  const w = await demo.writeConfig(next);
  eq('demo write matched', w.matched, true);
  const after = await demo.readConfigKeys();
  eq('demo write persisted dpiIndex', after.config.dpiIndex, 3);
  eq('demo write persisted sleep', after.config.sleepLight, 17);
  demo.simulateDpiPush();
  const afterPush = await demo.readConfigKeys();
  eq('demo DPI push cycles index', afterPush.config.dpiIndex, 4);
  const wk = await demo.writeKeys(demoInitialKeys());
  eq('demo writeKeys matched', wk.matched, true);
  await demo.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

demoFlow().catch((e) => {
  console.error('FAIL demoFlow', e);
  process.exit(1);
});

/**
 * Updater logic tests — run with: npx tsx tests/updater.test.ts
 * Pure functions from src/lib/updater.ts (no network): version parsing,
 * semver compare, release-payload evaluation. The live fetch path is
 * exercised by the app itself against the real GitHub API.
 */
import {
  compareVersions,
  evaluateRelease,
  formatReleaseTime,
  formatReleaseTimeWithWeekday,
  parseReleaseVersion,
  setupFileName,
} from '../src/lib/updater';

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  if (ok) pass++;
  else fail++;
}

eq('parse v3.0.2-rust -> 3.0.2', parseReleaseVersion('v3.0.2-rust'), '3.0.2');
eq('parse v3.0.1-rust -> 3.0.1', parseReleaseVersion('v3.0.1-rust'), '3.0.1');
eq('parse 3.1.0 -> 3.1.0', parseReleaseVersion('3.1.0'), '3.1.0');

eq('compare 3.0.2 > 3.0.1', compareVersions('3.0.2', '3.0.1') > 0, true);
eq('compare 3.0.1 = 3.0.1', compareVersions('3.0.1', '3.0.1'), 0);
eq('compare 3.0.1 < 3.0.2', compareVersions('3.0.1', '3.0.2') < 0, true);
eq('compare 3.10.0 > 3.9.9', compareVersions('3.10.0', '3.9.9') > 0, true);

const payload = {
  tag_name: 'v3.0.2-rust',
  published_at: '2026-11-09T16:31:39Z',
  body: '## Fixes\n- no console window\n',
  html_url: 'https://github.com/duyzoz/Smail-Wolf-M3-Pro/releases/tag/v3.0.2-rust',
  assets: [
    { name: 'SMAILWOLF-M3-Pro-Driver_3.0.2_x64-setup.exe', browser_download_url: 'https://github.com/duyzoz/Smail-Wolf-M3-Pro/releases/download/v3.0.2-rust/SMAILWOLF-M3-Pro-Driver_3.0.2_x64-setup.exe' },
    { name: 'SMAILWOLF-M3-Pro-Driver_3.0.2_x64.zip', browser_download_url: 'https://example.invalid/portable.zip' },
    { name: 'SHA256SUMS.txt', browser_download_url: 'https://example.invalid/sums.txt' },
  ],
};
const newer = evaluateRelease(payload, '3.0.1');
eq('newer release available', newer?.available, true);
eq('newer latestVersion', newer?.latestVersion, '3.0.2');
eq('newer setupUrl is the -setup.exe asset', newer?.setupUrl, 'https://github.com/duyzoz/Smail-Wolf-M3-Pro/releases/download/v3.0.2-rust/SMAILWOLF-M3-Pro-Driver_3.0.2_x64-setup.exe');
eq('newer notes kept', newer?.notes, '## Fixes\n- no console window\n');

const same = evaluateRelease(payload, '3.0.2');
eq('same version not available', same?.available, false);

const older = evaluateRelease(payload, '3.0.3');
eq('older release not available', older?.available, false);

eq('no tag -> null', evaluateRelease({}, '3.0.1'), null);
eq('no setup asset -> setupUrl null', evaluateRelease({ tag_name: 'v3.0.3-rust', assets: [] }, '3.0.2')?.setupUrl, null);

const t = formatReleaseTime('2026-11-08T16:31:39Z');
eq('formatReleaseTime shows date + time', t.includes('08/11/2026') && t.includes('23:31'), true);

const tw1 = formatReleaseTimeWithWeekday('2026-11-09T01:52:12Z');
eq('formatReleaseTimeWithWeekday shows Monday', tw1.includes('Thứ Hai') && tw1.includes('09/11/2026'), true);
const tw2 = formatReleaseTimeWithWeekday('2026-11-08T16:31:39Z');
eq('formatReleaseTimeWithWeekday shows Sunday', tw2.includes('Chủ Nhật') && tw2.includes('08/11/2026'), true);

// v3.0.6 — setup file name for the Rust install_update command.
const infoBase = {
  available: true,
  currentVersion: '3.0.5',
  latestVersion: '3.0.6',
  latestTag: 'v3.0.6-rust',
  publishedAt: '2026-11-09T02:45:00Z',
  notes: '',
  releaseUrl: 'https://github.com/duyzoz/Smail-Wolf-M3-Pro/releases/tag/v3.0.6-rust',
} as const;
eq(
  'setupFileName takes basename from setupUrl',
  setupFileName({
    ...infoBase,
    setupUrl: 'https://github.com/duyzoz/Smail-Wolf-M3-Pro/releases/download/v3.0.6-rust/SMAILWOLF-M3-Pro-Driver_3.0.6_x64-setup.exe',
  }),
  'SMAILWOLF-M3-Pro-Driver_3.0.6_x64-setup.exe',
);
eq(
  'setupFileName falls back when setupUrl is null',
  setupFileName({ ...infoBase, setupUrl: null }),
  'SMAILWOLF-M3-Pro-Driver_3.0.6_x64-setup.exe',
);
eq(
  'setupFileName falls back when URL has no .exe basename',
  setupFileName({ ...infoBase, setupUrl: 'https://example.invalid/releases/tag/v3.0.6-rust' }),
  'SMAILWOLF-M3-Pro-Driver_3.0.6_x64-setup.exe',
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

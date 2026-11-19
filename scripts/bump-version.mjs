#!/usr/bin/env node
/**
 * bump-version.mjs — bump the driver version in every place that carries it.
 * (W2: one command replaces the manual 5-file bump that bit us in v3.0.2.)
 *
 * Places bumped (all must agree, or the script refuses to run):
 *   1. package.json                          "version"
 *   2. package-lock.json                     "version" + packages[""].version
 *   3. src-tauri/tauri.conf.json            "version"
 *   4. src-tauri/Cargo.toml                 [package] version
 *   5. src-tauri/Cargo.lock                 [[package]] name="smailwolf-m3-pro-driver" version
 *   6. src/lib/updater.ts                   FALLBACK_APP_VERSION
 *
 * Usage:
 *   node scripts/bump-version.mjs 3.0.7            bump to 3.0.7
 *   node scripts/bump-version.mjs 3.0.7 --dry-run  show what would change, change nothing
 *   node scripts/bump-version.mjs --check          verify all 6 places agree (exit 1 if not)
 *
 * The script asserts the current version is identical in all 6 places
 * before touching anything, and verifies the new version afterwards.
 * It never edits anything else in these files. package.json and
 * package-lock.json are re-serialized with 2-space indent (their native
 * format); tauri.conf.json is edited by targeted string replacement
 * because it is stored MINIFIED on one line — re-serializing it would
 * turn a 1-line version change into a 71-line reformat. Cargo files are
 * edited line-wise.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^\d+\.\d+\.\d+$/;

const FILES = {
  packageJson: 'package.json',
  packageLock: 'package-lock.json',
  tauriConf: join('src-tauri', 'tauri.conf.json'),
  cargoToml: join('src-tauri', 'Cargo.toml'),
  cargoLock: join('src-tauri', 'Cargo.lock'),
  updater: join('src', 'lib', 'updater.ts'),
};

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8');
}
function readJson(rel) {
  return JSON.parse(read(rel));
}
function writeJson(rel, obj) {
  writeFileSync(join(ROOT, rel), JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function currentVersions() {
  const pkg = readJson(FILES.packageJson);
  const lock = readJson(FILES.packageLock);
  const conf = readJson(FILES.tauriConf);
  const updaterSrc = read(FILES.updater);
  const fallback = updaterSrc.match(/FALLBACK_APP_VERSION\s*=\s*'([^']+)'/);
  if (!fallback) throw new Error('updater.ts: FALLBACK_APP_VERSION not found');

  const cargoToml = read(FILES.cargoToml);
  const tomlVer = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
  if (!tomlVer) throw new Error('Cargo.toml: [package] version not found');

  const cargoLock = read(FILES.cargoLock);
  const lockVer = cargoLock.match(
    /\[\[package\]\]\nname = "smailwolf-m3-pro-driver"\nversion = "([^"]+)"/,
  );
  if (!lockVer) throw new Error('Cargo.lock: smailwolf-m3-pro-driver version not found');

  return {
    'package.json': pkg.version,
    'package-lock.json (root)': lock.version,
    'package-lock.json (packages[""])': lock.packages?.['']?.version,
    'tauri.conf.json': conf.version,
    'Cargo.toml': tomlVer[1],
    'Cargo.lock': lockVer[1],
    'updater.ts FALLBACK_APP_VERSION': fallback[1],
  };
}

function bump(newVersion) {
  if (!SEMVER.test(newVersion)) throw new Error(`not a semver version: ${newVersion}`);
  const before = currentVersions();
  const uniq = [...new Set(Object.values(before))];
  if (uniq.length !== 1) {
    throw new Error(
      `versions disagree, refusing to bump:\n${Object.entries(before)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n')}`,
    );
  }
  const oldVersion = uniq[0];
  if (oldVersion === newVersion) throw new Error(`already at ${newVersion}`);

  const pkg = readJson(FILES.packageJson);
  pkg.version = newVersion;
  writeJson(FILES.packageJson, pkg);

  const lock = readJson(FILES.packageLock);
  lock.version = newVersion;
  if (lock.packages?.['']) lock.packages[''].version = newVersion;
  writeJson(FILES.packageLock, lock);

  // tauri.conf.json is stored MINIFIED (one line): targeted replace only,
  // never re-serialize, or the diff becomes a 71-line reformat.
  const confRaw = read(FILES.tauriConf);
  const confCount = (confRaw.match(/"version"\s*:/g) || []).length;
  if (confCount !== 1) throw new Error(`tauri.conf.json: expected 1 "version" key, found ${confCount}`);
  const confNew = confRaw.replace(
    /("version"\s*:\s*")[^"]+(")/,
    `$1${newVersion}$2`,
  );
  writeFileSync(join(ROOT, FILES.tauriConf), confNew, 'utf8');

  const toml = read(FILES.cargoToml).replace(
    /^version\s*=\s*"[^"]+"/m,
    `version = "${newVersion}"`,
  );
  writeFileSync(join(ROOT, FILES.cargoToml), toml, 'utf8');

  const cargoLock = read(FILES.cargoLock).replace(
    /(\[\[package\]\]\nname = "smailwolf-m3-pro-driver"\nversion = ")[^"]+(")/,
    `$1${newVersion}$2`,
  );
  writeFileSync(join(ROOT, FILES.cargoLock), cargoLock, 'utf8');

  const updater = read(FILES.updater).replace(
    /(FALLBACK_APP_VERSION\s*=\s*')[^']+(')/,
    `$1${newVersion}$2`,
  );
  writeFileSync(join(ROOT, FILES.updater), updater, 'utf8');

  const after = currentVersions();
  const uniqAfter = [...new Set(Object.values(after))];
  if (uniqAfter.length !== 1 || uniqAfter[0] !== newVersion) {
    throw new Error(
      `verification failed after bump:\n${Object.entries(after)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n')}`,
    );
  }
  console.log(`bumped ${oldVersion} -> ${newVersion} (6 places agree)`);
}

// --- CLI ---
const args = process.argv.slice(2);
if (args.includes('--check')) {
  const vers = currentVersions();
  const uniq = [...new Set(Object.values(vers))];
  for (const [k, v] of Object.entries(vers)) console.log(`${k}: ${v}`);
  if (uniq.length !== 1) {
    console.error('MISMATCH: versions disagree');
    process.exit(1);
  }
  console.log(`OK: all agree on ${uniq[0]}`);
  process.exit(0);
}
const target = args.find((a) => !a.startsWith('-'));
if (!target) {
  console.error('usage: node scripts/bump-version.mjs <new-version> [--dry-run] | --check');
  process.exit(2);
}
if (args.includes('--dry-run')) {
  const vers = currentVersions();
  for (const [k, v] of Object.entries(vers)) console.log(`${k}: ${v} -> ${target}`);
  process.exit(0);
}
bump(target);

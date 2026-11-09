/**
 * App update checker — src/lib/updater.ts (v3.0.4)
 *
 * Checks THIS repo's latest release (duyzoz/Smail-Wolf-M3-Pro), NOT the
 * original vendor app — the old FirmwareCard pointed at the original app
 * and said "don't update here". Now the app checks its own repo:
 * GET https://api.github.com/repos/duyzoz/Smail-Wolf-M3-Pro/releases/latest
 * and compares the tag with the running app version (getVersion()).
 *
 * v3.0.4 ROOT CAUSE — the check NEVER worked in the built app: the fetch
 * to api.github.com was blocked by the Tauri CSP (connect-src had no
 * api.github.com), so every check failed silently and no update popup
 * ever appeared. tauri.conf.json connect-src MUST include
 * https://api.github.com (the sandbox dev server does NOT enforce the
 * Tauri CSP, so this only shows up in the real build — never trust a
 * dev-server fetch as proof the built app can reach an API).
 *
 * Silent on failure (offline, timeout, rate-limit): returns null, the UI
 * shows a quiet "couldn't check" line — never an error toast, never a
 * fake error. The check result is cached per session; refreshAppUpdate()
 * forces a fresh check (retry button).
 */
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';

export const APP_REPO = 'duyzoz/Smail-Wolf-M3-Pro';
const LATEST_RELEASE_API = `https://api.github.com/repos/${APP_REPO}/releases/latest`;
/** Fallback when getVersion() is unavailable (plain browser / dev). Bump with releases. */
export const FALLBACK_APP_VERSION = '3.0.4';

export interface AppUpdateInfo {
  available: boolean;
  currentVersion: string;
  latestTag: string;
  latestVersion: string;
  /** ISO timestamp from the release (published_at). */
  publishedAt: string;
  /** Release body (what's new) as published. */
  notes: string;
  /** Direct download URL of the -setup.exe asset, if the release has one. */
  setupUrl: string | null;
  releaseUrl: string;
}

/** "v3.0.2-rust" -> "3.0.2". */
export function parseReleaseVersion(tag: string): string {
  return tag.replace(/^v/i, '').split('-')[0];
}

/** Numeric semver compare: <0 if a<b, 0 if equal, >0 if a>b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** "2026-11-08T16:31:39Z" -> "23:31 08/11/2026" (local timezone). */
export function formatReleaseTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** "2026-11-09T01:52:12Z" -> "Thứ Hai, 09/11/2026, 08:52" (local timezone).
 *  Dùng cho popup cập nhật: người dùng thấy rõ "thứ mấy" + giờ phát hành. */
export function formatReleaseTimeWithWeekday(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export async function currentAppVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return FALLBACK_APP_VERSION;
  }
}

/** Release tag của app đang chạy, VD "v3.0.4-rust" — hiện ở thẻ Firmware. */
export async function currentAppVersionTag(): Promise<string> {
  return `v${await currentAppVersion()}-rust`;
}

let cached: Promise<AppUpdateInfo | null> | null = null;

export function checkAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!cached) cached = doCheck();
  return cached;
}

/** Force a fresh check (retry button). */
export function refreshAppUpdate(): Promise<AppUpdateInfo | null> {
  cached = doCheck();
  return cached;
}

export interface ReleasePayload {
  tag_name?: string;
  published_at?: string;
  body?: string;
  html_url?: string;
  assets?: Array<{ name: string; browser_download_url: string }>;
}

/** Pure: turn a GitHub release payload + current version into AppUpdateInfo (null if no usable tag). */
export function evaluateRelease(data: ReleasePayload, current: string): AppUpdateInfo | null {
  const tag = data.tag_name ?? '';
  if (!tag) return null;
  const latestVersion = parseReleaseVersion(tag);
  const setup = data.assets?.find((a) => a.name.endsWith('-setup.exe')) ?? null;
  return {
    available: compareVersions(latestVersion, current) > 0,
    currentVersion: current,
    latestTag: tag,
    latestVersion,
    publishedAt: data.published_at ?? '',
    notes: data.body ?? '',
    setupUrl: setup?.browser_download_url ?? null,
    releaseUrl: data.html_url ?? `https://github.com/${APP_REPO}/releases/tag/${tag}`,
  };
}

async function doCheck(): Promise<AppUpdateInfo | null> {
  const current = await currentAppVersion();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ReleasePayload;
    return evaluateRelease(data, current);
  } catch {
    return null; // offline / timeout / blocked — silent, no fake error
  } finally {
    clearTimeout(timer);
  }
}

/** Open the setup installer download (falls back to the release page). */
export async function openUpdateSetup(info: AppUpdateInfo): Promise<void> {
  const url = info.setupUrl ?? info.releaseUrl;
  try {
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/** Open the release page in the system browser. */
export async function openReleasePage(info: AppUpdateInfo): Promise<void> {
  try {
    await openUrl(info.releaseUrl);
  } catch {
    window.open(info.releaseUrl, '_blank', 'noopener,noreferrer');
  }
}

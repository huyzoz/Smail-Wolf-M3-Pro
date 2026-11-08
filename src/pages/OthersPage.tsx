/**
 * Khác v2.5 — firmware, khôi phục mặc định, profile (lưu/áp dụng), xuất/nhập
 * JSON, raw reply (kèm checksum). Gọn chữ theo yêu cầu bro (phần Khác nhiều
 * chữ quá, lướt sâu): rút ngắn các đoạn giải thích, bỏ nút "Kiểm tra cập
 * nhật" bị vô hiệu (không làm gì), bỏ dòng JSON dài trong popup khôi phục
 * (3 dòng mono ở thẻ đã liệt kê đủ).
 *
 * Bố cục: 4 thẻ tách riêng (FirmwareCard / RestoreCard / ProfileCard /
 * RawReplyCard) để tab Khác xếp 2 cột cân nhau (trái: Thiết bị & pin +
 * Profile; phải: Firmware + Khôi phục + Raw) — không còn chồng 1 cột
 * dài 1294px, lướt còn ~0.4 màn ở 1366x768.
 */
import { useEffect, useRef, useState } from 'react';
import { Download, RotateCcw, Save, Upload } from 'lucide-react';
import { hexDump, verifyChecksum } from '../lib/hid';
import { useMouse } from '../store';
import { autostartGet, autostartSet, isTauri } from '../lib/tauri';
import {
  checkAppUpdate,
  refreshAppUpdate,
  openUpdateSetup,
  openReleasePage,
  formatReleaseTime,
  type AppUpdateInfo,
} from '../lib/updater';
import { CardTitle, ConfirmModal, EmptyState, FieldLabel, GlassButton, GlassCard, Toggle } from '../components/ui';

/** v3.1 — Pin (mô phỏng) + khởi động cùng Windows. Đặt ở tab Khác. */
export function BatteryCard(): React.JSX.Element {
  const { connected, busy, simSaver, setBatterySaver } = useMouse();
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
      <CardTitle>Pin &amp; khởi động</CardTitle>
      <div className="space-y-3">
        <Toggle
          checked={simSaver}
          disabled={!connected || busy}
          onChange={(v) => void setBatterySaver(v)}
          label="Tiết kiệm pin"
        />
        <p className="text-xs leading-relaxed text-[#a2a2b0]">
          Bật: khóa polling 125 Hz + DPI 1600 (ghi xuống chuột qua setConfig), thanh pin chuyển vàng. Tắt: khôi
          phục polling + DPI cũ. % pin là ước tính — xem mục Pin ở thẻ Thiết bị &amp; pin.
        </p>
        <div className="border-t border-white/10 pt-3">
          <Toggle
            checked={autostart ?? false}
            disabled={webMode || autostart === null}
            onChange={(v) => {
              setAutostart(v);
              void autostartSet(v);
            }}
            label="Mở app khi khởi động Windows"
          />
          <p className="mt-2 text-xs leading-relaxed text-[#a2a2b0]">
            {webMode
              ? 'Chỉ có tác dụng trong app Windows (Tauri) — đang chạy ở trình duyệt nên không đổi được.'
              : autostart === null
                ? 'Đang đọc trạng thái…'
                : autostart
                  ? 'Đang bật — app tự mở khi Windows khởi động.'
                  : 'Đang tắt.'}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

export function FirmwareCard(): React.JSX.Element {
  const { version, mouseName, wired, mode, connected } = useMouse();
  // v3.0.2 — kiểm tra bản cập nhật của CHÍNH app này từ repo GitHub
  // (duyzoz/Smail-Wolf-M3-Pro), không còn trỏ app gốc. undefined = đang
  // kiểm tra, null = không kiểm tra được (mất mạng — im lặng, không báo lỗi).
  const [update, setUpdate] = useState<AppUpdateInfo | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void checkAppUpdate().then((info) => {
      if (alive) setUpdate(info);
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="uiv-blueglass">
      <div className="uiv-blueglass-top">
        <div className="font-mono2 text-[11px] font-semibold tracking-[0.18em] text-white/80 uppercase">
          Firmware · PAW3311
        </div>
        <div className="title font-display">v{version || '—'}</div>
      </div>
      <p className="desc">
        Bản mới nhất app gốc báo: V3.1.2 · Tên chuột {mouseName || '—'} ·{' '}
        {!connected ? 'Chưa kết nối' : mode === 'demo' ? 'Mô phỏng · Demo' : wired ? 'Có dây (USB) · Live' : '2.4G (dongle) · Live'}
      </p>
      <div className="px-4 pb-4">
        <div className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-[13px] leading-relaxed text-amber-100">
          Protocol đo trên 2.1.3 — lên V3.1.2 có thể đổi protocol. Muốn cập nhật firmware chuột thì dùng app gốc, cắm dây.
        </div>
        {/* Cập nhật ỨNG DỤNG (driver này) — lấy từ release mới nhất của repo */}
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[13px] font-semibold text-white/90">Cập nhật ứng dụng</div>
          {update === undefined ? (
            <p className="mt-1 text-[13px] leading-relaxed text-white/60">Đang kiểm tra bản cập nhật…</p>
          ) : update === null ? (
            <p className="mt-1 text-[13px] leading-relaxed text-white/60">
              Không kiểm tra được cập nhật (mất mạng?).{' '}
              <button
                type="button"
                className="font-semibold text-white underline underline-offset-2"
                onClick={() => {
                  setUpdate(undefined);
                  void refreshAppUpdate().then((info) => setUpdate(info));
                }}
              >
                Thử lại
              </button>
            </p>
          ) : update.available ? (
            <div className="mt-2 space-y-2">
              <p className="text-[13px] leading-relaxed text-orange-200">
                Đã có bản cập nhật mới <span className="font-bold">v{update.latestVersion}</span>
                {' '}· phát hành {formatReleaseTime(update.publishedAt)}
              </p>
              {update.notes.trim() !== '' && (
                <details className="text-[13px] leading-relaxed text-white/70">
                  <summary className="cursor-pointer font-semibold text-white/85">Có gì mới</summary>
                  <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-line pr-1">{update.notes.trim()}</p>
                </details>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <GlassButton variant="primary" onClick={() => void openUpdateSetup(update)}>
                  <Download className="h-4 w-4" /> Tải bản cài đặt
                </GlassButton>
                <GlassButton variant="ghost" onClick={() => void openReleasePage(update)}>
                  Xem trên GitHub
                </GlassButton>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-[13px] leading-relaxed text-emerald-200">
              Đang dùng bản mới nhất v{update.currentVersion}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function RestoreCard(): React.JSX.Element {
  const { config, mode, restoreFactory, busy } = useMouse();
  const [confirmRestore, setConfirmRestore] = useState(false);
  return (
    <>
      <GlassCard>
        <CardTitle>Khôi phục mặc định</CardTitle>
        <p className="text-sm leading-relaxed text-[#a2a2b0]">
          Ghi cấu hình + phím mặc định của app gốc.
        </p>
        <div className="mt-3 space-y-1 font-mono text-[13px] text-[#c9c9d6]">
          <div>DPI: 800 / 1600 / 2400 / 3200 / 6400 / 12000 · nấc 2 (1600)</div>
          <div>Polling index 3 · Ngủ 10 phút · Lăn thường · Line correction OFF</div>
          <div>Phím: Trái / Phải / Giữa / Lùi / Tiến / DPI</div>
        </div>
        <div className="mt-4">
          <GlassButton variant="danger" onClick={() => setConfirmRestore(true)} disabled={!config || busy}>
            <RotateCcw className="h-4 w-4" /> Khôi phục mặc định
          </GlassButton>
        </div>
      </GlassCard>

      <ConfirmModal
        open={confirmRestore}
        title="Khôi phục mặc định gốc?"
        confirmLabel="Khôi phục"
        danger
        onConfirm={() => {
          setConfirmRestore(false);
          void restoreFactory();
        }}
        onCancel={() => setConfirmRestore(false)}
      >
        Sẽ ghi cấu hình mặc định (DPI 800–12000, nấc 2, polling index 3, ngủ 10 phút) + phím mặc định{' '}
        {mode === 'demo' ? '(mô phỏng).' : 'xuống chuột.'}
        Mọi chỉnh sửa hiện tại sẽ mất — muốn giữ lại thì lưu thành profile trước.
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
    addLog('Đã xuất profile ra file JSON.');
  };

  const importProfile = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as { config?: unknown; keys?: unknown };
        if (!data.config || !data.keys) throw new Error('File thiếu config/keys');
        addLog('Đã đọc file profile — bấm Lưu profile để giữ lại, hoặc áp dụng trực tiếp từ danh sách.');
        void applyProfile({
          name: file.name.replace(/\.json$/i, ''),
          savedAt: new Date().toLocaleString('vi-VN'),
          config: data.config as never,
          keys: data.keys as never,
        });
      } catch (e) {
        addLog(`Nhập file lỗi: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <GlassCard>
      <CardTitle>Profile (lưu trên máy)</CardTitle>
      <div className="flex gap-2">
        <input
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          placeholder="Tên profile, VD: Chơi game"
          aria-label="Tên profile"
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
          <Save className="h-4 w-4" /> Lưu
        </GlassButton>
      </div>
      {profiles.length === 0 ? (
        <div className="mt-3"><EmptyState text="Chưa lưu profile nào." /></div>
      ) : (
        <div className="mt-3 space-y-2">
          {profiles.map((p) => (
            <div key={p.name} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{p.name}</div>
                <div className="text-[11px] text-[#a2a2b0]">Lưu lúc {p.savedAt}</div>
              </div>
              <GlassButton variant="ghost" onClick={() => void applyProfile(p)} disabled={busy}>
                Áp dụng
              </GlassButton>
              <button
                onClick={() => deleteProfile(p.name)}
                aria-label={`Xóa profile ${p.name}`}
                className="px-2 text-xs text-red-300 hover:text-red-200"
              >
                Xóa
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <GlassButton variant="ghost" onClick={exportProfile} disabled={!config}>
          <Download className="h-4 w-4" /> Xuất JSON
        </GlassButton>
        <GlassButton variant="ghost" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Nhập JSON
        </GlassButton>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Chọn file profile JSON"
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
  // v2.5: raw reply là debug, thu gọn mặc định — đây là khối dài nhất
  // của tab Khác (2 hex dump 64 byte), mở ra chỉ khi bro cần xem.
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
          <span className="text-base font-bold text-white">Raw reply gần nhất</span>
          {cfgCs ? (
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${cfgCs.ok ? 'bg-emerald-400/15 text-emerald-200' : 'bg-red-400/15 text-red-200'}`}>
              Checksum {cfgCs.ok ? `OK (${configRaw[2]})` : `SAI (reply ${configRaw[2]}, tính ${cfgCs.expected})`}
            </span>
          ) : undefined}
        </span>
        <span aria-hidden className="text-lg text-[#a2a2b0]">{rawOpen ? '▾' : '▸'}</span>
      </button>
      {rawOpen ? (
        <>
          <FieldLabel>Config reply ([240, 14, …], 64 byte)</FieldLabel>
          <pre className="max-h-[120px] overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-[#ffd2ae]">
            {configRaw.length ? hexDump(configRaw) : 'Chưa có dữ liệu.'}
          </pre>
          <div className="mt-3">
            <FieldLabel>Keys reply ([240, 8, …], 64 byte)</FieldLabel>
            <pre className="max-h-[120px] overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-[#ffd2ae]">
              {keysRaw.length ? hexDump(keysRaw) : 'Chưa có dữ liệu.'}
            </pre>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[#a2a2b0]">
            Checksum: byte [2] = tổng byte [3..63] mod 256.
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-[#a2a2b0]">Bấm để xem 2 hex dump 64 byte.</p>
      )}
    </GlassCard>
  );
}

// (Không còn default export: tab Khác xếp 4 thẻ trực tiếp ở LeftPanel.)

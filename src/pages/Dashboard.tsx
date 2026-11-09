/**
 * Dashboard v2.5 — gọn trong panel trái: pin + thiết bị, thao tác nhanh.
 * 4 stat card đã lên dock kính mờ phía trên, chart DPI đã thành chuột
 * bên phải, Activity Log đã xóa ở v2.4. v2.5: gọn chữ (bro bảo phần Khác
 * nhiều chữ quá, lướt sâu) — bỏ thẻ "Chưa kết nối" (màn chọn thiết bị
 * lo việc kết nối rồi, vào đây là đã kết nối), rút ngắn các đoạn giải
 * thích, nút ngắn lại.
 */
import { Play, RefreshCw } from 'lucide-react';
import { useMouse } from '../store';
import { CardTitle, Donut, GlassButton, GlassCard, PageHead } from '../components/ui';

export default function Dashboard({ bare = false }: { bare?: boolean }): React.JSX.Element {
  const {
    keys, version, mouseName, wired, mode,
    connected, busy, dpiListening, refresh, simulateDpiPush, listenDpiPush,
    simPctPrecise, simCharging, simSaver,
  } = useMouse();

  return (
    <div>
      {bare ? (
        <CardTitle>Thiết bị &amp; pin</CardTitle>
      ) : (
        <PageHead
          title="Thiết bị & pin"
          subtitle={
            mode === 'demo'
              ? 'Demo (mô phỏng) — dữ liệu mẫu.'
              : 'Pin mô phỏng theo polling rate — xem README mục "Pin (mô phỏng)".'
          }
        />
      )}

      <GlassCard>
        <CardTitle>Pin &amp; thiết bị</CardTitle>
        {/* v3.1: % pin là MÔ PHỎNG (ước tính) — firmware chỉ báo 100% thô
            tới lúc yếu, không có chip đo pin thật. Giá trị report 48
            KHÔNG hiện ra UI nữa. Đèn LED trên chuột vẫn là chỉ báo thật. */}
        <Donut
          value={simPctPrecise}
          size={92}
          accent={simSaver ? '#eab308' : '#ea580c'}
          label={simCharging ? 'Đang sạc (ước tính)' : simSaver ? 'Pin còn lại — Tiết kiệm pin (ước tính)' : 'Pin còn lại (ước tính)'}
        />
        <div className="mt-3 grid grid-cols-1 gap-y-1.5 border-t border-white/10 pt-3 text-[13px]">
          <div className="flex justify-between gap-2">
            <span className="shrink-0 text-[#a2a2b0]">Tên chuột</span>
            <span className="truncate font-mono text-xs text-[#edebe6]" title={mouseName || ''}>{mouseName || '—'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="shrink-0 text-[#a2a2b0]">Firmware</span>
            <span className="text-[#edebe6]">{version || '—'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="shrink-0 text-[#a2a2b0]">Kết nối</span>
            <span className="truncate text-[#edebe6]">
              {!connected ? '—' : mode === 'demo' ? 'Mô phỏng 2.4G' : wired ? 'Có dây (USB)' : '2.4G (dongle)'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="shrink-0 text-[#a2a2b0]">Phím đã gán</span>
            <span className="text-[#edebe6]">{keys ? `${keys.filter((k) => k.type !== 0).length}/6` : '—'}</span>
          </div>
        </div>
      </GlassCard>

      <div className="mt-3 flex flex-wrap gap-2">
        <GlassButton variant="ghost" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw className="h-4 w-4" /> Đọc lại
        </GlassButton>
        {mode === 'demo' ? (
          <GlassButton variant="ghost" onClick={simulateDpiPush} disabled={busy}>
            <Play className="h-4 w-4" /> Mô phỏng bấm DPI
          </GlassButton>
        ) : (
          <GlassButton variant="ghost" onClick={listenDpiPush} disabled={busy || dpiListening}>
            {dpiListening ? 'Đang nghe nút DPI (30s)…' : 'Nghe nút DPI 30s'}
          </GlassButton>
        )}
      </div>
    </div>
  );
}

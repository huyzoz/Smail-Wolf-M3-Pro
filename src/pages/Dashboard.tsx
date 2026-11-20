/**
 * Dashboard v2.5 — compact in the left panel: battery + device, quick actions.
 * The 4 stat cards moved to the frosted dock above, the DPI chart became the mouse
 * on the right, Activity Log removed in v2.4. v2.5: shorter text (Ethan said the More tab had
 * too much text, too much scrolling) — removed the "Not connected" card (the device picker
 * handles connecting, so reaching here means connected), shortened explanations,
 * shorter buttons.
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
        <CardTitle>Device &amp; battery</CardTitle>
      ) : (
        <PageHead
          title="Device & battery"
          subtitle={
            mode === 'demo'
              ? 'Demo (simulated) — sample data.'
              : 'Simulated battery by polling rate — see the README section "Simulated battery".'
          }
        />
      )}

      <GlassCard>
        <CardTitle>Battery &amp; device</CardTitle>
        {/* v3.1: the battery % is SIMULATED (estimated) — the firmware only reports a raw 100%
            until the battery is low; there is no real battery-measuring chip. The report 48 value
            is NO LONGER shown in the UI. The LED on the mouse is still the real indicator. */}
        <Donut
          value={simPctPrecise}
          size={92}
          accent={simSaver ? '#eab308' : '#ea580c'}
          label={simCharging ? 'Charging (estimated)' : simSaver ? 'Battery left — Battery saver (estimated)' : 'Battery left (estimated)'}
        />
        <div className="mt-3 grid grid-cols-1 gap-y-1.5 border-t border-white/10 pt-3 text-[13px]">
          <div className="flex justify-between gap-2">
            <span className="shrink-0 text-[#a2a2b0]">Mouse name</span>
            <span className="truncate font-mono text-xs text-[#edebe6]" title={mouseName || ''}>{mouseName || '—'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="shrink-0 text-[#a2a2b0]">Firmware</span>
            <span className="text-[#edebe6]">{version || '—'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="shrink-0 text-[#a2a2b0]">Connection</span>
            <span className="truncate text-[#edebe6]">
              {!connected ? '—' : mode === 'demo' ? 'Simulated 2.4G' : wired ? 'Wired (USB)' : '2.4G (dongle)'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="shrink-0 text-[#a2a2b0]">Keys assigned</span>
            <span className="text-[#edebe6]">{keys ? `${keys.filter((k) => k.type !== 0).length}/6` : '—'}</span>
          </div>
        </div>
      </GlassCard>

      <div className="mt-3 flex flex-wrap gap-2">
        <GlassButton variant="ghost" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw className="h-4 w-4" /> Re-read
        </GlassButton>
        {mode === 'demo' ? (
          <GlassButton variant="ghost" onClick={simulateDpiPush} disabled={busy}>
            <Play className="h-4 w-4" /> Simulate DPI press
          </GlassButton>
        ) : (
          <GlassButton variant="ghost" onClick={listenDpiPush} disabled={busy || dpiListening}>
            {dpiListening ? 'Listening for the DPI button (30s)…' : 'Listen for DPI button (30s)'}
          </GlassButton>
        )}
      </div>
    </div>
  );
}

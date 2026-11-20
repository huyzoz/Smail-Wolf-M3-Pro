/**
 * Performance v2.4 — compact, little text, fits the frame without scrolling (per Ethan's request):
 * 4 compact rows, no more long explanations, no more "Byte 51
 * = ..." line — click/toggle/drag applies instantly (writes via setConfig, already proven
 * live), NO more Save / Undo buttons. A failed write (busy) restores
 * the old value. Sleep: dragging the slider writes 250ms after release (debounce).
 * Wake-up is just 1 line now (fixed mouse behavior, not a setting).
 */
import { useEffect, useRef, useState } from 'react';
import { Moon, MoveHorizontal, Zap } from 'lucide-react';
import { POLLING_24G, POLLING_WIRED, type MouseConfig } from '../lib/hid';
import { useMouse } from '../store';
import { EmptyState, GlassCard, PageHead, PowerSwitch, SegmentedControl, Slider, Toggle } from '../components/ui';

export default function PerformancePage(): React.JSX.Element {
  const { config, wired, busy, saveConfig } = useMouse();
  const [rateIdx, setRateIdx] = useState(0);
  const [sleep, setSleep] = useState(5);
  const [neverSleep, setNeverSleep] = useState(false);
  // v2.7: the minutes to RESTORE when Never sleep is turned off. BUG v2.6: the sync effect
  // below calls setSleep(config.sleepLight) — when Never sleep is on, the config
  // goes to 0, so sleep is overwritten with 0 and the old minutes are lost; turning Never sleep
  // off then writes sleepLight = sleep = 0 → the toggle jumps back on and can't be
  // turned off (exactly the bug Ethan reported). lastSleep ONLY updates when the value ≠ 0.
  const [lastSleep, setLastSleep] = useState(5);
  const [scroll, setScroll] = useState(0);
  const [lineCorrection, setLineCorrection] = useState(false);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (config) {
      setRateIdx(config.reportRateIndex);
      setSleep(config.sleepLight);
      setNeverSleep(config.sleepLight === 0);
      // v2.7: only remember the minutes when they are ≠ 0 — otherwise the restore value is lost.
      if (config.sleepLight !== 0) setLastSleep(config.sleepLight);
      setScroll(config.scrollFlag);
      setLineCorrection((config.sensorFlag & 1) === 1);
    }
  }, [config]);

  useEffect(
    () => () => {
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
    },
    [],
  );

  if (!config) {
    return (
      <div>
        <PageHead title="Performance" subtitle="Click to apply instantly — no Save button." compact />
        <EmptyState text="Not connected — pick Demo (simulated) or Connect a real mouse in the top bar." />
      </div>
    );
  }

  const list = wired ? POLLING_WIRED : POLLING_24G;

  /** Write one field immediately; on failure restore the old value (avoids UI ↔ mouse mismatch). */
  const apply = (patch: Partial<MouseConfig>, revert: () => void): void => {
    if (busy) {
      revert();
      return;
    }
    void saveConfig({ ...config, ...patch }).then((ok) => {
      if (!ok) revert();
    });
  };

  const setRate = (v: number): void => {
    const prev = rateIdx;
    setRateIdx(v);
    apply({ reportRateIndex: v }, () => setRateIdx(prev));
  };

  const setScrollDir = (v: number): void => {
    const prev = scroll;
    setScroll(v);
    apply({ scrollFlag: v }, () => setScroll(prev));
  };

  const setLine = (v: boolean): void => {
    const prev = lineCorrection;
    setLineCorrection(v);
    apply({ sensorFlag: v ? 1 : 0 }, () => setLineCorrection(prev));
  };

  const commitSleep = (never: boolean, mins: number): void => {
    apply({ sleepLight: never ? 0 : mins }, () => {
      setNeverSleep(config.sleepLight === 0);
      setSleep(config.sleepLight);
    });
  };

  const onSleepChange = (v: number): void => {
    const mins = Math.max(1, v);
    setSleep(mins);
    setLastSleep(mins);
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    sleepTimer.current = setTimeout(() => commitSleep(neverSleep, mins), 250);
  };

  const onNeverSleep = (v: boolean): void => {
    const prev = neverSleep;
    setNeverSleep(v);
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    // v2.7: turning off writes back lastSleep (the minutes before turning on), NOT
    // sleep (which became 0 when Never sleep was turned on).
    apply({ sleepLight: v ? 0 : lastSleep }, () => setNeverSleep(prev));
  };

  return (
    <div>
      <PageHead title="Performance" subtitle="Click to apply instantly — no Save button." compact />
      <div className="space-y-2">
        <GlassCard compact>
          <div className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-[#edebe6]">
            <Zap className="h-4 w-4 text-[#ff8a3d]" /> Polling rate
            <span className="ml-auto font-mono text-xs text-[#a2a2b0]">{wired ? 'Wired' : '2.4G'}</span>
          </div>
          <SegmentedControl
            name="polling-rate"
            value={rateIdx}
            onChange={setRate}
            columns={4}
            options={list.map((hz, i) => ({ value: i, label: `${hz} Hz` }))}
          />
        </GlassCard>

        <GlassCard compact>
          <div className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-[#edebe6]">
            <Moon className="h-4 w-4 text-[#ff8a3d]" /> Sleep
            <span className="ml-auto text-sm font-bold text-white">{neverSleep ? 'Never sleep' : `${sleep} min`}</span>
            <Toggle checked={neverSleep} label="Never sleep" onChange={onNeverSleep} compact />
          </div>
          <Slider
            value={neverSleep ? 0 : sleep}
            min={0}
            max={100}
            step={1}
            ariaLabel="Minutes before sleep"
            disabled={neverSleep}
            onChange={onSleepChange}
          />
        </GlassCard>

        <GlassCard compact>
          <div className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-[#edebe6]">
            <MoveHorizontal className="h-4 w-4 text-[#ff8a3d]" /> Scroll direction
          </div>
          <SegmentedControl
            name="roller-direction"
            value={scroll}
            onChange={setScrollDir}
            options={[
              { value: 0, label: 'Normal', tag: '正向' },
              { value: 1, label: 'Reversed', tag: '反向' },
            ]}
          />
        </GlassCard>

        <GlassCard compact>
          <PowerSwitch
            id="line-correction-power"
            checked={lineCorrection}
            label="Line correction"
            onChange={setLine}
          />
          <p className="mt-1 text-xs text-[#a2a2b0]">Wake-up: click or move the mouse (fixed, cannot be changed).</p>
        </GlassCard>
      </div>
    </div>
  );
}

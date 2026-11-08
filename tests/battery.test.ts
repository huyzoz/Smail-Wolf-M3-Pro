/**
 * Battery simulation tests — run with: npx tsx tests/battery.test.ts
 * Pure logic from src/lib/battery.ts. Exact numbers from the model:
 * usable 400 mAh; drain 125 Hz → 3 mA, 250 → 5, 500 → 8, 1000 → 14 mA;
 * charge assumption 150 mA (0.3C, full usable charge ~2.7 h).
 */
import {
  CHARGE_MA,
  chargeTick,
  defaultState,
  drainMaAt,
  indexForHz,
  loadWithElapsed,
  percentOf,
  percentOfPrecise,
  rateHz,
  runtimeHours,
  shouldNotifyLow,
  tick,
  USABLE_MAH,
  type BatteryState,
} from '../src/lib/battery';

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  if (ok) pass++;
  else fail++;
}
function approx(name: string, got: number, want: number, eps = 0.01): void {
  const ok = Math.abs(got - want) <= eps;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — got ${got} want ${want} (±${eps})`}`);
  if (ok) pass++;
  else fail++;
}

const now = 1_790_000_000;
function full(rate = 125): BatteryState {
  return { remaining_mah: 400, last_polling_rate: rate, updated_at: now, charging: false, low_notified: false, saver: false };
}

// --- model constants ---
eq('usable capacity 400 mAh', USABLE_MAH, 400);
eq('charge current 150 mA', CHARGE_MA, 150);
eq('drain 125 Hz = 3 mA', drainMaAt(125), 3);
eq('drain 250 Hz = 5 mA', drainMaAt(250), 5);
eq('drain 500 Hz = 8 mA', drainMaAt(500), 8);
eq('drain 1000 Hz = 14 mA', drainMaAt(1000), 14);

// --- runtime hours: 400 / current ---
approx('runtime 125 Hz = 133.33 h', runtimeHours(125), 400 / 3);
approx('runtime 250 Hz = 80 h', runtimeHours(250), 80);
approx('runtime 500 Hz = 50 h', runtimeHours(500), 50);
approx('runtime 1000 Hz = 28.57 h', runtimeHours(1000), 400 / 14);

// --- rate <-> index ladders (2.4G 125/250/500/1000, wired 125/500/1000) ---
eq('2.4G index 0 = 125 Hz', rateHz(0, false), 125);
eq('2.4G index 3 = 1000 Hz', rateHz(3, false), 1000);
eq('wired index 2 = 1000 Hz', rateHz(2, true), 1000);
eq('wired index 1 = 500 Hz', rateHz(1, true), 500);
eq('index for 125 Hz (2.4G)', indexForHz(125, false), 0);
eq('index for 1000 Hz (wired)', indexForHz(1000, true), 2);

// --- tick drain ---
approx('tick 1 s at 125 Hz drains 3/3600 mAh', full().remaining_mah - tick(full(), 1, 125).remaining_mah, 3 / 3600, 1e-9);
approx('tick 1 h at 1000 Hz drains 14 mAh', 400 - tick(full(1000), 3600, 1000).remaining_mah, 14);
approx('tick 1 h at 125 Hz drains 3 mAh', 400 - tick(full(), 3600, 125).remaining_mah, 3);
eq('tick advances updated_at by seconds', tick(full(), 60, 125).updated_at, now + 60);
eq('tick clamps at 0 (never negative)', tick({ ...full(), remaining_mah: 1 }, 3600, 1000).remaining_mah, 0);
eq('tick does not mutate input', (() => { const s = full(); tick(s, 60, 125); return s.remaining_mah; })(), 400);

// --- charging ---
approx('charge 1 h at 150 mA gains 150 mAh', chargeTick({ ...full(), remaining_mah: 100 }, 3600).remaining_mah, 250);
eq('charge caps at 400 mAh', chargeTick({ ...full(), remaining_mah: 390 }, 3600).remaining_mah, 400);
approx('charge 0→400 takes ~2.67 h', 400 / 150, 2.6667);

// --- loadWithElapsed: elapsed time while closed, NEVER reset to 100/0 ---
approx(
  'closed 3600 s at 500 Hz drains 8 mAh',
  loadWithElapsed({ ...full(500), remaining_mah: 320 }, now + 3600).remaining_mah,
  312,
);
eq(
  'saved 80% stays ~80% on load (no reset to 100)',
  percentOf(loadWithElapsed({ ...full(), remaining_mah: 320 }, now + 60)),
  80,
);
eq(
  'saved low % stays low on load (no reset to 0)',
  percentOf(loadWithElapsed({ ...full(), remaining_mah: 40 }, now + 60)),
  10,
);
approx(
  'closed while charging: kept charging at 150 mA',
  loadWithElapsed({ ...full(), remaining_mah: 200, charging: true }, now + 3600).remaining_mah,
  350,
);
eq(
  'closed while charging caps at 400',
  loadWithElapsed({ ...full(), remaining_mah: 390, charging: true }, now + 3600).remaining_mah,
  400,
);
eq('load with zero elapsed returns same value', loadWithElapsed({ ...full(), remaining_mah: 123 }, now).remaining_mah, 123);

// --- % derivation ---
eq('percent 400 mAh = 100%', percentOf(full()), 100);
eq('percent 200 mAh = 50%', percentOf({ ...full(), remaining_mah: 200 }), 50);
eq('percent null state = 100 (first run)', percentOf(null), 100);

// v3.0.2 — precise % (1 decimal): the drain is visible. 3 mA at 125 Hz =
// 0.000833 mAh/s, so 0.1% (0.4 mAh) takes ~8 min; integer % would sit at
// 100% for the first ~13 h.
eq('precise 400 mAh = 100', percentOfPrecise(full()), 100);
eq('precise 399.6 mAh = 99.9', percentOfPrecise({ ...full(), remaining_mah: 399.6 }), 99.9);
eq('precise 200 mAh = 50', percentOfPrecise({ ...full(), remaining_mah: 200 }), 50);
eq('precise 0 mAh = 0', percentOfPrecise({ ...full(), remaining_mah: 0 }), 0);
eq('precise null state = 100', percentOfPrecise(null), 100);
eq('precise 10 min at 125 Hz = 99.9 (0.5 mAh drained)', percentOfPrecise(tick(full(), 600, 125)), 99.9);
eq('default state is full, not empty', defaultState(now).remaining_mah, 400);

// --- low-battery trigger: fires once per discharge cycle ---
eq('crossing 21→20 fires', shouldNotifyLow(21, 20, full()), true);
eq('already notified does not re-fire', shouldNotifyLow(21, 20, { ...full(), low_notified: true }), false);
eq('no crossing (25→24) does not fire', shouldNotifyLow(25, 24, full()), false);
eq('rising 19→21 does not fire', shouldNotifyLow(19, 21, full()), false);
eq('staying below 20 does not re-fire without reset', shouldNotifyLow(20, 19, full()), false);

// --- full discharge-cycle walk: 84 mAh at 1000 Hz crosses 20% exactly once ---
{
  let s = { ...full(1000), remaining_mah: 84 }; // 21%
  let fired = 0;
  for (let i = 0; i < 3600; i++) {
    const prevPct = percentOf(s);
    s = tick(s, 1, 1000);
    if (shouldNotifyLow(prevPct, percentOf(s), s)) {
      fired++;
      s = { ...s, low_notified: true };
    }
  }
  eq('1 h walk at 1000 Hz from 21% fires exactly once', fired, 1);
  eq('after walk, low flag is set', s.low_notified, true);
}

console.log(`\nbattery: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

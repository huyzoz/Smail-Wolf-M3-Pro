/**
 * AssignPopup — per image 4: dark panel, 4 tabs System / Keyboard /
 * Instruction / Macro, a list of actions to assign to one mouse button.
 * After choosing: the popup FLIES into the left panel frame (W6: Web Animations
 * API, was framer-motion) and only then writes.
 * Actions come from the original app's systemKey catalog (chunk 515, module 5608).
 */
import { useEffect, useRef, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { CODE_TO_HID, keyName, KEY_LABELS, SYSTEM_KEY_ACTIONS, type KeyBinding } from '../lib/hid';
import { useMouse } from '../store';

type PopupTab = 'system' | 'keyboard' | 'instruction' | 'macro';

const TABS: { id: PopupTab; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'instruction', label: 'Instruction' },
  { id: 'macro', label: 'Macro' },
];

export function AssignPopup({
  keyIndex,
  anchor,
  stageSize,
  flyTarget,
  onClose,
  onAssign,
}: {
  keyIndex: number;
  anchor: { x: number; y: number };
  stageSize: { width: number; height: number };
  flyTarget: { x: number; y: number };
  onClose: () => void;
  onAssign: (binding: KeyBinding) => void;
}): React.JSX.Element {
  const { keys, macros } = useMouse();
  const [tab, setTab] = useState<PopupTab>('system');
  const [capturing, setCapturing] = useState(false);
  const [flying, setFlying] = useState<KeyBinding | null>(null);

  const W = 320;
  const H = 400;
  const left = Math.max(8, Math.min(anchor.x + 18, stageSize.width - W - 8));
  const top = Math.max(8, Math.min(anchor.y - 60, stageSize.height - H - 8));

  const current = keys?.[keyIndex];

  // Keyboard capture — same as KeysPage (1 keydown -> HID + modifier bitmask).
  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      const hid = CODE_TO_HID[e.code];
      if (hid === undefined) return;
      let mods = 0;
      if (e.ctrlKey) mods |= 1;
      if (e.shiftKey) mods |= 2;
      if (e.altKey) mods |= 4;
      if (e.metaKey) mods |= 8;
      setCapturing(false);
      pick({ type: 16, code1: mods, code2: hid, code3: 0 });
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing]);

  const pick = (b: KeyBinding): void => {
    if (flying) return;
    setFlying(b);
  };

  // W6: the fly — was framer-motion (spring 380/30 + onAnimationComplete →
  // onAssign). The popup flies toward the mouse button in the left panel and
  // only then writes — that timing is behaviour, not decoration, so the WAAPI
  // finish callback calls onAssign exactly once. Under reduced motion the
  // write happens immediately with no flight.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const flyDoneRef = useRef(false);
  useEffect(() => {
    if (!flying) return;
    const el = panelRef.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onAssign(flying);
      return;
    }
    const dx = flyTarget.x - (left + W / 2);
    const dy = flyTarget.y - (top + H / 2);
    flyDoneRef.current = false;
    const anim = el.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0 },
      ],
      { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      if (flyDoneRef.current) return;
      flyDoneRef.current = true;
      onAssign(flying);
    };
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flying]);

  const groupsFor = (tabId: PopupTab): typeof SYSTEM_KEY_ACTIONS => {
    if (tabId === 'system') return SYSTEM_KEY_ACTIONS.filter((g) => g.id === 'mouse' || g.id === 'edit');
    if (tabId === 'instruction') return SYSTEM_KEY_ACTIONS.filter((g) => g.id === 'media' || g.id === 'system');
    return [];
  };

  return (
    <div
      ref={panelRef}
      className="absolute z-30 w6-assign-in overflow-hidden rounded-2xl border border-white/15 bg-[#26262e] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
      style={{ left, top, width: W }}
      role="dialog"
      aria-label={`Assign key to ${KEY_LABELS[keyIndex]}`}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 pt-3 pb-2">
        <div>
          <div className="text-sm font-bold text-white">Key Binding — {KEY_LABELS[keyIndex]}</div>
          <div className="mt-0.5 font-mono text-[11px] text-[#a2a2b0]">
            Current: {current ? keyName(current.type, current.code1, current.code2, current.code3) : '—'}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close key-assignment popup"
          className="flex h-[36px] w-[36px] items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex border-b border-white/10 px-2" role="tablist" aria-label="Action type">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[44px] flex-1 text-[13px] font-semibold transition ${
              tab === t.id
                ? 'border-b-2 border-[#ff5a1f] text-[#ff8a3d]'
                : 'text-white/60 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-h-[290px] overflow-y-auto p-3">
        {tab === 'system' || tab === 'instruction' ? (
          <>
            <p className="mb-2 px-1 text-xs leading-relaxed text-[#a2a2b0]">
              Click an action to assign to this button — the popup will fly into the config panel on the left, then write to the mouse.
            </p>
            {groupsFor(tab).map((g) => (
              <div key={g.id} className="mb-3">
                <div className="font-mono2 px-1 pb-1 text-[11px] font-semibold tracking-[0.16em] text-[#a2a2b0] uppercase">
                  {g.title}
                </div>
                {g.actions.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => pick(a.binding)}
                    className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 text-left text-sm text-white transition hover:bg-white/10"
                  >
                    <span>{a.label}</span>
                    <span className="font-mono text-[11px] text-white/40">
                      {a.binding.type},{a.binding.code1},{a.binding.code2}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {tab === 'system' && (
              <div className="mb-1">
                <div className="font-mono2 px-1 pb-1 text-[11px] font-semibold tracking-[0.16em] text-[#a2a2b0] uppercase">
                  Other
                </div>
                <button
                  onClick={() => pick({ type: 33, code1: 85, code2: 0, code3: 0 })}
                  className="flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-sm text-white transition hover:bg-white/10"
                >
                  DPI Button
                </button>
                <button
                  onClick={() => pick({ type: 0, code1: 0, code2: 0, code3: 0 })}
                  className="flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-sm text-white transition hover:bg-white/10"
                >
                  Empty
                </button>
              </div>
            )}
          </>
        ) : tab === 'keyboard' ? (
          <div>
            <p className="mb-3 px-1 text-xs leading-relaxed text-[#a2a2b0]">
              Click the button below, then press a real key (with Ctrl/Shift/Alt if you want) to assign it.
            </p>
            <button
              onClick={() => setCapturing(true)}
              className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition ${
                capturing
                  ? 'animate-pulse border-[#ff5a1f] bg-[#ff5a1f]/20 text-[#ffd2ae]'
                  : 'border-white/15 bg-white/5 text-white hover:border-[#ff5a1f]/50'
              }`}
            >
              <Keyboard className="h-4 w-4" />
              {capturing ? 'Listening… press a key' : 'Press a key…'}
            </button>
          </div>
        ) : (
          <div>
            {macros.length === 0 ? (
              <p className="px-1 py-3 text-sm text-[#a2a2b0]">
                No macros yet — create one in the Macro tab first, then come back to assign it.
              </p>
            ) : (
              macros.map((m, mi) => (
                <button
                  key={m.id}
                  onClick={() => pick({ type: 112, code1: mi, code2: 0, code3: 1 })}
                  className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 text-left text-sm text-white transition hover:bg-white/10"
                >
                  <span>{m.name}</span>
                  <span className="font-mono text-[11px] text-white/40">Macro #{mi}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

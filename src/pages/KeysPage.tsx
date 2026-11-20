/**
 * Key Bindings — remap 6 buttons via setKeys (verbatim chunk 515).
 * The DPI button (index 5) is fixed and cannot be remapped — same in the original app.
 * Click "Press a key…" then press a key (with Ctrl/Shift/Alt) to assign it.
 */
import { useEffect, useRef, useState } from 'react';
import { Keyboard, MousePointerClick, RotateCcw, X, Zap } from 'lucide-react';
import { CODE_TO_HID, DEFAULT_KEYS, keyName, KEY_LABELS, type KeyBinding, type ParsedKey } from '../lib/hid';
import { useMouse } from '../store';
import { ConfirmModal, EmptyState, FieldLabel, GlassCard, PageHead, ShyArrow } from '../components/ui';

const MOUSE_OPTIONS: { code1: number; label: string }[] = [
  { code1: 1, label: 'Left click' },
  { code1: 2, label: 'Right click' },
  { code1: 4, label: 'Middle click' },
  { code1: 8, label: 'Backward' },
  { code1: 16, label: 'Forward' },
];

export default function KeysPage(): React.JSX.Element {
  const { keys, macros, busy, saveKeys, mode } = useMouse();
  const [draft, setDraft] = useState<KeyBinding[]>(DEFAULT_KEYS.map((k) => ({ ...k })));
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const captureRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (keys) {
      setDraft(keys.map((k) => ({ type: k.type, code1: k.code1, code2: k.code2, code3: k.code3 })));
      setDirty(false);
    }
  }, [keys]);

  // Key capture: 1 keydown -> map to HID usage + modifier bitmask.
  useEffect(() => {
    if (!capturing || editing === null) return;
    const handler = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      const hid = CODE_TO_HID[e.code];
      if (hid === undefined) return; // unmappable key: skip it, still listening
      let mods = 0;
      if (e.ctrlKey) mods |= 1;
      if (e.shiftKey) mods |= 2;
      if (e.altKey) mods |= 4;
      if (e.metaKey) mods |= 8;
      setDraft((prev) => {
        const next = [...prev];
        next[editing] = { type: 16, code1: mods, code2: hid, code3: 0 };
        return next;
      });
      setDirty(true);
      setCapturing(false);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [capturing, editing]);

  if (!keys) {
    return (
      <div>
        <PageHead title="Key Bindings" subtitle="Remap the mouse's 6 buttons." />
        <EmptyState text="Not connected — pick Demo (simulated) or Connect a real mouse in the top bar." />
      </div>
    );
  }

  const applyToDraft = (i: number, k: KeyBinding): void => {
    setDraft((prev) => {
      const next = [...prev];
      next[i] = { ...k };
      return next;
    });
    setDirty(true);
  };

  const save = (): void => {
    void saveKeys(draft);
  };

  const editKey: ParsedKey | null = editing !== null ? { ...draft[editing], index: editing, name: keyName(draft[editing].type, draft[editing].code1, draft[editing].code2, draft[editing].code3) } : null;

  return (
    <div>
      <PageHead title="Key Bindings" />
      {/* v2.6: 2 columns instead of 3 — narrow 3-column cards (~152px) made "Left Button"
          and the "Change binding" button wrap to 2 lines, skewing the whole grid. 2 columns
          (~240px) fit the title + button on 1 line. */}
      <div className="grid gap-3 md:grid-cols-2">
        {draft.map((k, i) => {
          const isDpi = i === 5;
          const name = keyName(k.type, k.code1, k.code2, k.code3);
          return (
            <GlassCard key={i} hover={!isDpi}>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff5a1f]/25 to-[#facc15]/10 text-[#ffb37a]">
                  {k.type === 16 ? <Keyboard className="h-5 w-5" /> : k.type === 112 ? <Zap className="h-5 w-5" /> : <MousePointerClick className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold whitespace-nowrap text-white">{KEY_LABELS[i]}</div>
                  <div className="truncate text-xs text-[#a2a2b0]" title={name}>
                    {name}
                  </div>
                  {/* v2.6: the mono "type N · a,b,c" line was REMOVED per Ethan's order
                      (extra text, only a dev would read it). */}
                </div>
              </div>
              <div className="mt-4">
                {isDpi ? (
                  <span className="inline-block rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] text-[#a2a2b0]">
                    Fixed — always the DPI button
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(i)}
                    className="uiv-shy-btn w-full justify-center whitespace-nowrap"
                  >
                    Change binding
                    <ShyArrow />
                  </button>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={!dirty || busy} className="uiv-shy-btn uiv-shy-selected whitespace-nowrap disabled:opacity-50">
          {mode === 'demo' ? 'Save (simulated)' : 'Save to mouse'}
          <ShyArrow />
        </button>
        <button type="button" onClick={() => setConfirmReset(true)} disabled={!dirty || busy} className="uiv-shy-btn whitespace-nowrap disabled:opacity-50">
          <RotateCcw className="h-4 w-4" /> Back to factory defaults
          <ShyArrow />
        </button>
      </div>
      {!dirty && <p className="mt-3 text-xs text-[#a2a2b0]">No changes yet. Click “Change binding” on a button to edit it.</p>}

      {/* Editor modal */}
      <ConfirmModal
        open={editing !== null}
        title={editing !== null ? `Change ${KEY_LABELS[editing]}` : ''}
        confirmLabel="Xong"
        onConfirm={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      >
        {editKey && editing !== null && (
          <div className="space-y-4">
            <div>
              <FieldLabel>Current</FieldLabel>
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-sm text-white">{editKey.name}</div>
            </div>
            <div>
              <FieldLabel>Mouse</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {MOUSE_OPTIONS.map((o) => (
                  <button
                    key={o.code1}
                    onClick={() => applyToDraft(editing, { type: 32, code1: o.code1, code2: 0, code3: 0 })}
                    className="uiv-shy-btn whitespace-nowrap"
                  >
                    {o.label}
                    <ShyArrow />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Keyboard — click the button, then press a real key</FieldLabel>
              <button
                ref={captureRef}
                onClick={() => setCapturing(true)}
                className={`min-h-[48px] w-full rounded-xl border px-4 text-sm font-semibold transition ${
                  capturing
                    ? 'animate-pulse border-[#ff5a1f] bg-[#ff5a1f]/20 text-[#ffd2ae]'
                    : 'border-white/15 bg-white/5 text-white hover:border-[#ff5a1f]/50'
                }`}
              >
                {capturing ? 'Listening… press a key (with Ctrl/Shift/Alt if you want)' : 'Press a key…'}
              </button>
            </div>
            <div>
              <FieldLabel>Macro</FieldLabel>
              {macros.length === 0 ? (
                <p className="text-xs text-[#a2a2b0]">No macros yet — create one in the Macro tab first, then come back to assign it.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {macros.map((m, mi) => (
                    <button
                      key={m.id}
                      onClick={() => applyToDraft(editing, { type: 112, code1: mi, code2: 0, code3: 1 })}
                      className="uiv-shy-btn whitespace-nowrap"
                    >
                      {m.name}
                      <ShyArrow />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <FieldLabel>Other</FieldLabel>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => applyToDraft(editing, { type: 33, code1: 85, code2: 0, code3: 0 })}
                  className="uiv-shy-btn whitespace-nowrap"
                >
                  DPI Button
                  <ShyArrow />
                </button>
                <button
                  onClick={() => applyToDraft(editing, { type: 0, code1: 0, code2: 0, code3: 0 })}
                  className="uiv-shy-btn whitespace-nowrap"
                >
                  <X className="h-3.5 w-3.5" /> Empty
                  <ShyArrow />
                </button>
              </div>
            </div>
          </div>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={confirmReset}
        title="Back to factory defaults?"
        confirmLabel="Restore"
        danger
        onConfirm={() => {
          setDraft(DEFAULT_KEYS.map((k) => ({ ...k })));
          setDirty(true);
          setConfirmReset(false);
        }}
        onCancel={() => setConfirmReset(false)}
      >
        Reset all 6 buttons to factory defaults (Left / Right / Middle / Back / Forward / DPI).{' '}
        {mode === 'demo' ? 'Then click “Save (simulated)”.' : 'Then click “Save to mouse” to write for real.'}
      </ConfirmModal>
    </div>
  );
}

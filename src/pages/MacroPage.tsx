/**
 * Macro v2.5 — compact, little text (per Ethan's request: the old version had so much text that
 * the buttons dropped to a second line, ugly UI):
 * - Compact list + 2 short buttons ("+ Create macro", "Write to mouse").
 * - Clicking "Create macro" / editing a macro → MODAL POPUP in the middle of the screen, blurring
 *   everything behind (backdrop-blur), the editor lives inside it. Closing the modal is done.
 * - v2.5: an open modal locks background scrolling (useScrollLock) — the popup stays fixed in
 *   place, the background behind must not scroll.
 * - Macros are only stored on this PC and written to the mouse — they cannot be read back.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MousePointerClick, Play, Plus, Save, Trash2, Zap } from 'lucide-react';
import { CODE_TO_HID, keyName, type MacroAction, type MacroDef } from '../lib/hid';
import { useMouse } from '../store';
import { ConfirmModal, EmptyState, FieldLabel, GlassButton, GlassCard, PageHead, useScrollLock } from '../components/ui';

function actionLabel(a: MacroAction): string {
  if (a.kind === 'key') return `${a.action === 'keydown' ? 'Press' : 'Release'} ${keyName(16, 0, a.code, 0).replace('Keyboard: ', '')}`;
  if (a.kind === 'mouse') return `${a.action === 'mousedown' ? 'Click' : 'Release'} mouse button ${a.button}`;
  return `Wait ${a.delayMs} ms`;
}

export default function MacroPage(): React.JSX.Element {
  const { macros, setMacros, writeMacros, busy, addLog, mode, connected } = useMouse();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<MacroAction[]>([]);
  const [recording, setRecording] = useState(false);
  const [delayMs, setDelayMs] = useState(50);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const startNew = (): void => {
    setEditingId(`m${Date.now()}`);
    setName(`Macro ${macros.length + 1}`);
    setSteps([]);
  };

  const openEdit = (m: MacroDef): void => {
    setEditingId(m.id);
    setName(m.name);
    setSteps([...m.actions]);
  };

  const closeEditor = (): void => {
    setEditingId(null);
    setRecording(false);
  };

  // v2.5: an open modal locks background scrolling — the popup stays fixed in place.
  useScrollLock(editingId !== null);

  const saveCurrent = (): void => {
    if (!editingId) return;
    const trimmed = name.trim() || 'Untitled macro';
    const def: MacroDef = { id: editingId, name: trimmed, actions: steps };
    const next = macros.some((m) => m.id === editingId)
      ? macros.map((m) => (m.id === editingId ? def : m))
      : [...macros, def];
    setMacros(next);
    addLog(`Macro "${trimmed}" saved (${steps.length} steps).`);
    closeEditor();
  };

  // Record mode: only records while the modal is open + recording — a real key press becomes a step.
  useEffect(() => {
    if (!recording || !editingId) return;
    const down = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      const hid = CODE_TO_HID[e.code];
      if (hid === undefined) return;
      e.preventDefault();
      setSteps((prev) => [...prev, { kind: 'key', code: hid, action: 'keydown', delayMs: 0 }]);
    };
    const up = (e: KeyboardEvent): void => {
      const hid = CODE_TO_HID[e.code];
      if (hid === undefined) return;
      e.preventDefault();
      setSteps((prev) => [...prev, { kind: 'key', code: hid, action: 'keyup', delayMs: 0 }]);
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [recording, editingId]);

  const editing = editingId ? macros.find((m) => m.id === editingId) : undefined;

  return (
    <div>
      <PageHead title="Macro" subtitle="Stored on this PC, written to the mouse. Cannot be read back." />
      <GlassCard>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-semibold text-[#edebe6]">Macro list</h3>
          <span className="text-xs text-[#a2a2b0]">{macros.length} macro</span>
        </div>
        {macros.length === 0 ? (
          <EmptyState text="No macros yet." />
        ) : (
          <div className="space-y-2">
            {macros.map((m, i) => (
              <div key={m.id} className="uiv-stripe">
                <div
                  className={`uiv-stripe-inner flex items-center gap-2 p-3 ${editingId === m.id ? 'ring-2 ring-[#ff5a1f]/60' : ''}`}
                >
                  <Zap className="h-4 w-4 shrink-0 text-[#ff8a3d]" />
                  <button onClick={() => openEdit(m)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-semibold text-white">{m.name}</div>
                    <div className="text-[11px] text-[#a2a2b0]">
                      Macro #{i} · {m.actions.length} steps
                    </div>
                  </button>
                  <button
                    onClick={() => setConfirmDelete(m.id)}
                    aria-label={`Delete macro ${m.name}`}
                    className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-lg text-red-300 hover:bg-red-400/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <GlassButton onClick={startNew} className="flex-1">
            <Plus className="h-4 w-4" /> Create macro
          </GlassButton>
          <GlassButton
            variant="ghost"
            onClick={() => void writeMacros(0)}
            disabled={macros.length === 0 || busy || !connected}
            className="flex-1"
          >
            <Play className="h-4 w-4" /> {mode === 'demo' ? 'Write (simulated)' : 'Write to mouse'}
          </GlassButton>
        </div>
      </GlassCard>

      {/* Create/edit macro modal — blurs everything behind (per Ethan's request).
          v2.6: PORTAL to document.body (same reason as ConfirmModal — the Shell
          holds the .app-enter transform, so fixed inset-0 only covers the Shell frame,
          and the 2 outer edges stay unblurred). */}
      {editingId !== null &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Edit macro' : 'New macro'}
            onClick={closeEditor}
          >
          <div
            className="panel-card max-h-[85vh] w-full max-w-lg overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-[#edebe6]">{editing ? 'Edit macro' : 'New macro'}</h3>
            <div className="mt-4 space-y-4">
              <div>
                <FieldLabel>Macro name</FieldLabel>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Macro name"
                  className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white"
                  placeholder="e.g. Open Chrome + paste"
                />
              </div>

              <div>
                <FieldLabel>Steps ({steps.length})</FieldLabel>
                {steps.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-[#a2a2b0]">
                    No steps yet. Click “Record keys”, then press a real key, or add a wait / mouse-click step.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {steps.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm">
                        <span className="w-6 shrink-0 font-mono text-xs text-[#a2a2b0]">{i + 1}.</span>
                        <span className="flex-1 text-white">{actionLabel(s)}</span>
                        <button
                          onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                          aria-label={`Delete step ${i + 1}`}
                          className="flex h-[36px] w-[36px] items-center justify-center rounded-lg text-red-300 hover:bg-red-400/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <GlassButton variant="ghost" onClick={() => setRecording((r) => !r)}>
                  <MousePointerClick className="h-4 w-4" />
                  {recording ? 'Stop recording…' : 'Record keys…'}
                </GlassButton>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={delayMs}
                    min={10}
                    max={5000}
                    step={10}
                    aria-label="Wait milliseconds"
                    onChange={(e) => setDelayMs(Number(e.target.value))}
                    className="w-[90px] rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-right font-mono text-sm text-white"
                  />
                  <GlassButton
                    variant="ghost"
                    onClick={() => {
                      setSteps((prev) => [...prev, { kind: 'delay', delayMs: Math.max(10, delayMs) }]);
                    }}
                  >
                    + Wait {delayMs} ms
                  </GlassButton>
                </div>
                <GlassButton
                  variant="ghost"
                  onClick={() => setSteps((prev) => [...prev, { kind: 'mouse', button: 0, action: 'mousedown', delayMs: 0 }, { kind: 'mouse', button: 0, action: 'mouseup', delayMs: 0 }])}
                >
                  + Left click
                </GlassButton>
              </div>
              {recording && (
                <p className="animate-pulse text-sm text-[#ffb37a]">
                  Recording… press any key (press + release becomes 2 steps). Click “Stop recording…” when done.
                </p>
              )}

              <div className="flex gap-2 border-t border-white/10 pt-4">
                <GlassButton onClick={saveCurrent}>
                  <Save className="h-4 w-4" /> Save macro
                </GlassButton>
                <GlassButton variant="ghost" onClick={closeEditor}>
                  Cancel
                </GlassButton>
              </div>
            </div>
          </div>
          </div>,
          document.body,
        )}

      <ConfirmModal
        open={confirmDelete !== null}
        title="Delete macro?"
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (confirmDelete) {
            setMacros(macros.filter((m) => m.id !== confirmDelete));
            if (editingId === confirmDelete) closeEditor();
          }
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        The macro will be deleted from this PC.
      </ConfirmModal>
    </div>
  );
}

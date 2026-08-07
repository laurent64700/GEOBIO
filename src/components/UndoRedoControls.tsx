// src/components/UndoRedoControls.tsx
import { useEffect, useState } from 'react'
import { hasUndoableAction, hasRedoableAction, undo, redo } from '../offline/actionHistory'

export interface UndoRedoControlsProps {
  planId: string
  /** Called after a successful undo/redo so the caller can reload its own
   * entity lists (SiteMapView.tsx) — actionHistory.ts only touches the
   * IndexedDB/Supabase layer, it has no knowledge of any component's state. */
  onChanged: () => void
  /** Shared busy flag, owned by the parent (MissionWorkspace) and also
   * written to by MenuBar's Modifier menu — this component no longer
   * tracks its own local busy state, since a purely one-way mirror
   * (this component -> parent) left the reverse direction (Modifier's
   * own in-flight call disabling THIS component's buttons) unguarded,
   * a real reentrancy gap found in code review. Both triggers for the
   * same undo/redo actions now read and write ONE shared value. */
  busy: boolean
  onBusyChange: (busy: boolean) => void
}

// No shared event bus exists between the many mutating handlers scattered
// across SiteMapView.tsx (felt points, segments, phenomena, context objects,
// line edits, grid recalibration...) and this component — wiring an explicit
// refresh callback into every one of them would be a much larger change than
// this feature needs. Undo/redo is an occasional utility action, not a hot
// path, so a short poll interval keeps the buttons' enabled state honest
// without that wiring.
const POLL_INTERVAL_MS = 1500

export function UndoRedoControls({ planId, onChanged, busy, onBusyChange }: UndoRedoControlsProps) {
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // actionHistory.ts's undo()/redo() document that "no reentrancy guard
  // exists at this layer — the caller (the UI) must prevent concurrent
  // calls." `canUndo`/`canRedo` only update after refresh() resolves, so
  // they stay stale for the whole in-flight duration and can't be relied on
  // to prevent a double-click or an undo-then-immediately-redo race. `busy`
  // disables BOTH buttons for the duration of any in-flight call, since undo
  // and redo both touch the same action_history entries and could race
  // against each other, not just against themselves. It's now a controlled
  // prop, shared with MenuBar's Modifier menu via the parent, rather than
  // local state — see the prop doc comment above for why.

  async function refresh() {
    setCanUndo(await hasUndoableAction(planId))
    setCanRedo(await hasRedoableAction(planId))
  }

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is
    // recreated every render but only closes over planId, which IS a dep.
  }, [planId])

  async function handleUndo() {
    onBusyChange(true)
    try {
      await undo(planId)
      setError(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusyChange(false)
    }
    await refresh()
  }

  async function handleRedo() {
    onBusyChange(true)
    try {
      await redo(planId)
      setError(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      onBusyChange(false)
    }
    await refresh()
  }

  return (
    <div>
      <button onClick={handleUndo} disabled={!canUndo || busy} aria-label="Annuler">
        ↶ Annuler
      </button>
      <button onClick={handleRedo} disabled={!canRedo || busy} aria-label="Refaire">
        ↷ Refaire
      </button>
      {error !== null && (
        <>
          <p role="alert">{error}</p>
          <button onClick={() => setError(null)}>Fermer</button>
        </>
      )}
    </div>
  )
}

// src/components/UndoRedoControls.tsx
import { useEffect, useState } from 'react'
import { hasUndoableAction, hasRedoableAction, undo, redo } from '../offline/actionHistory'

export interface UndoRedoControlsProps {
  planId: string
  /** Called after a successful undo/redo so the caller can reload its own
   * entity lists (SiteMapView.tsx) — actionHistory.ts only touches the
   * IndexedDB/Supabase layer, it has no knowledge of any component's state. */
  onChanged: () => void
  /** Mirrors this component's internal `busy` state outward — added so a
   * sibling trigger for the same undo/redo actions (MenuBar's Modifier menu)
   * can disable itself while THIS component's button is mid-operation,
   * satisfying actionHistory.ts's "caller must prevent concurrent calls"
   * precondition across both triggers, not just within this one component.
   * Optional — omitting it preserves this component's exact pre-existing
   * standalone behavior. */
  onBusyChange?: (busy: boolean) => void
}

// No shared event bus exists between the many mutating handlers scattered
// across SiteMapView.tsx (felt points, segments, phenomena, context objects,
// line edits, grid recalibration...) and this component — wiring an explicit
// refresh callback into every one of them would be a much larger change than
// this feature needs. Undo/redo is an occasional utility action, not a hot
// path, so a short poll interval keeps the buttons' enabled state honest
// without that wiring.
const POLL_INTERVAL_MS = 1500

export function UndoRedoControls({ planId, onChanged, onBusyChange }: UndoRedoControlsProps) {
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
  // against each other, not just against themselves.
  const [busy, setBusy] = useState(false)

  function updateBusy(value: boolean) {
    setBusy(value)
    onBusyChange?.(value)
  }

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
    updateBusy(true)
    try {
      await undo(planId)
      setError(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      updateBusy(false)
    }
    await refresh()
  }

  async function handleRedo() {
    updateBusy(true)
    try {
      await redo(planId)
      setError(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      updateBusy(false)
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

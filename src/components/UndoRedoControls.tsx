// src/components/UndoRedoControls.tsx
import { useEffect, useState } from 'react'
import { hasUndoableAction, hasRedoableAction, undo, redo } from '../offline/actionHistory'

export interface UndoRedoControlsProps {
  planId: string
  /** Called after a successful undo/redo so the caller can reload its own
   * entity lists (SiteMapView.tsx) — actionHistory.ts only touches the
   * IndexedDB/Supabase layer, it has no knowledge of any component's state. */
  onChanged: () => void
}

// No shared event bus exists between the many mutating handlers scattered
// across SiteMapView.tsx (felt points, segments, phenomena, context objects,
// line edits, grid recalibration...) and this component — wiring an explicit
// refresh callback into every one of them would be a much larger change than
// this feature needs. Undo/redo is an occasional utility action, not a hot
// path, so a short poll interval keeps the buttons' enabled state honest
// without that wiring.
const POLL_INTERVAL_MS = 1500

export function UndoRedoControls({ planId, onChanged }: UndoRedoControlsProps) {
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    try {
      await undo(planId)
      setError(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    await refresh()
  }

  async function handleRedo() {
    try {
      await redo(planId)
      setError(null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    await refresh()
  }

  return (
    <div>
      <button onClick={handleUndo} disabled={!canUndo} aria-label="Annuler">
        ↶ Annuler
      </button>
      <button onClick={handleRedo} disabled={!canRedo} aria-label="Refaire">
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

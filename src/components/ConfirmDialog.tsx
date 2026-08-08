// src/components/ConfirmDialog.tsx
import { useState } from 'react'
import { isOnlineNow } from '../offline/connectivity'

export interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}

// Floating-panel style matching MenuBar.tsx's FLOATING_PANEL_STYLE — same
// visual convention, defined locally rather than imported since that
// constant is private to MenuBar.tsx and this component is meant to be used
// from multiple, unrelated callers (MissionList.tsx AND MenuBar.tsx) —
// creating an export dependency from a feature-specific file to a generic
// shared component would be the wrong direction of coupling.
const DIALOG_STYLE = {
  position: 'absolute' as const,
  top: '100%',
  left: 0,
  marginTop: 4,
  padding: 8,
  background: 'white',
  border: '1px solid #ccc',
  borderRadius: 4,
  zIndex: 1200, // same value as MenuBar.tsx's FLOATING_PANEL_STYLE — see its own comment for why
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setError(null)
    // busy is set BEFORE the connectivity probe, not just around onConfirm —
    // isOnlineNow() does a real network request with up to a 3s timeout
    // (src/offline/connectivity.ts), so a reentrancy guard that only covers
    // onConfirm would leave a multi-second window where a fast double-click
    // invokes handleConfirm (and eventually onConfirm) twice concurrently.
    // Found in code review before this component had any consumers — for a
    // dialog whose whole purpose is gating an irreversible action, that gap
    // needed closing before it reached real call sites, not left as an
    // accepted risk.
    setBusy(true)
    try {
      // Checked here rather than via a persistently-disabled button — no
      // reactive connectivity state exists anywhere in this codebase, so
      // this mirrors the established pattern (attempt the action's
      // connectivity-sensitive part, surface a clear error) rather than
      // introducing new hook infrastructure for one feature.
      const online = await isOnlineNow()
      if (!online) {
        setError('Suppression indisponible hors-ligne — réessayez une fois connecté.')
        return
      }
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={DIALOG_STYLE}>
      <p>{title}</p>
      <p>{message}</p>
      {error && (
        <p role="alert">
          {error}
          <button onClick={() => setError(null)}>Fermer</button>
        </p>
      )}
      <button onClick={onCancel} disabled={busy}>Annuler</button>
      <button onClick={handleConfirm} disabled={busy}>{confirmLabel}</button>
    </div>
  )
}

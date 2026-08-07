// src/components/MenuBar.tsx
import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { undo, redo } from '../offline/actionHistory'

export interface MenuBarProps {
  onNavigateToMissionList: () => void
  onNavigateToNewMission: () => void
  /** Read-only fields shown by "Infos de la mission" — MenuBar owns its own
   * show/hide state (below) and just renders whatever is passed here; it
   * does not fetch or know anything about Mission beyond these 3 fields. */
  missionInfo: { address: string; missionDate: string; parcelRefs: string[] }
  onSaveNow: () => Promise<void>
  onDuplicateMission: () => Promise<void>
  onQuitMission: () => void
  /** Plan whose action_history Modifier's Annuler/Refaire operate on — the
   * same plan Toolbar's own UndoRedoControls instance targets. */
  planId: string
  /** Single shared busy flag, owned by the parent (MissionWorkspace) and
   * also written to by Toolbar's UndoRedoControls instance — disables
   * Modifier's Annuler/Refaire while EITHER trigger's undo/redo call is
   * mid-operation, satisfying actionHistory.ts's "caller must prevent
   * concurrent calls" precondition across both triggers of the same
   * undo/redo actions, in both directions. */
  undoRedoBusy: boolean
  /** Reports Modifier's own in-flight undo/redo calls back to the parent,
   * which folds them into the same shared value passed back down as
   * undoRedoBusy — this is what lets Toolbar's own UndoRedoControls buttons
   * disable themselves while Modifier's Annuler/Refaire is running, closing
   * the reverse direction a one-way mirror left open. */
  onUndoRedoBusyChange: (busy: boolean) => void
  /** Toggles the "Calques" Accordion section in SiteMapView's sidebar — a
   * pure toggle wrapper around MissionWorkspace's setCalquesOpen, since
   * MenuBar has no visibility into the Accordion's real DOM state (unlike
   * MissionWorkspace, which receives Accordion's reported open value
   * directly via onToggle and can pass the real setter through). */
  onToggleCalques: () => void
  /** Toggles SiteMapView's global "Mode édition" checkbox — a 2nd trigger
   * for the same flag the checkbox in the sidebar already controls. */
  onToggleEditMode: () => void
}

// The saveError/missionInfo panels below float via `position: absolute` off
// a `position: relative` wrapper around the "Fichier" trigger — the exact
// pattern Toolbar.tsx's GUIDE_LINE_WRAPPER_STYLE/GUIDE_LINE_SLOT_STYLE
// already established for its own dropdown-shaped panel. Toolbar's row has
// a fixed height (48px, no vertical overflow handling); rendering these
// panels as ordinary flex-item siblings of the trigger would let multi-line
// content (a long error message, or address+date+parcel list) push the row
// taller than 48px and visually spill outside the bar.
const MENU_TRIGGER_WRAPPER_STYLE = {
  position: 'relative' as const,
  display: 'flex',
  alignItems: 'center',
}

const FLOATING_PANEL_STYLE = {
  position: 'absolute' as const,
  top: '100%',
  left: 0,
  marginTop: 4,
  padding: 8,
  background: 'white',
  border: '1px solid #ccc',
  borderRadius: 4,
  zIndex: 1200, // matches GUIDE_LINE_SLOT_STYLE — above the toolbar row itself
}

// Radix's DropdownMenu is headless (no visual styling of its own). Fichier's
// content/behavior is per spec §4. Modifier/Affichage are added in later
// tasks as siblings of this same top-level <DropdownMenu.Root> pattern —
// copy this structure, don't invent a new one per menu.
export function MenuBar({
  onNavigateToMissionList,
  onNavigateToNewMission,
  missionInfo,
  onSaveNow,
  onDuplicateMission,
  onQuitMission,
  planId,
  undoRedoBusy,
  onUndoRedoBusyChange,
  onToggleCalques,
  onToggleEditMode,
}: MenuBarProps) {
  const [saveError, setSaveError] = useState<string | null>(null)
  const [missionInfoOpen, setMissionInfoOpen] = useState(false)
  // Unlike Annuler/Refaire, nothing else in the app can trigger
  // duplicateMission concurrently, so a local flag (not a lifted/shared one
  // like undoRedoBusy) is enough here. Still needed, though: duplicateMission
  // makes 2-4 sequential Supabase calls with no idempotency check, and
  // deleteMission doesn't exist anywhere in this codebase, so an accidental
  // double-trigger (re-opening this menu and clicking again before the first
  // call resolves — plausible on a slow field connection) creates a
  // permanent duplicate mission with no way to clean it up from the app.
  // Found in the toolbar-ribbon branch's final review.
  const [duplicating, setDuplicating] = useState(false)

  async function handleSaveNow() {
    setSaveError(null)
    try {
      await onSaveNow()
    } catch (err) {
      // Best-effort action — a dismissible inline message, never a
      // page-blocking error; the OfflineIndicator badge already shows the
      // real synced/pending state regardless of whether this succeeded.
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDuplicate() {
    // Mirrors handleSaveNow: clear any stale error up front, otherwise a
    // failed "Enregistrer" could leave an error on screen that then reads as
    // if it belongs to this "Enregistrer sous" action instead.
    setSaveError(null)
    setDuplicating(true)
    try {
      await onDuplicateMission()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setDuplicating(false)
    }
  }

  async function handleUndo() {
    onUndoRedoBusyChange(true)
    try {
      await undo(planId)
    } catch (err) {
      // Reuse the same dismissible error slot as Enregistrer — Modifier has
      // no separate error UI of its own.
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      onUndoRedoBusyChange(false)
    }
  }

  async function handleRedo() {
    onUndoRedoBusyChange(true)
    try {
      await redo(planId)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      onUndoRedoBusyChange(false)
    }
  }

  return (
    <div style={MENU_TRIGGER_WRAPPER_STYLE}>
      {saveError && (
        <p role="alert" style={FLOATING_PANEL_STYLE}>
          {saveError}
          <button onClick={() => setSaveError(null)}>Fermer</button>
        </p>
      )}
      {missionInfoOpen && (
        <div style={FLOATING_PANEL_STYLE}>
          <p>{missionInfo.address}</p>
          <p>{missionInfo.missionDate}</p>
          <p>{missionInfo.parcelRefs.join(', ')}</p>
          <button onClick={() => setMissionInfoOpen(false)}>Fermer</button>
        </div>
      )}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button>Fichier</button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item onSelect={onNavigateToNewMission}>Nouvelle mission</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={onNavigateToMissionList}>Mes missions</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => setMissionInfoOpen(true)}>Infos de la mission</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={handleSaveNow}>Enregistrer</DropdownMenu.Item>
            <DropdownMenu.Item disabled={duplicating} onSelect={handleDuplicate}>Enregistrer sous</DropdownMenu.Item>
            <DropdownMenu.Item disabled title="Génération de rapport pas encore disponible">
              Imprimer
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={onQuitMission}>Quitter la mission</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button>Modifier</button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item disabled={undoRedoBusy} onSelect={handleUndo}>
              Annuler
            </DropdownMenu.Item>
            <DropdownMenu.Item disabled={undoRedoBusy} onSelect={handleRedo}>
              Refaire
            </DropdownMenu.Item>
            <DropdownMenu.Item disabled title="Pas encore disponible — aucune sélection globale n'existe aujourd'hui">
              Supprimer l'élément sélectionné
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button>Affichage</button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item disabled title="Utilisez les contrôles +/- sur la carte">
              Zoom +
            </DropdownMenu.Item>
            <DropdownMenu.Item disabled title="Utilisez les contrôles +/- sur la carte">
              Zoom −
            </DropdownMenu.Item>
            <DropdownMenu.Item disabled title="Bientôt disponible">
              Recentrer sur les parcelles
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={onToggleCalques}>Basculer Calques</DropdownMenu.Item>
            <DropdownMenu.Item disabled title="Bientôt disponible">
              Fond de carte
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={onToggleEditMode}>Mode édition</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}

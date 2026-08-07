// src/components/MenuBar.tsx
import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

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
}: MenuBarProps) {
  const [saveError, setSaveError] = useState<string | null>(null)
  const [missionInfoOpen, setMissionInfoOpen] = useState(false)

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
    try {
      await onDuplicateMission()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
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
            <DropdownMenu.Item onSelect={handleDuplicate}>Enregistrer sous</DropdownMenu.Item>
            <DropdownMenu.Item disabled title="Génération de rapport pas encore disponible">
              Imprimer
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={onQuitMission}>Quitter la mission</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}

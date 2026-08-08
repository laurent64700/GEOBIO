// src/components/MissionList.tsx
import { useState } from 'react'
import type { Mission } from '../domain/types'
import { ConfirmDialog } from './ConfirmDialog'

export interface MissionListProps {
  missions: Mission[]
  onSelectMission: (mission: Mission) => void
  onCreateNew: () => void
  onDeleteMission: (mission: Mission) => Promise<void>
}

// A relative-positioned wrapper per row so ConfirmDialog (position: absolute,
// top: 100%) anchors under the delete button that opened it — same pattern
// MenuBar.tsx's MENU_TRIGGER_WRAPPER_STYLE already establishes.
const ROW_WRAPPER_STYLE = { position: 'relative' as const }

// listMissions() already sorts by mission_date descending (missionsRepo.ts)
// — no client-side sort needed here (spec §9).
export function MissionList({ missions, onSelectMission, onCreateNew, onDeleteMission }: MissionListProps) {
  const [confirmingMission, setConfirmingMission] = useState<Mission | null>(null)

  return (
    <div>
      <button onClick={onCreateNew}>Nouvelle mission</button>
      <ul>
        {missions.map((mission) => (
          <li key={mission.id} style={ROW_WRAPPER_STYLE}>
            <button onClick={() => onSelectMission(mission)}>
              {mission.address} — {mission.missionDate}
            </button>
            {/* aria-label, not just visible "Supprimer" text: without it,
                this trigger and ConfirmDialog's own confirm button below
                would share the exact same accessible name once the dialog
                is open (this button stays mounted, not hidden), making them
                ambiguous to screen readers and to `getByRole` queries alike.
                Includes missionDate as well as address, not just address
                alone: two missions CAN share the same address (a follow-up
                visit to the same site is a realistic case for this app), so
                address alone isn't guaranteed unique across rows — the pair
                matches what's already shown in the row's own select button
                just below, so it's not introducing new information, just
                reusing what's already displayed to keep this label unique. */}
            <button
              aria-label={`Supprimer la mission ${mission.address} — ${mission.missionDate}`}
              onClick={() => setConfirmingMission(mission)}
            >
              Supprimer
            </button>
            {confirmingMission?.id === mission.id && (
              <ConfirmDialog
                title="Supprimer la mission ?"
                message={`«${mission.address} — ${mission.missionDate}» — Cette action est irréversible.`}
                confirmLabel="Supprimer"
                onCancel={() => setConfirmingMission(null)}
                onConfirm={async () => {
                  await onDeleteMission(mission)
                  setConfirmingMission(null)
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

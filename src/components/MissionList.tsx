// src/components/MissionList.tsx
import type { Mission } from '../domain/types'

export interface MissionListProps {
  missions: Mission[]
  onSelectMission: (mission: Mission) => void
  onCreateNew: () => void
}

// listMissions() already sorts by mission_date descending (missionsRepo.ts)
// — no client-side sort needed here (spec §9).
export function MissionList({ missions, onSelectMission, onCreateNew }: MissionListProps) {
  return (
    <div>
      <button onClick={onCreateNew}>Nouvelle mission</button>
      <ul>
        {missions.map((mission) => (
          <li key={mission.id}>
            <button onClick={() => onSelectMission(mission)}>
              {mission.address} — {mission.missionDate}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

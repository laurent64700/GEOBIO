// src/pages/deriveResumePhase.ts
import { listPlansForMission, createPlan } from '../data/plansRepo'
import type { Mission, Plan } from '../domain/types'

export type ResumePhase =
  | { name: 'global-assessment'; mission: Mission; exteriorPlan: Plan }
  | { name: 'setting-origin'; mission: Mission; exteriorPlan: Plan }
  | { name: 'ready-no-interior'; mission: Mission; exteriorPlan: Plan }

// Derives which WorkspacePhase to resume an existing mission at, purely from
// what's already persisted (spec §9) — no separate "phase" column. Handles
// the orphaned-mission edge case (mission created but its exterior plan's
// createPlan call failed, non-transactional — see MissionWorkspace's
// handleMissionCreated) by retrying the plan creation rather than failing.
export async function deriveResumePhase(mission: Mission): Promise<ResumePhase> {
  const plans = await listPlansForMission(mission.id)
  const existingExterior = plans.find((p) => p.kind === 'exterieur')
  const exteriorPlan = existingExterior ?? (await createPlan({ missionId: mission.id, kind: 'exterieur' }))

  if (mission.bovisRate === null) {
    return { name: 'global-assessment', mission, exteriorPlan }
  }
  if (mission.originLat === null || mission.originLng === null) {
    return { name: 'setting-origin', mission, exteriorPlan }
  }
  return { name: 'ready-no-interior', mission, exteriorPlan }
}

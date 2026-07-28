import { listGridTemplates } from '../data/gridTemplatesRepo'
import { listGridInstancesForPlan } from '../data/gridInstancesRepo'
import { listGridLinesForInstance } from '../data/gridLinesRepo'
import { listFeltPointsForPlan } from '../data/feltPointsRepo'
import { listFeltSegmentsForPlan } from '../data/feltSegmentsRepo'
import { listPhenomenaForPlan } from '../data/phenomenaRepo'
import { listContextObjectsForPlan } from '../data/contextObjectsRepo'
import { listFreeformNetworksForPlan } from '../data/freeformNetworksRepo'
import { listPlansForMission } from '../data/plansRepo'
import { setCurrentSession } from './currentSession'
import type { Mission, Plan } from '../domain/types'

/**
 * Primes every IndexedDB cache needed to work a plan fully offline, then
 * writes `current_session` — the record the offline boot path (Task 6.3)
 * reads on a cold start with no network. Without that write here, a
 * technician who prepares a mission and drives straight to a no-signal
 * site in the same session (never revisiting the mission list, the only
 * other place `current_session` is written — `handleSelectMission` in
 * App.tsx, Task 6.2) would have nothing cached to boot from.
 */
export async function preloadPlanForOffline(mission: Mission, exteriorPlan: Plan): Promise<void> {
  const planId = exteriorPlan.id

  const [instances] = await Promise.all([
    listGridInstancesForPlan(planId),
    listGridTemplates(),
    listFeltPointsForPlan(planId),
    listFeltSegmentsForPlan(planId),
    listPhenomenaForPlan(planId),
    listContextObjectsForPlan(planId),
    listFreeformNetworksForPlan(planId),
    listPlansForMission(mission.id),
  ])

  await Promise.all(instances.map((instance) => listGridLinesForInstance(instance.id)))

  await setCurrentSession(mission, exteriorPlan)
}

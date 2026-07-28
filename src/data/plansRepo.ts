// src/data/plansRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { AffineTransform, Plan, PlanKind } from '../domain/types'
import { getDB } from '../offline/db'
import { isOnlineNow } from '../offline/connectivity'
import { SupabaseQueryError } from '../offline/supabaseQueryError'

export interface CreatePlanInput {
  missionId: string
  kind: PlanKind
  imageUrl?: string | null
  calibration?: AffineTransform | null
}

interface PlanRow {
  id: string
  mission_id: string
  kind: PlanKind
  image_url: string | null
  calibration: AffineTransform | null
}

function mapRowToPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    missionId: row.mission_id,
    kind: row.kind,
    imageUrl: row.image_url,
    calibration: row.calibration,
  }
}

export async function createPlan(input: CreatePlanInput): Promise<Plan> {
  const { data, error } = await supabase
    .from('plan')
    .insert({
      mission_id: input.missionId,
      kind: input.kind,
      image_url: input.imageUrl ?? null,
      calibration: input.calibration ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible de créer le plan : ${error.message}`)
  return mapRowToPlan(data as PlanRow)
}

// plan is indexed by mission_id (NOT plan_id — a plan doesn't have a
// plan_id, it IS the plan), and the store holds plans for MULTIPLE missions
// simultaneously, so this doesn't fit `cachedList`/`cachedWrite` from
// cacheThrough.ts (typed to require a PlanIdStoreName). This is a narrow,
// hand-written cache-through variant for this store's own index, in the same
// spirit as gridLinesRepo.ts's variant for grid_instance_id.
//
// Only the Supabase network call (including its business-error check and row
// mapping) is covered by the try/catch below. Once that call has succeeded,
// refreshing the local cache is a separate step performed OUTSIDE the try —
// see cacheThrough.ts's doc comment for why a local-write failure at that
// point must propagate rather than being folded into "offline, use stale
// cache".
//
// The refresh is scoped to entries matching THIS missionId only (delete via
// the mission_id index cursor, then insert the fresh list) — never a
// whole-store clear, which would wipe every OTHER mission's cached plans out
// from under it.
export async function listPlansForMission(missionId: string): Promise<Plan[]> {
  if (await isOnlineNow()) {
    let plans: Plan[]
    try {
      const { data, error } = await supabase.from('plan').select().eq('mission_id', missionId)
      if (error) throw new SupabaseQueryError(`Impossible de charger les plans : ${error.message}`)
      plans = (data as PlanRow[]).map(mapRowToPlan)
    } catch (err) {
      if (err instanceof SupabaseQueryError) throw err
      // network failure (not a Supabase-reported error) — fall through to cache
      return readCachedPlansForMission(missionId)
    }
    await replaceCachedPlansForMission(missionId, plans)
    return plans
  }
  return readCachedPlansForMission(missionId)
}

async function readCachedPlansForMission(missionId: string): Promise<Plan[]> {
  const db = await getDB()
  return (await db.getAllFromIndex('plan', 'mission_id', missionId)) as Plan[]
}

async function replaceCachedPlansForMission(missionId: string, plans: Plan[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction('plan', 'readwrite')
  const index = tx.store.index('mission_id')
  let cursor = await index.openCursor(IDBKeyRange.only(missionId))
  while (cursor) {
    await cursor.delete()
    cursor = await cursor.continue()
  }
  for (const plan of plans) {
    await tx.store.put(plan)
  }
  await tx.done
}

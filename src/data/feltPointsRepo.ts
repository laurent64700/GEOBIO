import { supabase } from '../lib/supabaseClient'
import type { FeltPoint } from '../domain/types'
import { cachedList, cachedWrite } from '../offline/cacheThrough'
import { generateClientId } from '../offline/clientId'
import { getDB } from '../offline/db'
import { SupabaseQueryError } from '../offline/supabaseQueryError'
import { undoableWrite, type UndoableOptions } from '../offline/actionHistory'

export interface CreateFeltPointInput {
  planId: string
  networkName: string
  x: number
  y: number
}

interface FeltPointRow {
  id: string
  plan_id: string
  network_name: string
  x: number
  y: number
  created_at: string
}

function mapRowToFeltPoint(row: FeltPointRow): FeltPoint {
  return {
    id: row.id,
    planId: row.plan_id,
    networkName: row.network_name,
    x: row.x,
    y: row.y,
    createdAt: row.created_at,
  }
}

export async function createFeltPoint(
  input: CreateFeltPointInput,
  options?: UndoableOptions
): Promise<FeltPoint> {
  const id = generateClientId()
  const createdAt = new Date().toISOString()
  const row = {
    id,
    plan_id: input.planId,
    network_name: input.networkName,
    x: input.x,
    y: input.y,
    created_at: createdAt,
  }
  const item: FeltPoint = {
    id,
    planId: input.planId,
    networkName: input.networkName,
    x: input.x,
    y: input.y,
    createdAt,
  }

  return undoableWrite(input.planId, 'felt_point', 'insert', null, () =>
    cachedWrite('felt_point', 'felt_point', 'insert', item, () => row, async () => {
      const { data, error } = await supabase.from('felt_point').insert(row).select().single()

      if (error) throw new SupabaseQueryError(`Impossible d'enregistrer le point ressenti : ${error.message}`)
      return mapRowToFeltPoint(data as FeltPointRow)
    }),
  options)
}

export async function deleteFeltPoint(id: string, options?: UndoableOptions): Promise<void> {
  // Read the entity before deleting it — undoableWrite needs the full
  // pre-deletion object as `before`, so undo() can later call restoreFeltPoint
  // with the exact original state (not just the id).
  const db = await getDB()
  const existing = (await db.get('felt_point', id)) as FeltPoint | undefined
  if (!existing) {
    throw new Error(`Impossible de supprimer le point ressenti : ${id} est introuvable dans le cache local`)
  }

  await undoableWrite(existing.planId, 'felt_point', 'delete', existing, () =>
    cachedWrite('felt_point', 'felt_point', 'delete', { id }, () => ({ id }), async () => {
      const { error } = await supabase.from('felt_point').delete().eq('id', id)
      if (error) throw new SupabaseQueryError(`Impossible de supprimer le point ressenti : ${error.message}`)
      return { id }
    }),
  options)
}

// Deliberately does NOT accept UndoableOptions / route through undoableWrite,
// unlike createFeltPoint/deleteFeltPoint above — this is only ever meant to
// be called by undo()/redo() (a later task), which records its own history
// bookkeeping directly when replaying a restore. Calling this from feature
// code directly would silently bypass undo/redo tracking.
export async function restoreFeltPoint(item: FeltPoint): Promise<FeltPoint> {
  const row: FeltPointRow = {
    id: item.id,
    plan_id: item.planId,
    network_name: item.networkName,
    x: item.x,
    y: item.y,
    created_at: item.createdAt,
  }
  return cachedWrite('felt_point', 'felt_point', 'insert', item, () => row, async () => {
    const { data, error } = await supabase.from('felt_point').insert(row).select().single()
    if (error) throw new SupabaseQueryError(`Impossible de restaurer le point ressenti : ${error.message}`)
    return mapRowToFeltPoint(data as FeltPointRow)
  })
}

export async function listFeltPointsForPlan(planId: string): Promise<FeltPoint[]> {
  return cachedList('felt_point', planId, async () => {
    const { data, error } = await supabase.from('felt_point').select().eq('plan_id', planId)

    if (error) throw new SupabaseQueryError(`Impossible de charger les points ressentis : ${error.message}`)
    return (data as FeltPointRow[]).map(mapRowToFeltPoint)
  })
}

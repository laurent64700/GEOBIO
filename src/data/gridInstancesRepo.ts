import { supabase } from '../lib/supabaseClient'
import type { GridInstance, GridTemplate } from '../domain/types'
import { cachedList, cachedWrite } from '../offline/cacheThrough'
import { generateClientId } from '../offline/clientId'
import { getDB } from '../offline/db'
import { SupabaseQueryError } from '../offline/supabaseQueryError'

export interface CreateGridInstanceInput {
  planId: string
  templateSnapshot: GridTemplate
  originX: number
  originY: number
}

interface GridInstanceRow {
  id: string
  plan_id: string
  template_snapshot: GridTemplate
  origin_x: number
  origin_y: number
}

function mapRowToGridInstance(row: GridInstanceRow): GridInstance {
  return {
    id: row.id,
    planId: row.plan_id,
    templateSnapshot: row.template_snapshot,
    originX: row.origin_x,
    originY: row.origin_y,
  }
}

function gridInstanceToRow(item: GridInstance): GridInstanceRow {
  return {
    id: item.id,
    plan_id: item.planId,
    template_snapshot: item.templateSnapshot,
    origin_x: item.originX,
    origin_y: item.originY,
  }
}

export async function createGridInstance(input: CreateGridInstanceInput): Promise<GridInstance> {
  const id = generateClientId()
  const item: GridInstance = {
    id,
    planId: input.planId,
    templateSnapshot: input.templateSnapshot,
    originX: input.originX,
    originY: input.originY,
  }
  const row = gridInstanceToRow(item)

  return cachedWrite('grid_instance', 'grid_instance', 'insert', item, () => row, async () => {
    const { data, error } = await supabase.from('grid_instance').insert(row).select().single()

    if (error) throw new SupabaseQueryError(`Impossible de créer l'instance de grille : ${error.message}`)
    return mapRowToGridInstance(data as GridInstanceRow)
  })
}

export async function listGridInstancesForPlan(planId: string): Promise<GridInstance[]> {
  return cachedList('grid_instance', planId, async () => {
    const { data, error } = await supabase.from('grid_instance').select().eq('plan_id', planId)
    if (error) throw new SupabaseQueryError(`Impossible de charger les instances de grille : ${error.message}`)
    return (data as GridInstanceRow[]).map(mapRowToGridInstance)
  })
}

export async function updateGridInstanceOrigin(
  instanceId: string,
  originX: number,
  originY: number
): Promise<GridInstance> {
  // cachedWrite needs the FULL updated domain object up front (it's what
  // gets written to the local cache and queued for replay if we're offline
  // or the network call fails) — not just the changed origin fields. That
  // means reading the currently-cached instance first and patching the
  // origin on top of it, so templateSnapshot (and any other field we're not
  // touching) survives instead of being dropped from the cache/queue.
  const db = await getDB()
  const existing = (await db.get('grid_instance', instanceId)) as GridInstance | undefined
  if (!existing) {
    throw new Error(
      `Impossible de recaler la grille : l'instance ${instanceId} est introuvable dans le cache local`
    )
  }
  const item: GridInstance = { ...existing, originX, originY }

  return cachedWrite('grid_instance', 'grid_instance', 'update', item, gridInstanceToRow, async () => {
    const { data, error } = await supabase
      .from('grid_instance')
      .update({ origin_x: originX, origin_y: originY })
      .eq('id', instanceId)
      .select()
      .single()

    if (error) throw new SupabaseQueryError(`Impossible de recaler la grille : ${error.message}`)
    return mapRowToGridInstance(data as GridInstanceRow)
  })
}

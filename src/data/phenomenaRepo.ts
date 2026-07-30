import { supabase } from '../lib/supabaseClient'
import type { Phenomenon, PhenomenonKind } from '../domain/types'
import { cachedList, cachedWrite } from '../offline/cacheThrough'
import { generateClientId } from '../offline/clientId'
import { getDB } from '../offline/db'
import { SupabaseQueryError } from '../offline/supabaseQueryError'
import { undoableWrite, type UndoableOptions } from '../offline/actionHistory'

export interface CreatePhenomenonInput {
  planId: string
  kind: PhenomenonKind
  x: number
  y: number
}

interface PhenomenonRow {
  id: string
  plan_id: string
  kind: PhenomenonKind
  x: number
  y: number
  created_at: string
}

function mapRowToPhenomenon(row: PhenomenonRow): Phenomenon {
  return {
    id: row.id,
    planId: row.plan_id,
    kind: row.kind,
    x: row.x,
    y: row.y,
    createdAt: row.created_at,
  }
}

export async function createPhenomenon(
  input: CreatePhenomenonInput,
  options?: UndoableOptions
): Promise<Phenomenon> {
  const id = generateClientId()
  const createdAt = new Date().toISOString()
  const row = { id, plan_id: input.planId, kind: input.kind, x: input.x, y: input.y, created_at: createdAt }
  const item: Phenomenon = { id, planId: input.planId, kind: input.kind, x: input.x, y: input.y, createdAt }

  return undoableWrite(input.planId, 'phenomenon', 'insert', null, () =>
    cachedWrite('phenomenon', 'phenomenon', 'insert', item, () => row, async () => {
      const { data, error } = await supabase.from('phenomenon').insert(row).select().single()

      if (error) throw new SupabaseQueryError(`Impossible d'enregistrer le phénomène : ${error.message}`)
      return mapRowToPhenomenon(data as PhenomenonRow)
    }),
  options)
}

export async function deletePhenomenon(id: string, options?: UndoableOptions): Promise<void> {
  // Read the entity before deleting it — undoableWrite needs the full
  // pre-deletion object as `before`, so undo() can later call
  // restorePhenomenon with the exact original state (not just the id).
  const db = await getDB()
  const existing = (await db.get('phenomenon', id)) as Phenomenon | undefined
  if (!existing) {
    throw new Error(`Impossible de supprimer le phénomène : ${id} est introuvable dans le cache local`)
  }

  await undoableWrite(existing.planId, 'phenomenon', 'delete', existing, () =>
    cachedWrite('phenomenon', 'phenomenon', 'delete', { id }, () => ({ id }), async () => {
      const { error } = await supabase.from('phenomenon').delete().eq('id', id)
      if (error) throw new SupabaseQueryError(`Impossible de supprimer le phénomène : ${error.message}`)
      return { id }
    }),
  options)
}

// Deliberately does NOT accept UndoableOptions / route through undoableWrite,
// unlike createPhenomenon/deletePhenomenon above — this is only ever meant
// to be called by undo()/redo() (a later task), which records its own
// history bookkeeping directly when replaying a restore. Calling this from
// feature code directly would silently bypass undo/redo tracking.
export async function restorePhenomenon(item: Phenomenon): Promise<Phenomenon> {
  const row: PhenomenonRow = {
    id: item.id, plan_id: item.planId, kind: item.kind, x: item.x, y: item.y, created_at: item.createdAt,
  }
  return cachedWrite('phenomenon', 'phenomenon', 'insert', item, () => row, async () => {
    const { data, error } = await supabase.from('phenomenon').insert(row).select().single()
    if (error) throw new SupabaseQueryError(`Impossible de restaurer le phénomène : ${error.message}`)
    return mapRowToPhenomenon(data as PhenomenonRow)
  })
}

export async function listPhenomenaForPlan(planId: string): Promise<Phenomenon[]> {
  return cachedList('phenomenon', planId, async () => {
    const { data, error } = await supabase.from('phenomenon').select().eq('plan_id', planId)

    if (error) throw new SupabaseQueryError(`Impossible de charger les phénomènes : ${error.message}`)
    return (data as PhenomenonRow[]).map(mapRowToPhenomenon)
  })
}

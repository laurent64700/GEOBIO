import { supabase } from '../lib/supabaseClient'
import type { ContextObject, ContextObjectKind } from '../domain/types'
import { cachedList, cachedWrite } from '../offline/cacheThrough'
import { generateClientId } from '../offline/clientId'
import { getDB } from '../offline/db'
import { SupabaseQueryError } from '../offline/supabaseQueryError'
import { undoableWrite, type UndoableOptions } from '../offline/actionHistory'

export interface CreateContextObjectInput {
  planId: string
  kind: ContextObjectKind
  x: number
  y: number
}

interface ContextObjectRow {
  id: string
  plan_id: string
  kind: ContextObjectKind
  x: number
  y: number
  created_at: string
}

function mapRowToContextObject(row: ContextObjectRow): ContextObject {
  return {
    id: row.id,
    planId: row.plan_id,
    kind: row.kind,
    x: row.x,
    y: row.y,
    createdAt: row.created_at,
  }
}

export async function createContextObject(
  input: CreateContextObjectInput,
  options?: UndoableOptions
): Promise<ContextObject> {
  const id = generateClientId()
  const createdAt = new Date().toISOString()
  const row = { id, plan_id: input.planId, kind: input.kind, x: input.x, y: input.y, created_at: createdAt }
  const item: ContextObject = { id, planId: input.planId, kind: input.kind, x: input.x, y: input.y, createdAt }

  return undoableWrite(input.planId, 'context_object', 'insert', null, () =>
    cachedWrite('context_object', 'context_object', 'insert', item, () => row, async () => {
      const { data, error } = await supabase.from('context_object').insert(row).select().single()

      if (error) throw new SupabaseQueryError(`Impossible d'enregistrer l'objet de contexte : ${error.message}`)
      return mapRowToContextObject(data as ContextObjectRow)
    }),
  options)
}

export async function deleteContextObject(id: string, options?: UndoableOptions): Promise<void> {
  // Read the entity before deleting it — undoableWrite needs the full
  // pre-deletion object as `before`, so undo() can later call
  // restoreContextObject with the exact original state (not just the id).
  const db = await getDB()
  const existing = (await db.get('context_object', id)) as ContextObject | undefined
  if (!existing) {
    throw new Error(`Impossible de supprimer l'objet de contexte : ${id} est introuvable dans le cache local`)
  }

  await undoableWrite(existing.planId, 'context_object', 'delete', existing, () =>
    cachedWrite('context_object', 'context_object', 'delete', { id }, () => ({ id }), async () => {
      const { error } = await supabase.from('context_object').delete().eq('id', id)
      if (error) throw new SupabaseQueryError(`Impossible de supprimer l'objet de contexte : ${error.message}`)
      return { id }
    }),
  options)
}

// Deliberately does NOT accept UndoableOptions / route through undoableWrite,
// unlike createContextObject/deleteContextObject above — this is only ever
// meant to be called by undo()/redo() (a later task), which records its own
// history bookkeeping directly when replaying a restore. Calling this from
// feature code directly would silently bypass undo/redo tracking.
export async function restoreContextObject(item: ContextObject): Promise<ContextObject> {
  const row: ContextObjectRow = {
    id: item.id, plan_id: item.planId, kind: item.kind, x: item.x, y: item.y, created_at: item.createdAt,
  }
  return cachedWrite('context_object', 'context_object', 'insert', item, () => row, async () => {
    const { data, error } = await supabase.from('context_object').insert(row).select().single()
    if (error) throw new SupabaseQueryError(`Impossible de restaurer l'objet de contexte : ${error.message}`)
    return mapRowToContextObject(data as ContextObjectRow)
  })
}

export async function listContextObjectsForPlan(planId: string): Promise<ContextObject[]> {
  return cachedList('context_object', planId, async () => {
    const { data, error } = await supabase.from('context_object').select().eq('plan_id', planId)

    if (error) throw new SupabaseQueryError(`Impossible de charger les objets de contexte : ${error.message}`)
    return (data as ContextObjectRow[]).map(mapRowToContextObject)
  })
}

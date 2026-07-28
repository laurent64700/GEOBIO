import { supabase } from '../lib/supabaseClient'
import type { ContextObject, ContextObjectKind } from '../domain/types'
import { cachedList, cachedWrite } from '../offline/cacheThrough'
import { generateClientId } from '../offline/clientId'
import { SupabaseQueryError } from '../offline/supabaseQueryError'

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

export async function createContextObject(input: CreateContextObjectInput): Promise<ContextObject> {
  const id = generateClientId()
  const createdAt = new Date().toISOString()
  const row = { id, plan_id: input.planId, kind: input.kind, x: input.x, y: input.y, created_at: createdAt }
  const item: ContextObject = { id, planId: input.planId, kind: input.kind, x: input.x, y: input.y, createdAt }

  return cachedWrite('context_object', 'context_object', 'insert', item, () => row, async () => {
    const { data, error } = await supabase.from('context_object').insert(row).select().single()

    if (error) throw new SupabaseQueryError(`Impossible d'enregistrer l'objet de contexte : ${error.message}`)
    return mapRowToContextObject(data as ContextObjectRow)
  })
}

export async function deleteContextObject(id: string): Promise<void> {
  await cachedWrite('context_object', 'context_object', 'delete', { id }, () => ({ id }), async () => {
    const { error } = await supabase.from('context_object').delete().eq('id', id)
    if (error) throw new SupabaseQueryError(`Impossible de supprimer l'objet de contexte : ${error.message}`)
    return { id }
  })
}

export async function listContextObjectsForPlan(planId: string): Promise<ContextObject[]> {
  return cachedList('context_object', planId, async () => {
    const { data, error } = await supabase.from('context_object').select().eq('plan_id', planId)

    if (error) throw new SupabaseQueryError(`Impossible de charger les objets de contexte : ${error.message}`)
    return (data as ContextObjectRow[]).map(mapRowToContextObject)
  })
}

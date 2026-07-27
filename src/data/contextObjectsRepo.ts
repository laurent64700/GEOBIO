import { supabase } from '../lib/supabaseClient'
import type { ContextObject, ContextObjectKind } from '../domain/types'

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
  const { data, error } = await supabase
    .from('context_object')
    .insert({ plan_id: input.planId, kind: input.kind, x: input.x, y: input.y })
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer l'objet de contexte : ${error.message}`)
  return mapRowToContextObject(data as ContextObjectRow)
}

export async function deleteContextObject(id: string): Promise<void> {
  const { error } = await supabase.from('context_object').delete().eq('id', id)
  if (error) throw new Error(`Impossible de supprimer l'objet de contexte : ${error.message}`)
}

export async function listContextObjectsForPlan(planId: string): Promise<ContextObject[]> {
  const { data, error } = await supabase.from('context_object').select().eq('plan_id', planId)

  if (error) throw new Error(`Impossible de charger les objets de contexte : ${error.message}`)
  return (data as ContextObjectRow[]).map(mapRowToContextObject)
}

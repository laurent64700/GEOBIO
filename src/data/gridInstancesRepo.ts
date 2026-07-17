import { supabase } from '../lib/supabaseClient'
import type { GridInstance, GridTemplate } from '../domain/types'

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

export async function createGridInstance(input: CreateGridInstanceInput): Promise<GridInstance> {
  const { data, error } = await supabase
    .from('grid_instance')
    .insert({
      plan_id: input.planId,
      template_snapshot: input.templateSnapshot,
      origin_x: input.originX,
      origin_y: input.originY,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible de créer l'instance de grille : ${error.message}`)
  return mapRowToGridInstance(data as GridInstanceRow)
}

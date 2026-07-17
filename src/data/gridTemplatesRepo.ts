import { supabase } from '../lib/supabaseClient'
import type { GridTemplate } from '../domain/types'

export interface CreateGridTemplateInput {
  name: string
  spacingXM: number
  spacingYM: number
  angleTrueNorthDeg: number
  originOffsetX: number
  originOffsetY: number
}

interface GridTemplateRow {
  id: string
  name: string
  spacing_x_m: number
  spacing_y_m: number
  angle_true_north_deg: number
  origin_offset_x: number
  origin_offset_y: number
}

function mapRowToGridTemplate(row: GridTemplateRow): GridTemplate {
  return {
    id: row.id,
    name: row.name,
    spacingXM: row.spacing_x_m,
    spacingYM: row.spacing_y_m,
    angleTrueNorthDeg: row.angle_true_north_deg,
    originOffsetX: row.origin_offset_x,
    originOffsetY: row.origin_offset_y,
  }
}

export async function createGridTemplate(input: CreateGridTemplateInput): Promise<GridTemplate> {
  const { data, error } = await supabase
    .from('grid_template')
    .insert({
      name: input.name,
      spacing_x_m: input.spacingXM,
      spacing_y_m: input.spacingYM,
      angle_true_north_deg: input.angleTrueNorthDeg,
      origin_offset_x: input.originOffsetX,
      origin_offset_y: input.originOffsetY,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible de créer le gabarit de grille : ${error.message}`)
  return mapRowToGridTemplate(data as GridTemplateRow)
}

export async function listGridTemplates(): Promise<GridTemplate[]> {
  const { data, error } = await supabase.from('grid_template').select()

  if (error) throw new Error(`Impossible de charger les gabarits de grille : ${error.message}`)
  return (data as GridTemplateRow[]).map(mapRowToGridTemplate)
}

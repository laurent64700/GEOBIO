import { supabase } from '../lib/supabaseClient'
import type { GridLine, GridLineFamily, GridLinePolarity, Point } from '../domain/types'

export interface CreateGridLineInput {
  gridInstanceId: string
  family: GridLineFamily
  polarity: GridLinePolarity
  reinforced: boolean
  theoreticalPoints: Point[]
}

interface GridLineRow {
  id: string
  grid_instance_id: string
  family: GridLineFamily
  polarity: GridLinePolarity
  reinforced: boolean
  theoretical_points: Point[]
  adjusted_points: Point[]
}

function mapRowToGridLine(row: GridLineRow): GridLine {
  return {
    id: row.id,
    gridInstanceId: row.grid_instance_id,
    family: row.family,
    polarity: row.polarity,
    reinforced: row.reinforced,
    theoreticalPoints: row.theoretical_points,
    adjustedPoints: row.adjusted_points,
  }
}

export async function createGridLines(inputs: CreateGridLineInput[]): Promise<GridLine[]> {
  const { data, error } = await supabase
    .from('grid_line')
    .insert(
      inputs.map((i) => ({
        grid_instance_id: i.gridInstanceId,
        family: i.family,
        polarity: i.polarity,
        reinforced: i.reinforced,
        theoretical_points: i.theoreticalPoints,
        adjusted_points: i.theoreticalPoints,
      }))
    )
    .select()

  if (error) throw new Error(`Impossible de créer les lignes de grille : ${error.message}`)
  return (data as GridLineRow[]).map(mapRowToGridLine)
}

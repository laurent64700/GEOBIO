import { supabase } from '../lib/supabaseClient'
import type { Phenomenon, PhenomenonKind } from '../domain/types'

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

export async function createPhenomenon(input: CreatePhenomenonInput): Promise<Phenomenon> {
  const { data, error } = await supabase
    .from('phenomenon')
    .insert({ plan_id: input.planId, kind: input.kind, x: input.x, y: input.y })
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer le phénomène : ${error.message}`)
  return mapRowToPhenomenon(data as PhenomenonRow)
}

export async function deletePhenomenon(id: string): Promise<void> {
  const { error } = await supabase.from('phenomenon').delete().eq('id', id)
  if (error) throw new Error(`Impossible de supprimer le phénomène : ${error.message}`)
}

export async function listPhenomenaForPlan(planId: string): Promise<Phenomenon[]> {
  const { data, error } = await supabase.from('phenomenon').select().eq('plan_id', planId)

  if (error) throw new Error(`Impossible de charger les phénomènes : ${error.message}`)
  return (data as PhenomenonRow[]).map(mapRowToPhenomenon)
}

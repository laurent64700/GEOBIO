import { supabase } from '../lib/supabaseClient'
import type { FeltPoint } from '../domain/types'

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

export async function createFeltPoint(input: CreateFeltPointInput): Promise<FeltPoint> {
  const { data, error } = await supabase
    .from('felt_point')
    .insert({ plan_id: input.planId, network_name: input.networkName, x: input.x, y: input.y })
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer le point ressenti : ${error.message}`)
  return mapRowToFeltPoint(data as FeltPointRow)
}

export async function deleteFeltPoint(id: string): Promise<void> {
  const { error } = await supabase.from('felt_point').delete().eq('id', id)
  if (error) throw new Error(`Impossible de supprimer le point ressenti : ${error.message}`)
}

export async function listFeltPointsForPlan(planId: string): Promise<FeltPoint[]> {
  const { data, error } = await supabase.from('felt_point').select().eq('plan_id', planId)

  if (error) throw new Error(`Impossible de charger les points ressentis : ${error.message}`)
  return (data as FeltPointRow[]).map(mapRowToFeltPoint)
}

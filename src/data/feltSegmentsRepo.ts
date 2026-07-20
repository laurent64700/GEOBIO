import { supabase } from '../lib/supabaseClient'
import type { FeltSegment, Point } from '../domain/types'

export interface CreateFeltSegmentInput {
  planId: string
  networkName: string
  pointA: Point
  pointB: Point
}

interface FeltSegmentRow {
  id: string
  plan_id: string
  network_name: string
  ax: number
  ay: number
  bx: number
  by: number
  created_at: string
}

function mapRowToFeltSegment(row: FeltSegmentRow): FeltSegment {
  return {
    id: row.id,
    planId: row.plan_id,
    networkName: row.network_name,
    pointA: { x: row.ax, y: row.ay },
    pointB: { x: row.bx, y: row.by },
    createdAt: row.created_at,
  }
}

export async function createFeltSegment(input: CreateFeltSegmentInput): Promise<FeltSegment> {
  const { data, error } = await supabase
    .from('felt_segment')
    .insert({
      plan_id: input.planId,
      network_name: input.networkName,
      ax: input.pointA.x,
      ay: input.pointA.y,
      bx: input.pointB.x,
      by: input.pointB.y,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer le segment ressenti : ${error.message}`)
  return mapRowToFeltSegment(data as FeltSegmentRow)
}

export async function deleteFeltSegment(id: string): Promise<void> {
  const { error } = await supabase.from('felt_segment').delete().eq('id', id)
  if (error) throw new Error(`Impossible de supprimer le segment ressenti : ${error.message}`)
}

export async function listFeltSegmentsForPlan(planId: string): Promise<FeltSegment[]> {
  const { data, error } = await supabase.from('felt_segment').select().eq('plan_id', planId)

  if (error) throw new Error(`Impossible de charger les segments ressentis : ${error.message}`)
  return (data as FeltSegmentRow[]).map(mapRowToFeltSegment)
}

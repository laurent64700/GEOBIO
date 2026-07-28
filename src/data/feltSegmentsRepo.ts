import { supabase } from '../lib/supabaseClient'
import type { FeltSegment, GridLinePolarity, Point } from '../domain/types'
import { cachedList, cachedWrite } from '../offline/cacheThrough'
import { generateClientId } from '../offline/clientId'
import { SupabaseQueryError } from '../offline/supabaseQueryError'

export interface CreateFeltSegmentInput {
  planId: string
  networkName: string
  pointA: Point
  pointB: Point
  /** Optional — manual placement always provides both, ArUco rod-marker
   * detection (RodDetectionPanel) omits them (see FeltSegment's own doc
   * comment for why). Omitted fields are stored as null. */
  polarityA?: GridLinePolarity
  polarityB?: GridLinePolarity
}

interface FeltSegmentRow {
  id: string
  plan_id: string
  network_name: string
  ax: number
  ay: number
  bx: number
  by: number
  polarity_a: GridLinePolarity | null
  polarity_b: GridLinePolarity | null
  created_at: string
}

function mapRowToFeltSegment(row: FeltSegmentRow): FeltSegment {
  return {
    id: row.id,
    planId: row.plan_id,
    networkName: row.network_name,
    pointA: { x: row.ax, y: row.ay },
    pointB: { x: row.bx, y: row.by },
    polarityA: row.polarity_a,
    polarityB: row.polarity_b,
    createdAt: row.created_at,
  }
}

export async function createFeltSegment(input: CreateFeltSegmentInput): Promise<FeltSegment> {
  const id = generateClientId()
  const createdAt = new Date().toISOString()
  const polarityA = input.polarityA ?? null
  const polarityB = input.polarityB ?? null
  const row = {
    id,
    plan_id: input.planId,
    network_name: input.networkName,
    ax: input.pointA.x,
    ay: input.pointA.y,
    bx: input.pointB.x,
    by: input.pointB.y,
    polarity_a: polarityA,
    polarity_b: polarityB,
    created_at: createdAt,
  }
  const item: FeltSegment = {
    id,
    planId: input.planId,
    networkName: input.networkName,
    pointA: input.pointA,
    pointB: input.pointB,
    polarityA,
    polarityB,
    createdAt,
  }

  return cachedWrite('felt_segment', 'felt_segment', 'insert', item, () => row, async () => {
    const { data, error } = await supabase.from('felt_segment').insert(row).select().single()

    if (error) throw new SupabaseQueryError(`Impossible d'enregistrer le segment ressenti : ${error.message}`)
    return mapRowToFeltSegment(data as FeltSegmentRow)
  })
}

export async function deleteFeltSegment(id: string): Promise<void> {
  await cachedWrite('felt_segment', 'felt_segment', 'delete', { id }, () => ({ id }), async () => {
    const { error } = await supabase.from('felt_segment').delete().eq('id', id)
    if (error) throw new SupabaseQueryError(`Impossible de supprimer le segment ressenti : ${error.message}`)
    return { id }
  })
}

export async function listFeltSegmentsForPlan(planId: string): Promise<FeltSegment[]> {
  return cachedList('felt_segment', planId, async () => {
    const { data, error } = await supabase.from('felt_segment').select().eq('plan_id', planId)

    if (error) throw new SupabaseQueryError(`Impossible de charger les segments ressentis : ${error.message}`)
    return (data as FeltSegmentRow[]).map(mapRowToFeltSegment)
  })
}

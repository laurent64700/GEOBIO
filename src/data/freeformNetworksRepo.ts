import { supabase } from '../lib/supabaseClient'
import type { FreeformNetwork, FreeformNetworkKind, Point } from '../domain/types'
import { cachedList, cachedWrite } from '../offline/cacheThrough'
import { generateClientId } from '../offline/clientId'
import { SupabaseQueryError } from '../offline/supabaseQueryError'

export interface CreateFreeformNetworkInput {
  planId: string
  kind: FreeformNetworkKind
  points: Point[]
  currentBearingDeg: number | null
  depthM: number | null
  flowRate: string | null
}

interface FreeformNetworkRow {
  id: string
  plan_id: string
  kind: FreeformNetworkKind
  points: Point[]
  current_bearing_deg: number | null
  depth_m: number | null
  flow_rate: string | null
  created_at: string
}

function mapRowToFreeformNetwork(row: FreeformNetworkRow): FreeformNetwork {
  return {
    id: row.id,
    planId: row.plan_id,
    kind: row.kind,
    points: row.points,
    currentBearingDeg: row.current_bearing_deg,
    depthM: row.depth_m,
    flowRate: row.flow_rate,
    createdAt: row.created_at,
  }
}

export async function createFreeformNetwork(input: CreateFreeformNetworkInput): Promise<FreeformNetwork> {
  const id = generateClientId()
  const createdAt = new Date().toISOString()
  const row = {
    id,
    plan_id: input.planId,
    kind: input.kind,
    points: input.points,
    current_bearing_deg: input.currentBearingDeg,
    depth_m: input.depthM,
    flow_rate: input.flowRate,
    created_at: createdAt,
  }
  const item: FreeformNetwork = {
    id,
    planId: input.planId,
    kind: input.kind,
    points: input.points,
    currentBearingDeg: input.currentBearingDeg,
    depthM: input.depthM,
    flowRate: input.flowRate,
    createdAt,
  }

  return cachedWrite('freeform_network', 'freeform_network', 'insert', item, () => row, async () => {
    const { data, error } = await supabase.from('freeform_network').insert(row).select().single()

    if (error) throw new SupabaseQueryError(`Impossible d'enregistrer le tracé : ${error.message}`)
    return mapRowToFreeformNetwork(data as FreeformNetworkRow)
  })
}

export async function listFreeformNetworksForPlan(planId: string): Promise<FreeformNetwork[]> {
  return cachedList('freeform_network', planId, async () => {
    const { data, error } = await supabase.from('freeform_network').select().eq('plan_id', planId)
    if (error) throw new SupabaseQueryError(`Impossible de charger les tracés : ${error.message}`)
    return (data as FreeformNetworkRow[]).map(mapRowToFreeformNetwork)
  })
}

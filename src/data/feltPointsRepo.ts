import { supabase } from '../lib/supabaseClient'
import type { FeltPoint } from '../domain/types'
import { cachedList, cachedWrite } from '../offline/cacheThrough'
import { generateClientId } from '../offline/clientId'
import { SupabaseQueryError } from '../offline/supabaseQueryError'

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
  const id = generateClientId()
  const createdAt = new Date().toISOString()
  const row = {
    id,
    plan_id: input.planId,
    network_name: input.networkName,
    x: input.x,
    y: input.y,
    created_at: createdAt,
  }
  const item: FeltPoint = {
    id,
    planId: input.planId,
    networkName: input.networkName,
    x: input.x,
    y: input.y,
    createdAt,
  }

  return cachedWrite('felt_point', 'felt_point', 'insert', item, () => row, async () => {
    const { data, error } = await supabase.from('felt_point').insert(row).select().single()

    if (error) throw new SupabaseQueryError(`Impossible d'enregistrer le point ressenti : ${error.message}`)
    return mapRowToFeltPoint(data as FeltPointRow)
  })
}

export async function deleteFeltPoint(id: string): Promise<void> {
  await cachedWrite('felt_point', 'felt_point', 'delete', { id }, () => ({ id }), async () => {
    const { error } = await supabase.from('felt_point').delete().eq('id', id)
    if (error) throw new SupabaseQueryError(`Impossible de supprimer le point ressenti : ${error.message}`)
    return { id }
  })
}

export async function listFeltPointsForPlan(planId: string): Promise<FeltPoint[]> {
  return cachedList('felt_point', planId, async () => {
    const { data, error } = await supabase.from('felt_point').select().eq('plan_id', planId)

    if (error) throw new SupabaseQueryError(`Impossible de charger les points ressentis : ${error.message}`)
    return (data as FeltPointRow[]).map(mapRowToFeltPoint)
  })
}

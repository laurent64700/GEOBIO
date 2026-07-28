import { supabase } from '../lib/supabaseClient'
import type { Phenomenon, PhenomenonKind } from '../domain/types'
import { cachedList, cachedWrite } from '../offline/cacheThrough'
import { generateClientId } from '../offline/clientId'
import { SupabaseQueryError } from '../offline/supabaseQueryError'

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
  const id = generateClientId()
  const createdAt = new Date().toISOString()
  const row = { id, plan_id: input.planId, kind: input.kind, x: input.x, y: input.y, created_at: createdAt }
  const item: Phenomenon = { id, planId: input.planId, kind: input.kind, x: input.x, y: input.y, createdAt }

  return cachedWrite('phenomenon', 'phenomenon', 'insert', item, () => row, async () => {
    const { data, error } = await supabase.from('phenomenon').insert(row).select().single()

    if (error) throw new SupabaseQueryError(`Impossible d'enregistrer le phénomène : ${error.message}`)
    return mapRowToPhenomenon(data as PhenomenonRow)
  })
}

export async function deletePhenomenon(id: string): Promise<void> {
  await cachedWrite('phenomenon', 'phenomenon', 'delete', { id }, () => ({ id }), async () => {
    const { error } = await supabase.from('phenomenon').delete().eq('id', id)
    if (error) throw new SupabaseQueryError(`Impossible de supprimer le phénomène : ${error.message}`)
    return { id }
  })
}

export async function listPhenomenaForPlan(planId: string): Promise<Phenomenon[]> {
  return cachedList('phenomenon', planId, async () => {
    const { data, error } = await supabase.from('phenomenon').select().eq('plan_id', planId)

    if (error) throw new SupabaseQueryError(`Impossible de charger les phénomènes : ${error.message}`)
    return (data as PhenomenonRow[]).map(mapRowToPhenomenon)
  })
}

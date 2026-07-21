// src/data/plansRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { AffineTransform, Plan, PlanKind } from '../domain/types'

export interface CreatePlanInput {
  missionId: string
  kind: PlanKind
  imageUrl?: string | null
  calibration?: AffineTransform | null
}

interface PlanRow {
  id: string
  mission_id: string
  kind: PlanKind
  image_url: string | null
  calibration: AffineTransform | null
}

function mapRowToPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    missionId: row.mission_id,
    kind: row.kind,
    imageUrl: row.image_url,
    calibration: row.calibration,
  }
}

export async function createPlan(input: CreatePlanInput): Promise<Plan> {
  const { data, error } = await supabase
    .from('plan')
    .insert({
      mission_id: input.missionId,
      kind: input.kind,
      image_url: input.imageUrl ?? null,
      calibration: input.calibration ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible de créer le plan : ${error.message}`)
  return mapRowToPlan(data as PlanRow)
}

export async function listPlansForMission(missionId: string): Promise<Plan[]> {
  const { data, error } = await supabase.from('plan').select().eq('mission_id', missionId)

  if (error) throw new Error(`Impossible de charger les plans : ${error.message}`)
  return (data as PlanRow[]).map(mapRowToPlan)
}

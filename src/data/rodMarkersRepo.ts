// src/data/rodMarkersRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { RodMarker } from '../domain/types'

export interface CreateRodMarkerInput {
  markerId: number
  networkName: string
  rodNumber: number
}

interface RodMarkerRow {
  marker_id: number
  network_name: string
  rod_number: number
}

function mapRowToRodMarker(row: RodMarkerRow): RodMarker {
  return { markerId: row.marker_id, networkName: row.network_name, rodNumber: row.rod_number }
}

export async function createRodMarker(input: CreateRodMarkerInput): Promise<RodMarker> {
  const { data, error } = await supabase
    .from('rod_marker')
    .insert({ marker_id: input.markerId, network_name: input.networkName, rod_number: input.rodNumber })
    .select()
    .single()

  if (error) throw new Error(`Impossible de créer l'association marqueur/réseau : ${error.message}`)
  return mapRowToRodMarker(data as RodMarkerRow)
}

export async function listRodMarkers(): Promise<RodMarker[]> {
  const { data, error } = await supabase.from('rod_marker').select()
  if (error) throw new Error(`Impossible de charger les associations marqueur/réseau : ${error.message}`)
  return (data as RodMarkerRow[]).map(mapRowToRodMarker)
}

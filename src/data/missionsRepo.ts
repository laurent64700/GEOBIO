// src/data/missionsRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { Mission } from '../domain/types'

export interface CreateMissionInput {
  address: string
  missionDate: string // ISO date, e.g. '2026-07-20'
  declinationDeg?: number | null
}

interface MissionRow {
  id: string
  address: string
  mission_date: string
  declination_deg: number | null
  origin_lat: number | null
  origin_lng: number | null
}

function mapRowToMission(row: MissionRow): Mission {
  return {
    id: row.id,
    address: row.address,
    missionDate: row.mission_date,
    declinationDeg: row.declination_deg,
    originLat: row.origin_lat,
    originLng: row.origin_lng,
  }
}

export async function createMission(input: CreateMissionInput): Promise<Mission> {
  const { data, error } = await supabase
    .from('mission')
    .insert({
      address: input.address,
      mission_date: input.missionDate,
      declination_deg: input.declinationDeg ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible de créer la mission : ${error.message}`)
  return mapRowToMission(data as MissionRow)
}

export async function listMissions(): Promise<Mission[]> {
  const { data, error } = await supabase
    .from('mission')
    .select()
    .order('mission_date', { ascending: false })

  if (error) throw new Error(`Impossible de charger les missions : ${error.message}`)
  return (data as MissionRow[]).map(mapRowToMission)
}

export async function setMissionOrigin(
  missionId: string,
  origin: { lat: number; lng: number }
): Promise<Mission> {
  const { data, error } = await supabase
    .from('mission')
    .update({ origin_lat: origin.lat, origin_lng: origin.lng })
    .eq('id', missionId)
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer l'origine de la mission : ${error.message}`)
  return mapRowToMission(data as MissionRow)
}

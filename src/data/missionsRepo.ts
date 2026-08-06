// src/data/missionsRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { Mission, Plan, Point } from '../domain/types'
import { createPlan } from './plansRepo'

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
  cause_architectural: number | null
  cause_electromagnetique: number | null
  cause_geobiologique: number | null
  cause_paranormale: number | null
  cause_autres: number | null
  bovis_rate: number | null
  parcel_refs: string[]
  building_footprint: Point[] | null
}

function mapRowToMission(row: MissionRow): Mission {
  return {
    id: row.id,
    address: row.address,
    missionDate: row.mission_date,
    declinationDeg: row.declination_deg,
    originLat: row.origin_lat,
    originLng: row.origin_lng,
    causeArchitectural: row.cause_architectural,
    causeElectromagnetique: row.cause_electromagnetique,
    causeGeobiologique: row.cause_geobiologique,
    causeParanormale: row.cause_paranormale,
    causeAutres: row.cause_autres,
    bovisRate: row.bovis_rate,
    parcelRefs: row.parcel_refs,
    buildingFootprint: row.building_footprint,
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

export interface GlobalAssessmentInput {
  causeArchitectural: number
  causeElectromagnetique: number
  causeGeobiologique: number
  causeParanormale: number
  causeAutres: number
  bovisRate: number
}

export async function setGlobalAssessment(
  missionId: string,
  input: GlobalAssessmentInput
): Promise<Mission> {
  const { data, error } = await supabase
    .from('mission')
    .update({
      cause_architectural: input.causeArchitectural,
      cause_electromagnetique: input.causeElectromagnetique,
      cause_geobiologique: input.causeGeobiologique,
      cause_paranormale: input.causeParanormale,
      cause_autres: input.causeAutres,
      bovis_rate: input.bovisRate,
    })
    .eq('id', missionId)
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer les mesures globales : ${error.message}`)
  return mapRowToMission(data as MissionRow)
}

export async function setSelectedParcels(missionId: string, parcelRefs: string[]): Promise<Mission> {
  const { data, error } = await supabase
    .from('mission')
    .update({ parcel_refs: parcelRefs })
    .eq('id', missionId)
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer les parcelles sélectionnées : ${error.message}`)
  return mapRowToMission(data as MissionRow)
}

export async function setBuildingFootprint(missionId: string, footprint: Point[]): Promise<Mission> {
  const { data, error } = await supabase
    .from('mission')
    .update({ building_footprint: footprint })
    .eq('id', missionId)
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer le contour du bâtiment : ${error.message}`)
  return mapRowToMission(data as MissionRow)
}

// Duplicates the mission SHELL only — address, declination, parcel refs,
// building footprint — plus a fresh empty exterior plan. Deliberately does
// NOT copy origin lat/lng, the 5 cause values/Bovis rate, or any survey data
// (felt points/segments/phenomena/context objects/grids/freeform
// traces/photos): the use case is "same site, new visit" (a follow-up
// survey), not an exact clone of one specific day's readings.
export async function duplicateMission(source: Mission): Promise<{ mission: Mission; exteriorPlan: Plan }> {
  const mission = await createMission({
    address: source.address,
    // Today's date, NOT source.missionDate — a duplicate defaults to "same
    // site, new visit," and copying the source's original date verbatim
    // would make a same-day duplicate indistinguishable from the source in
    // MissionList (which renders `${address} — ${missionDate}`). Closes
    // spec §4's open "quel nom par défaut proposer" question.
    missionDate: new Date().toISOString().slice(0, 10),
    declinationDeg: source.declinationDeg,
  })
  // parcelRefs/buildingFootprint aren't part of CreateMissionInput (createMission
  // only accepts address/missionDate/declinationDeg) — set them via the existing
  // setters, matching how the rest of this file already builds up a Mission
  // incrementally after creation (see setSelectedParcels/setBuildingFootprint).
  const withParcels = source.parcelRefs.length > 0
    ? await setSelectedParcels(mission.id, source.parcelRefs)
    : mission
  const final = source.buildingFootprint !== null
    ? await setBuildingFootprint(withParcels.id, source.buildingFootprint)
    : withParcels
  const exteriorPlan = await createPlan({ missionId: final.id, kind: 'exterieur' })
  return { mission: final, exteriorPlan }
}

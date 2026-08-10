// src/data/missionsRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { Mission, Plan, Point, StoredParcel } from '../domain/types'
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
  selected_parcels_geometry: StoredParcel[] | null
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
    selectedParcelsGeometry: row.selected_parcels_geometry,
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

// `geometry` is optional (not just nullable) so callers that only have the
// ids on hand — duplicateMission, when its source mission predates this
// field — can update parcel_refs alone without wiping out an
// already-persisted selected_parcels_geometry with an accidental null.
// Passing `null` explicitly (a real "no geometry" case) DOES clear it.
export async function setSelectedParcels(
  missionId: string,
  parcelRefs: string[],
  geometry?: StoredParcel[] | null
): Promise<Mission> {
  const update: { parcel_refs: string[]; selected_parcels_geometry?: StoredParcel[] | null } = {
    parcel_refs: parcelRefs,
  }
  if (geometry !== undefined) update.selected_parcels_geometry = geometry

  const { data, error } = await supabase
    .from('mission')
    .update(update)
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
    ? await setSelectedParcels(mission.id, source.parcelRefs, source.selectedParcelsGeometry)
    : mission
  const final = source.buildingFootprint !== null
    ? await setBuildingFootprint(withParcels.id, source.buildingFootprint)
    : withParcels
  const exteriorPlan = await createPlan({ missionId: final.id, kind: 'exterieur' })
  return { mission: final, exteriorPlan }
}

// Both buckets key their files under `${missionId}/...` (see
// missionPhotosRepo.ts's missionPhotoPath / planImageStorage.ts's
// planImagePath) — bucket names are duplicated here as literals rather than
// importing BUCKET from those 2 files, since neither exports it and this is
// the only place outside them that needs the name.
async function cleanUpMissionStorage(missionId: string): Promise<void> {
  for (const bucket of ['mission-photos', 'plans']) {
    const { data: entries } = await supabase.storage.from(bucket).list(missionId)
    if (!entries || entries.length === 0) continue
    const paths = entries.map((entry) => `${missionId}/${entry.name}`)
    await supabase.storage.from(bucket).remove(paths)
  }
}

// Deletes the mission row — its `on delete cascade` FKs remove everything
// that references mission_id/plan_id in the database (plans, felt points,
// segments, grids, phenomena, context objects, photo rows...). Storage
// files (actual photo/plan-image binaries, not DB rows) are NOT covered by
// that cascade — cleaned up here separately, best-effort, AFTER the DB
// delete succeeds. The DB delete is the critical, atomic step (the mission
// is genuinely gone once it resolves); a Storage cleanup failure afterward
// is deliberately swallowed, not surfaced as an error — the action the user
// asked for (delete the mission) already succeeded. See design spec §5bis
// for the full reasoning, including why this order (DB-then-Storage) and
// not the reverse.
export async function deleteMission(id: string): Promise<void> {
  const { error } = await supabase.from('mission').delete().eq('id', id)
  if (error) throw new Error(`Impossible de supprimer la mission : ${error.message}`)

  try {
    await cleanUpMissionStorage(id)
  } catch {
    // Best-effort — see doc comment above. Deliberately no rethrow, no log:
    // this project has no logging infrastructure beyond the browser console,
    // and a console.error here would be indistinguishable from a real bug to
    // Laurent glancing at devtools during unrelated debugging.
  }
}

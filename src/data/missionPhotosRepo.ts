// src/data/missionPhotosRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { AffineTransform, MissionPhoto } from '../domain/types'

const BUCKET = 'mission-photos'
// Bucket 'mission-photos' is private, for consistency with the 'plans' bucket
// (see planImageStorage.ts) — aerial photos of a property are RGPD-sensitive
// in the same way interior plan photos are. 1 an : même compromis que
// planImageStorage.ts (URL signée longue durée, non permanente ; à revoir si
// la couche d'affichage doit re-signer à la lecture).
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 365

interface MissionPhotoRow {
  id: string
  mission_id: string
  image_url: string
  calibration: AffineTransform | null
  created_at: string
}

function mapRowToMissionPhoto(row: MissionPhotoRow): MissionPhoto {
  return {
    id: row.id,
    missionId: row.mission_id,
    imageUrl: row.image_url,
    calibration: row.calibration,
    createdAt: row.created_at,
  }
}

// Unlike planImageStorage.ts's fixed 'interior-plan' name (justified there by
// there only ever being one interior plan per mission), a mission can have
// many aerial photos, so a fixed name would collide. We keep the original
// extension (same regex approach as planImagePath) but replace the unreliable
// original base name — which may contain spaces/accents from a phone/camera
// upload, e.g. "Photo été 2026.jpg" — with a random UUID, making collisions
// effectively impossible without needing to inspect existing objects.
function missionPhotoPath(missionId: string, fileName: string): string {
  const match = /\.[^./\\]+$/.exec(fileName)
  const extension = match ? match[0].toLowerCase() : ''
  return `${missionId}/${crypto.randomUUID()}${extension}`
}

export async function addMissionPhoto(missionId: string, file: File): Promise<MissionPhoto> {
  const path = missionPhotoPath(missionId, file.name)
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
  if (uploadError) throw new Error(`Impossible d'envoyer la photo : ${uploadError.message}`)

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS)

  if (signError || !data) {
    throw new Error(`Impossible de générer le lien de la photo : ${signError?.message ?? 'erreur inconnue'}`)
  }

  const { data: row, error } = await supabase
    .from('mission_photo')
    .insert({ mission_id: missionId, image_url: data.signedUrl })
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer la photo : ${error.message}`)
  return mapRowToMissionPhoto(row as MissionPhotoRow)
}

export async function setPhotoCalibration(
  photoId: string,
  calibration: AffineTransform
): Promise<MissionPhoto> {
  const { data, error } = await supabase
    .from('mission_photo')
    .update({ calibration })
    .eq('id', photoId)
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer le calage de la photo : ${error.message}`)
  return mapRowToMissionPhoto(data as MissionPhotoRow)
}

export async function listMissionPhotos(missionId: string): Promise<MissionPhoto[]> {
  const { data, error } = await supabase.from('mission_photo').select().eq('mission_id', missionId)
  if (error) throw new Error(`Impossible de charger les photos : ${error.message}`)
  return (data as MissionPhotoRow[]).map(mapRowToMissionPhoto)
}

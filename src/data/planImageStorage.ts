// src/data/planImageStorage.ts
import { supabase } from '../lib/supabaseClient'

const BUCKET = 'plans'
// Bucket 'plans' is private (photos de plans intérieurs = données RGPD-sensibles).
// 1 an : un bucket privé exige un token d'URL signée valide pour l'accès (contrairement
// à l'ancienne approche bucket public, qui reposait sur un chemin non devinable). Une
// longue durée évite de re-signer à chaque affichage, mais rend cette URL non permanente :
// elle cessera silencieusement de fonctionner passé ce délai, sauf si quelque chose la
// re-signe plus tard. À revoir si la couche d'affichage doit re-signer à la lecture
// (par ex. en stockant le chemin de l'objet plutôt qu'une URL signée complète).
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 365

// file.name comes straight from the user's phone/camera (French property
// owners uploading photos) and can contain spaces, accents, or other
// characters that are unreliable in Supabase Storage object keys (e.g.
// "plan intérieur.jpg", "Photo été 2026.jpg"). Rather than slugify an
// arbitrary original name — which still leaves a filename-collision
// question if two uploads slugify to the same key — we use a fixed,
// deterministic name per mission: the domain model allows only one
// 'interieur' plan per mission (see PlanKind in src/domain/types.ts), so
// there is never more than one interior plan image to name. Combined with
// upload's { upsert: true }, this makes re-uploads for the same mission
// cleanly replace the previous image instead of risking an unexpected
// normalized-name collision with a *different* file.
function planImagePath(missionId: string, fileName: string): string {
  const match = /\.[^./\\]+$/.exec(fileName)
  const extension = match ? match[0].toLowerCase() : ''
  return `${missionId}/interior-plan${extension}`
}

export async function uploadPlanImage(missionId: string, file: File): Promise<string> {
  const path = planImagePath(missionId, file.name)
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })

  if (uploadError) throw new Error(`Impossible d'envoyer l'image du plan : ${uploadError.message}`)

  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS)

  if (signError || !data) {
    throw new Error(`Impossible de générer le lien de l'image du plan : ${signError?.message ?? 'erreur inconnue'}`)
  }

  return data.signedUrl
}

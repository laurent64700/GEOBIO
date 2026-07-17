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

export async function uploadPlanImage(missionId: string, file: File): Promise<string> {
  const path = `${missionId}/${file.name}`
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

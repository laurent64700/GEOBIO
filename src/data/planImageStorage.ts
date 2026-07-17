// src/data/planImageStorage.ts
import { supabase } from '../lib/supabaseClient'

const BUCKET = 'plans'
// Bucket 'plans' is private (photos de plans intérieurs = données RGPD-sensibles).
// URL signée longue durée (1 an) : stockée dans plan.image_url et affichée à chaque
// consultation du plan ; le bucket privé rend l'URL non devinable/énumérable, donc
// pas besoin de la re-signer à chaque affichage. À revoir si un signing à la demande
// (plus court, re-signé côté serveur) devient nécessaire.
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

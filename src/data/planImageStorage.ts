// src/data/planImageStorage.ts
import { supabase } from '../lib/supabaseClient'

const BUCKET = 'plans'

export async function uploadPlanImage(missionId: string, file: File): Promise<string> {
  const path = `${missionId}/${file.name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })

  if (error) throw new Error(`Impossible d'envoyer l'image du plan : ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

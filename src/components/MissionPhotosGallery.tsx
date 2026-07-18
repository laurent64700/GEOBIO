// src/components/MissionPhotosGallery.tsx
import { useEffect, useState } from 'react'
import { addMissionPhoto, listMissionPhotos } from '../data/missionPhotosRepo'
import type { MissionPhoto } from '../domain/types'

export interface MissionPhotosGalleryProps {
  missionId: string
}

export function MissionPhotosGallery({ missionId }: MissionPhotosGalleryProps) {
  const [photos, setPhotos] = useState<MissionPhoto[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listMissionPhotos(missionId)
      .then(setPhotos)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [missionId])

  async function handleFileChosen(file: File) {
    try {
      const photo = await addMissionPhoto(missionId, file)
      setPhotos((prev) => [...prev, photo])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      <label>
        Ajouter une photo (vue de haut)
        <input
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && handleFileChosen(e.target.files[0])}
        />
      </label>
      <div>
        {photos.map((photo) => (
          <img key={photo.id} src={photo.imageUrl} alt="Photo aérienne de la mission" style={{ maxWidth: 200 }} />
        ))}
      </div>
    </div>
  )
}

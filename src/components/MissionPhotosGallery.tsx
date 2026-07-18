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
    setError(null)
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
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Reset the input so re-selecting the same file (e.g. retrying
            // after a failed upload on a flaky field connection) still fires
            // a change event — browsers don't fire one for an unchanged value.
            e.target.value = ''
            if (file) handleFileChosen(file)
          }}
        />
      </label>
      <div>
        {photos.map((photo) => (
          <img
            key={photo.id}
            src={photo.imageUrl}
            alt="Photo aérienne de la mission"
            loading="lazy"
            style={{ maxWidth: 200 }}
          />
        ))}
      </div>
    </div>
  )
}

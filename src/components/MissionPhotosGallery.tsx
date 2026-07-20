// src/components/MissionPhotosGallery.tsx
import { useEffect, useState } from 'react'
import { addMissionPhoto, listMissionPhotos } from '../data/missionPhotosRepo'
import { RodDetectionPanel } from './RodDetectionPanel'
import type { MissionPhoto } from '../domain/types'
import type { LatLng } from '../geometry/localCoordinates'

export interface MissionPhotosGalleryProps {
  missionId: string
  /** The mission's exterior Plan id — detected rod markers become FeltPoints on it. */
  planId: string
  missionOrigin: LatLng
}

export function MissionPhotosGallery({ missionId, planId, missionOrigin }: MissionPhotosGalleryProps) {
  const [photos, setPhotos] = useState<MissionPhoto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)

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

  function handlePhotoCalibrated(updated: MissionPhoto) {
    // Keep the panel open on the now-calibrated photo so detection can follow
    // immediately, without reselecting it from the gallery.
    setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  const selectedPhoto = photos.find((p) => p.id === selectedPhotoId) ?? null

  if (selectedPhoto) {
    return (
      <div>
        <button onClick={() => setSelectedPhotoId(null)}>Retour à la galerie</button>
        <RodDetectionPanel
          photo={selectedPhoto}
          planId={planId}
          missionOrigin={missionOrigin}
          mapCenter={[missionOrigin.lat, missionOrigin.lng]}
          onCalibrated={handlePhotoCalibrated}
        />
      </div>
    )
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
          <figure key={photo.id} style={{ display: 'inline-block', margin: 8 }}>
            <img
              src={photo.imageUrl}
              alt="Photo aérienne de la mission"
              loading="lazy"
              style={{ maxWidth: 200 }}
            />
            <figcaption>
              <button onClick={() => setSelectedPhotoId(photo.id)}>Détecter les tiges</button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

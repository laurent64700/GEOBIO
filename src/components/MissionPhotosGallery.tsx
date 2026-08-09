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
      {/* Small clickable thumbnails, not full-size previews — these photos
          are only an input to "Détecter les tiges" (their rod detections get
          reported onto the plan as FeltPoints/FeltSegments); there's no need
          to inspect them at size once uploaded. Previously maxWidth: 200
          with no height cap, unconstrained and inline — 2+ photos routinely
          pushed the map (which needs most of the screen) into a sliver at
          the top. Reported by Laurent from live field testing. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((photo) => (
          <figure key={photo.id} style={{ margin: 0, textAlign: 'center' as const }}>
            <button onClick={() => setSelectedPhotoId(photo.id)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
              <img
                src={photo.imageUrl}
                alt="Photo aérienne de la mission"
                loading="lazy"
                style={{ width: 80, height: 80, objectFit: 'cover' as const, display: 'block', border: '1px solid #ccc', borderRadius: 4 }}
              />
            </button>
            <figcaption style={{ fontSize: 11 }}>
              <button onClick={() => setSelectedPhotoId(photo.id)}>Détecter les tiges</button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

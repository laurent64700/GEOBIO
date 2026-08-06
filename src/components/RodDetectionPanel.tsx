// src/components/RodDetectionPanel.tsx
import { useState } from 'react'
import { PlanCalibrationTool } from './PlanCalibrationTool'
import { detectMarkers } from '../vision/arucoDetector'
import { mapDetectionsToPoints, pairIntoSegmentsAndPoints } from '../vision/arucoMapping'
import { listRodMarkers } from '../data/rodMarkersRepo'
import { setPhotoCalibration } from '../data/missionPhotosRepo'
import { createFeltPoint } from '../data/feltPointsRepo'
import { createFeltSegment } from '../data/feltSegmentsRepo'
import type { AffineTransform, MissionPhoto } from '../domain/types'
import type { LatLng } from '../geometry/localCoordinates'

export interface RodDetectionPanelProps {
  photo: MissionPhoto
  planId: string
  missionOrigin: LatLng
  mapCenter: [number, number]
  onCalibrated: (photo: MissionPhoto) => void
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    // Required for arucoDetector's ctx.getImageData() to succeed: photo.imageUrl
    // points at Supabase Storage, a different origin than the app itself, and an
    // <img> loaded cross-origin without this taints the canvas it's drawn to —
    // getImageData then throws SecurityError instead of returning pixel data.
    // Supabase Storage serves public buckets with permissive CORS headers, so
    // 'anonymous' (no credentials sent) is sufficient.
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Impossible de charger l'image pour la détection."))
    image.src = url
  })
}

export function RodDetectionPanel({
  photo,
  planId,
  missionOrigin,
  mapCenter,
  onCalibrated,
}: RodDetectionPanelProps) {
  const [detecting, setDetecting] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCalibrated(calibration: AffineTransform) {
    try {
      const updated = await setPhotoCalibration(photo.id, calibration)
      onCalibrated(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDetect() {
    if (!photo.calibration) return
    setDetecting(true)
    setError(null)
    setSummary(null)
    try {
      const image = await loadImage(photo.imageUrl)
      const detections = detectMarkers(image)
      const rodMarkers = await listRodMarkers()
      const { recognized, totalDetected, totalRecognized } = mapDetectionsToPoints(
        detections,
        photo.calibration,
        rodMarkers
      )
      const { segments, points } = pairIntoSegmentsAndPoints(recognized)

      await Promise.all([
        ...points.map((point) =>
          createFeltPoint({ planId, networkName: point.networkName, x: point.x, y: point.y })
        ),
        ...segments.map((segment) =>
          createFeltSegment({
            planId,
            networkName: segment.networkName,
            pointA: segment.pointA,
            pointB: segment.pointB,
          })
        ),
      ])

      setSummary(
        `${totalDetected} marqueurs détectés, ${totalRecognized} reconnus ` +
          `(${segments.length} tiges complètes, ${points.length} points isolés).`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDetecting(false)
    }
  }

  if (!photo.calibration) {
    return (
      <div>
        {error && <p role="alert">{error}</p>}
        <PlanCalibrationTool
          imageUrl={photo.imageUrl}
          missionOrigin={missionOrigin}
          mapCenter={mapCenter}
          onCalibrated={handleCalibrated}
        />
      </div>
    )
  }

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {summary && <p>{summary}</p>}
      <button onClick={handleDetect} disabled={detecting}>
        {detecting ? 'Détection en cours…' : 'Détecter les tiges'}
      </button>
    </div>
  )
}

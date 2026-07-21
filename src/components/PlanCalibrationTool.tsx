import { useState, type MouseEvent } from 'react'
import { MapView } from './MapView'
import { calibratePlan, CalibrationError, type ControlPoint } from '../geometry/calibration'
import { latLngToLocal, type LatLng } from '../geometry/localCoordinates'
import type { AffineTransform, Point } from '../domain/types'

/**
 * Converts a click's viewport (client) position on a possibly-scaled `<img>`
 * into a coordinate in the image's natural (full-resolution) pixel space —
 * calibration must be independent of how large the browser happens to be
 * displaying the image.
 */
export function clientPositionToNaturalImagePoint(
  img: Pick<HTMLImageElement, 'naturalWidth' | 'naturalHeight'>,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  client: { x: number; y: number }
): Point {
  const scaleX = img.naturalWidth / rect.width
  const scaleY = img.naturalHeight / rect.height
  return {
    x: (client.x - rect.left) * scaleX,
    y: (client.y - rect.top) * scaleY,
  }
}

export interface PlanCalibrationToolProps {
  imageUrl: string
  missionOrigin: LatLng
  mapCenter: [number, number]
  onCalibrated: (calibration: AffineTransform) => void
}

const MAX_CONTROL_POINTS = 4 // spec §3.1: "2 à 4 points de contrôle"

// MapView's root element is styled height: '100%', which resolves against its
// parent's actual (not content-derived) height. Every wrapper that directly
// contains a <MapView> must therefore give it an explicit concrete height, or
// the map collapses to ~0px in a real browser (invisible in tests, where
// MapView is always mocked to a placeholder div). Matches the pattern used in
// MissionWorkspace.tsx.
const MAP_WRAPPER_STYLE = { height: 400 }

export function PlanCalibrationTool({
  imageUrl,
  missionOrigin,
  mapCenter,
  onCalibrated,
}: PlanCalibrationToolProps) {
  const [points, setPoints] = useState<ControlPoint[]>([])
  const [pendingImagePoint, setPendingImagePoint] = useState<Point | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleImageClick(e: MouseEvent<HTMLImageElement>) {
    if (points.length >= MAX_CONTROL_POINTS) return
    const img = e.currentTarget
    const rect = img.getBoundingClientRect()
    const image = clientPositionToNaturalImagePoint(img, rect, { x: e.clientX, y: e.clientY })
    setPendingImagePoint(image)
    setError(null)
  }

  function handleMapClick(latlng: LatLng) {
    if (!pendingImagePoint) return
    const real = latLngToLocal(latlng, missionOrigin)
    setPoints((prev) => [...prev, { image: pendingImagePoint, real }])
    setPendingImagePoint(null)
  }

  function handleValidate() {
    try {
      onCalibrated(calibratePlan(points))
    } catch (err) {
      setError(err instanceof CalibrationError ? err.message : String(err))
    }
  }

  function handleUndoLastPoint() {
    setPoints((prev) => prev.slice(0, -1))
    setPendingImagePoint(null)
    setError(null)
  }

  return (
    <div>
      <p>
        {pendingImagePoint
          ? 'Cliquez maintenant sur la carte, au même endroit réel.'
          : points.length >= MAX_CONTROL_POINTS
            ? `Maximum de ${MAX_CONTROL_POINTS} points atteint — validez ou retirez un point.`
            : `Cliquez un point du plan (${points.length} point(s) posé(s), 2 minimum, ${MAX_CONTROL_POINTS} maximum).`}
      </p>
      <img
        src={imageUrl}
        alt="Plan intérieur à caler"
        onClick={handleImageClick}
        style={{ maxWidth: '100%' }}
      />
      <div style={MAP_WRAPPER_STYLE}>
        <MapView center={mapCenter} onMapClick={handleMapClick} />
      </div>
      {error && <p role="alert">{error}</p>}
      {points.length > 0 && (
        <button onClick={handleUndoLastPoint}>Retirer le dernier point</button>
      )}
      <button onClick={handleValidate} disabled={points.length < 2}>
        Valider le calage ({points.length} points)
      </button>
    </div>
  )
}

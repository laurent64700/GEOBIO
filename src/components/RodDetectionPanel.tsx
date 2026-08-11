// src/components/RodDetectionPanel.tsx
import { useEffect, useState } from 'react'
import { MapView } from './MapView'
import { detectMarkers } from '../vision/arucoDetector'
import {
  mapDetectionsToPoints,
  pairIntoSegmentsAndPoints,
  type FeltSegmentCandidate,
  type RawMarkerDetection,
} from '../vision/arucoMapping'
import {
  groupRodsInPixelSpace,
  deriveScale,
  deriveRotation,
  buildAffineTransform,
} from '../vision/rodPhotoCalibration'
import { allowedBearingsForNetwork } from '../domain/networkBearings'
import { listRodMarkers } from '../data/rodMarkersRepo'
import { createFeltPoint, deleteFeltPoint } from '../data/feltPointsRepo'
import { createFeltSegment, deleteFeltSegment } from '../data/feltSegmentsRepo'
import type { MissionPhoto, Point, RodMarker } from '../domain/types'
import { latLngToLocal, type LatLng } from '../geometry/localCoordinates'

export interface RodDetectionPanelProps {
  photo: MissionPhoto
  planId: string
  missionOrigin: LatLng
  mapCenter: [number, number]
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

interface PendingCalibration {
  detections: RawMarkerDetection[]
  rodMarkers: RodMarker[]
  segments: FeltSegmentCandidate[]
  photoCenter: Point
}

interface LastCalibration extends PendingCalibration {
  scale: number
  realCenter: Point
  inverted: boolean
  createdSegmentIds: string[]
  createdPointIds: string[]
}

// Laurent's fixed photo-taking setup (tripod + 3m telescopic arm + remote
// trigger) is what makes "photo center = where I was standing" reliable
// enough to calibrate from — displayed so the assumption is visible, not
// silently baked into the math (spec §Objectifs). Not configurable.
const CAPTURE_ASSUMPTION_TEXT =
  "Photo verticale, centrée sur votre position (trépied + bras télescopique + télécommande) — hypothèse fixe du calage automatique."

// MapView's root element is styled height: '100%', resolving against its
// parent's actual height — matches PlanCalibrationTool.tsx's MAP_WRAPPER_STYLE
// and its comment on why every direct MapView wrapper needs an explicit height.
const MAP_WRAPPER_STYLE = { height: 400 }

export function RodDetectionPanel({ photo, planId, missionOrigin, mapCenter }: RodDetectionPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingCalibration | null>(null)
  const [last, setLast] = useState<LastCalibration | null>(null)
  // Both handlers below check this before doing anything, AND the render
  // unmounts their only trigger element (the map / the invert button) while
  // it's true — the render-gating is the actual real-world protection
  // (nothing left to click once the trigger is gone); the in-handler check
  // is a defensive backstop for two events reaching the same still-mounted
  // handler before React reconciles the unmount. The old PlanCalibrationTool-
  // based version of this component had equivalent protection under a
  // different name (`detecting`); this replaces it.
  const [committing, setCommitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setSummary(null)
    setPending(null)
    setLast(null)

    async function run() {
      try {
        const image = await loadImage(photo.imageUrl)
        const detections = detectMarkers(image)
        const rodMarkers = await listRodMarkers()
        const { segments } = groupRodsInPixelSpace(detections, rodMarkers)

        if (segments.length === 0) {
          if (!cancelled) setError("Aucune tige complète détectée — impossible de calculer l'échelle.")
          return
        }
        const hasKnownFamily = segments.some((s) => allowedBearingsForNetwork(s.networkName) !== null)
        if (!hasKnownFamily) {
          if (!cancelled) setError("Aucune tige de réseau reconnu détectée — impossible de calculer l'orientation.")
          return
        }

        if (!cancelled) {
          setPending({
            detections,
            rodMarkers,
            segments,
            photoCenter: { x: image.naturalWidth / 2, y: image.naturalHeight / 2 },
          })
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }
    run()

    return () => {
      cancelled = true
    }
  }, [photo.imageUrl])

  async function commitCalibration(
    base: PendingCalibration,
    scale: number,
    rotationDeg: number,
    realCenter: Point
  ) {
    const transform = buildAffineTransform(scale, rotationDeg, realCenter, base.photoCenter)
    const { recognized, totalDetected, totalRecognized } = mapDetectionsToPoints(
      base.detections,
      transform,
      base.rodMarkers
    )
    const { segments: realSegments, points: realPoints } = pairIntoSegmentsAndPoints(recognized)

    const createdSegments = await Promise.all(
      realSegments.map((s) =>
        createFeltSegment({ planId, networkName: s.networkName, pointA: s.pointA, pointB: s.pointB })
      )
    )
    const createdPoints = await Promise.all(
      realPoints.map((p) => createFeltPoint({ planId, networkName: p.networkName, x: p.x, y: p.y }))
    )

    setSummary(
      `${totalDetected} marqueurs détectés, ${totalRecognized} reconnus ` +
        `(${realSegments.length} tiges complètes, ${realPoints.length} points isolés).`
    )
    return {
      createdSegmentIds: createdSegments.map((s) => s.id),
      createdPointIds: createdPoints.map((p) => p.id),
    }
  }

  async function handleMapClick(latlng: LatLng) {
    if (!pending || committing) return
    setError(null)
    setCommitting(true)
    try {
      const realCenter = latLngToLocal(latlng, missionOrigin)
      const scale = deriveScale(pending.segments)
      const rotationDeg = deriveRotation(pending.segments)
      const created = await commitCalibration(pending, scale, rotationDeg, realCenter)
      setLast({ ...pending, scale, realCenter, inverted: false, ...created })
      setPending(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCommitting(false)
    }
  }

  async function handleInvertOrientation() {
    if (!last || committing) return
    setError(null)
    setCommitting(true)
    try {
      const inverted = !last.inverted
      const rotationDeg = deriveRotation(last.segments, inverted)
      await Promise.all([
        ...last.createdSegmentIds.map((id) => deleteFeltSegment(id)),
        ...last.createdPointIds.map((id) => deleteFeltPoint(id)),
      ])
      const created = await commitCalibration(last, last.scale, rotationDeg, last.realCenter)
      setLast({ ...last, inverted, ...created })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div>
      <p>{CAPTURE_ASSUMPTION_TEXT}</p>
      {error && <p role="alert">{error}</p>}
      {summary && <p>{summary}</p>}
      {committing && <p>Enregistrement en cours…</p>}
      {pending && !committing && (
        <>
          <p>Cliquez sur le plan à l'endroit où vous vous teniez pour cette photo (centre de la photo).</p>
          <div style={MAP_WRAPPER_STYLE}>
            <MapView center={mapCenter} onMapClick={handleMapClick} />
          </div>
        </>
      )}
      {last && !committing && (
        <button onClick={handleInvertOrientation}>Inverser l'orientation</button>
      )}
    </div>
  )
}

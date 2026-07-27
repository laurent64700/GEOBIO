import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import { computeOverlayCorners } from '../geometry/imageOverlayCorners'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { AffineTransform } from '../domain/types'

export interface CalibratedPlanOverlayProps {
  imageUrl: string
  calibration: AffineTransform
  missionOrigin: LatLng
  visible: boolean
}

/**
 * Renders a calibrated interior plan photo overlaid on the map, at its real
 * rotation/scale/position — the confirmed missing piece behind Laurent's
 * "pas de callage sur le plan a la bonne echelle" report: calibratePlan
 * already computed a correct AffineTransform and it was already persisted,
 * but nothing ever rendered it back, so there was never any visual
 * confirmation the calibration (or its scale) was right.
 *
 * Leaflet's built-in ImageOverlay only supports axis-aligned bounds, not
 * rotation, so this bypasses react-leaflet's declarative layers and manages
 * a plain <img> in the overlay pane directly — same 3-corner CSS-matrix
 * technique as the Leaflet.ImageOverlay.Rotated plugin (see
 * imageOverlayCorners.ts), repositioned on every zoom/pan since screen pixel
 * coordinates (not the underlying geography) drive the matrix.
 */
export function CalibratedPlanOverlay({ imageUrl, calibration, missionOrigin, visible }: CalibratedPlanOverlayProps) {
  const map = useMap()
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const imgElRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    let cancelled = false
    const probe = new Image()
    probe.onload = () => {
      if (!cancelled) setNaturalSize({ width: probe.naturalWidth, height: probe.naturalHeight })
    }
    probe.src = imageUrl
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  useEffect(() => {
    if (!visible || !naturalSize) return
    const pane = map.getPane('overlayPane')
    if (!pane) return

    const imgEl = document.createElement('img')
    imgEl.src = imageUrl
    imgEl.alt = 'Plan intérieur calé'
    imgEl.style.position = 'absolute'
    imgEl.style.top = '0'
    imgEl.style.left = '0'
    imgEl.style.transformOrigin = '0 0'
    imgEl.style.width = `${naturalSize.width}px`
    imgEl.style.height = `${naturalSize.height}px`
    imgEl.style.opacity = '0.85'
    imgEl.style.pointerEvents = 'none'
    pane.appendChild(imgEl)
    imgElRef.current = imgEl

    function reposition() {
      const corners = computeOverlayCorners(calibration, naturalSize!.width, naturalSize!.height)
      const p0 = map.latLngToLayerPoint(localToLatLng(corners.topLeft, missionOrigin))
      const p1 = map.latLngToLayerPoint(localToLatLng(corners.topRight, missionOrigin))
      const p2 = map.latLngToLayerPoint(localToLatLng(corners.bottomLeft, missionOrigin))

      const a = (p1.x - p0.x) / naturalSize!.width
      const b = (p1.y - p0.y) / naturalSize!.width
      const c = (p2.x - p0.x) / naturalSize!.height
      const d = (p2.y - p0.y) / naturalSize!.height

      imgEl.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${p0.x}, ${p0.y})`
    }

    reposition()
    map.on('zoom move viewreset', reposition)

    return () => {
      map.off('zoom move viewreset', reposition)
      pane.removeChild(imgEl)
      imgElRef.current = null
    }
  }, [map, imageUrl, calibration, missionOrigin, visible, naturalSize])

  return null
}

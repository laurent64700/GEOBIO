// src/vision/arucoDetector.ts
// @ts-expect-error — js-aruco2 (v2.0.0) ships no TypeScript types. Verified
// against node_modules/js-aruco2/src/aruco.js: the module is CJS whose
// top-level `this.AR = AR` puts `AR` on module.exports, so a named import
// works through CJS interop.
import { AR } from 'js-aruco2'
import type { RawMarkerDetection } from './arucoMapping'
import type { Point } from '../domain/types'

/**
 * Detects ArUco markers in an already-loaded image. Draws the image to an
 * off-screen canvas to obtain raw pixel data, since js-aruco2's detector
 * operates on ImageData, not on an <img> element directly.
 *
 * Real js-aruco2 API (verified in node_modules, not the plan's guessed
 * `detect(width, height, data)`): `AR.Detector.prototype.detect(image)` takes
 * a single `{width, height, data}` object — which an ImageData satisfies
 * directly — and returns `AR.Marker[]` of `{id, corners, hammingDistance}`.
 */
export function detectMarkers(image: HTMLImageElement): RawMarkerDetection[] {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error("Impossible d'analyser l'image : contexte de dessin indisponible.")
  }
  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  const detector = new AR.Detector({ dictionaryName: 'ARUCO' })
  const markers = detector.detect(imageData)

  return markers.map((marker: { id: number; corners: Point[] }) => {
    // A marker is detected as a quadrilateral by construction, but this is an
    // unverified external library's output — guard the cast rather than trust
    // it silently, since a malformed corners array would otherwise reach
    // arucoMapping's centroid() and read past the array undetected.
    if (marker.corners.length !== 4) {
      throw new Error(
        `Marqueur ${marker.id} détecté avec ${marker.corners.length} coins au lieu de 4.`
      )
    }
    return {
      markerId: marker.id,
      corners: marker.corners as [Point, Point, Point, Point],
    }
  })
}

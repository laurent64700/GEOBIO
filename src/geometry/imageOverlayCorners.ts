import { applyAffineTransform } from './affineTransform'
import type { AffineTransform, Point } from '../domain/types'

export interface ImageOverlayCorners {
  /** Mission-local coordinates of the image's (0,0) pixel. */
  topLeft: Point
  /** Mission-local coordinates of the image's (width,0) pixel. */
  topRight: Point
  /** Mission-local coordinates of the image's (0,height) pixel. */
  bottomLeft: Point
}

/**
 * The 3 corners needed to place a possibly-rotated image overlay on the map
 * (Leaflet's built-in ImageOverlay only supports axis-aligned bounds, so a
 * calibrated — rotated/scaled — plan photo needs this 3-corner affine
 * placement instead, same technique as the well-known
 * Leaflet.ImageOverlay.Rotated plugin: 3 points fully determine a 2D affine
 * map with no shear, which is exactly what calibratePlan produces).
 */
export function computeOverlayCorners(
  calibration: AffineTransform,
  imageWidthPx: number,
  imageHeightPx: number
): ImageOverlayCorners {
  return {
    topLeft: applyAffineTransform({ x: 0, y: 0 }, calibration),
    topRight: applyAffineTransform({ x: imageWidthPx, y: 0 }, calibration),
    bottomLeft: applyAffineTransform({ x: 0, y: imageHeightPx }, calibration),
  }
}

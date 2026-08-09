import { metersPerPixel } from './metersPerPixel'

const MIN_WEIGHT_PX = 1
// True-to-scale width is correct in principle (2026-07-23), but at high zoom
// a wide and/or reinforced network's grid rendered as a dense, near-solid
// block of color instead of a legible reference grid (Laurent, field
// testing 08/2026: "grille trop présente, réduire le trait"). A reference
// grid needs to stay readable more than it needs to be dimensionally exact
// at extreme zoom — real felt segments (FeltSegmentsLayer) already don't
// use this real-width conversion at all, just a small flat weight.
const MAX_WEIGHT_PX = 3

// Converts a network's real-world band width to a Leaflet stroke `weight`
// (screen pixels) that stays true-to-scale as the user zooms — replaces a
// flat 2px/4px constant that represented anywhere from ~11cm to ~85cm of
// real terrain depending on zoom, unrelated to any network's actual width
// (root-caused 2026-07-23, live against a real IGN tile at zoom 18 vs 21).
// `reinforced` lines (every vibratoryBase-th harmonic line) render 1.5x
// wider, preserving the existing visual emphasis convention.
export function lineWeightForZoom(
  realWidthM: number,
  latDeg: number,
  zoom: number,
  reinforced: boolean
): number {
  const width = reinforced ? realWidthM * 1.5 : realWidthM
  const px = width / metersPerPixel(latDeg, zoom)
  return Math.min(Math.max(px, MIN_WEIGHT_PX), MAX_WEIGHT_PX)
}

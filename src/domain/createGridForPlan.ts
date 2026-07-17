import { generateTheoreticalLines, type BoundingBox } from '../geometry/gridGeneration'
import { createGridInstance } from '../data/gridInstancesRepo'
import { createGridLines } from '../data/gridLinesRepo'
import type { GridTemplate, Point } from './types'

/**
 * Fixed default extent around the grid origin. A real "current map viewport"
 * bounds would need reading Leaflet's live view and converting it to local
 * coordinates — deferred to Chunk 6, once the map actually renders the
 * generated lines and it's clear whether this default needs to be wider.
 */
export const DEFAULT_GRID_RADIUS_M = 30

export async function createGridForPlan(
  planId: string,
  template: GridTemplate,
  originClicked: Point,
  radiusM: number = DEFAULT_GRID_RADIUS_M
) {
  // generateTheoreticalLines (Chunk 2) documents that it expects the FINAL,
  // already-composed origin — i.e. the point Laurent clicked, shifted by the
  // template's own offset. That composition is this function's job; skipping
  // it would silently misplace every grid generated from a template whose
  // origin offset isn't (0, 0).
  const origin: Point = {
    x: originClicked.x + template.originOffsetX,
    y: originClicked.y + template.originOffsetY,
  }

  const bounds: BoundingBox = {
    minX: origin.x - radiusM,
    maxX: origin.x + radiusM,
    minY: origin.y - radiusM,
    maxY: origin.y + radiusM,
  }
  const generated = generateTheoreticalLines(template, origin, bounds)

  const instance = await createGridInstance({
    planId,
    templateSnapshot: template,
    originX: origin.x,
    originY: origin.y,
  })
  const lines = await createGridLines(
    generated.map((l) => ({
      gridInstanceId: instance.id,
      family: l.family,
      theoreticalPoints: l.points,
    }))
  )

  return { instance, lines }
}

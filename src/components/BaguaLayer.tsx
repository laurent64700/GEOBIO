// src/components/BaguaLayer.tsx
import { Polygon, Tooltip } from 'react-leaflet'
import { computeCentroid, computeMaxRadius, computeBaguaSectors } from '../geometry/bagua'
import { baguaCorrespondences } from '../domain/baguaCorrespondences'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { Point } from '../domain/types'

export interface BaguaLayerProps {
  footprint: Point[] | null
  missionOrigin: LatLng
  visible: boolean
}

export function BaguaLayer({ footprint, missionOrigin, visible }: BaguaLayerProps) {
  if (!visible || footprint === null || footprint.length === 0) return null

  const center = computeCentroid(footprint)
  // computeCentroid divides by the polygon's area — a degenerate footprint
  // (collinear points, area ≈ 0) yields NaN/Infinity, which Leaflet would
  // render as invisible polygons with no error at all (audit S3.3). Render
  // nothing instead: unreachable with real IGN outlines, but cheap to guard.
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return null
  const radiusM = computeMaxRadius(footprint, center)
  const sectors = computeBaguaSectors(center, radiusM)

  return (
    <>
      {sectors.map((sector) => {
        const correspondence = baguaCorrespondences[sector.compassDirection]
        return (
          <Polygon
            key={sector.compassDirection}
            positions={sector.points.map((p) => {
              const latlng = localToLatLng(p, missionOrigin)
              return [latlng.lat, latlng.lng] as [number, number]
            })}
            pathOptions={{ color: '#7b4fa3', weight: 1, fillOpacity: 0.08 }}
          >
            <Tooltip>{sector.compassDirection} — {correspondence.label}</Tooltip>
          </Polygon>
        )
      })}
    </>
  )
}

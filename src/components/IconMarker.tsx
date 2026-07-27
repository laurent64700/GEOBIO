import { Marker } from 'react-leaflet'
import L from 'leaflet'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { Point } from '../domain/types'

export interface IconMarkerProps {
  position: Point
  missionOrigin: LatLng
  /** Raw inline SVG markup (a `fill="currentColor"` icon — see src/assets/icons/*). */
  svg: string
  color: string
  size?: number
  /** Small numeric/text badge in the corner — e.g. a phenomenon's branch count. */
  badge?: string
  onClick?: () => void
}

const DEFAULT_SIZE = 28

/**
 * Shared real-icon marker for both context objects (furniture/landscape,
 * spec: "harmoniser pour être UX friendly") and phenomena (upgraded from
 * plain text-code circles to match) — a white circular badge tinted with
 * the network/category color, holding the given SVG icon.
 */
export function IconMarker({ position, missionOrigin, svg, color, size = DEFAULT_SIZE, badge, onClick }: IconMarkerProps) {
  const latlng = localToLatLng(position, missionOrigin)
  const icon = L.divIcon({
    className: 'geobio-icon-marker',
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        <div style="width:100%;height:100%;box-sizing:border-box;padding:4px;border-radius:50%;background:white;border:2px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;">
          ${svg}
        </div>
        ${
          badge
            ? `<span class="geobio-icon-badge" style="position:absolute;bottom:-3px;right:-3px;min-width:14px;height:14px;padding:0 2px;border-radius:7px;background:${color};color:white;font-size:10px;line-height:14px;text-align:center;font-family:sans-serif;">${badge}</span>`
            : ''
        }
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
  return (
    <Marker
      position={[latlng.lat, latlng.lng]}
      icon={icon}
      eventHandlers={onClick ? { click: onClick } : undefined}
    />
  )
}

import { Polyline } from 'react-leaflet'
import { getOrthogonalitySuggestion } from '../geometry/orthogonality'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { GridLineFamily, GridTemplate, Point } from '../domain/types'

export interface OrthogonalitySuggestionProps {
  linePoints: Point[]
  family: GridLineFamily
  template: Pick<GridTemplate, 'angleTrueNorthDeg'>
  missionOrigin: LatLng
}

/**
 * Map-layer-only preview of the orthogonality assist's straightened line
 * (spec §6.2, Chunk 2 Task 7's `getOrthogonalitySuggestion`).
 *
 * The plan's reference implementation for this task also rendered the
 * deviation text and "Redresser"/"Ignorer" buttons here, as a plain <div>
 * sibling of this <Polyline> inside the Leaflet tree — the plan itself
 * flagged that as a presentation detail to revisit once wired into the real
 * app shell. It doesn't fit this codebase: every other SiteMapView overlay
 * (LayerPanel, the guide-line controls, the edit-mode controls) is
 * deliberately rendered as a sibling of <MapView>, inside SiteMapView's own
 * position:relative wrapper, absolutely positioned into a corner via
 * <OverlayPanel> (see OverlayPanel.tsx) — never nested inside
 * <MapContainer>'s children. A raw <div> placed there instead would sit
 * among Leaflet's own panes/controls, which is exactly the "layout issues"
 * the plan warned about.
 *
 * So this component only renders the map layer. The deviation text and
 * buttons live in SiteMapView's own JSX as a card in the shared bottom-right
 * <OverlayPanel> there, computed from the same
 * `getOrthogonalitySuggestion` call (cheap and pure, so calling it a second
 * time there costs nothing and needs no prop-drilling back up from here).
 */
export function OrthogonalitySuggestion({ linePoints, family, template, missionOrigin }: OrthogonalitySuggestionProps) {
  const { suggestedPoints } = getOrthogonalitySuggestion(linePoints, family, template)

  return (
    <Polyline
      positions={suggestedPoints.map((p) => {
        const latlng = localToLatLng(p, missionOrigin)
        return [latlng.lat, latlng.lng] as [number, number]
      })}
      pathOptions={{ color: '#888888', dashArray: '2, 6', weight: 2 }}
    />
  )
}

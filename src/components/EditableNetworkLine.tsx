import { useEffect, useRef } from 'react'
import { Polyline, useMap } from 'react-leaflet'
import type { Polyline as LeafletPolyline } from 'leaflet'
// Side-effect imports: leaflet-geoman attaches its `.pm` property to Leaflet
// layers (and augments the global `L` namespace) as an import-time effect —
// it must be imported somewhere that runs before any Polyline mounts, or
// `layer.pm` stays undefined forever and the enable/disable calls below
// silently no-op. Colocated here (rather than in MapView.tsx) because this
// is the one component that actually depends on `.pm` existing, so it owns
// the responsibility rather than relying on a sibling file always running
// first (e.g. in a test that mounts this component under a bare
// `MapContainer` without going through the app's `MapView`).
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { localToLatLng, latLngToLocal, type LatLng } from '../geometry/localCoordinates'
import { applyAllVertices } from '../geometry/lineEditing'
import type { GridLine } from '../domain/types'

export interface EditableNetworkLineProps {
  line: GridLine
  color: string
  missionOrigin: LatLng
  editable: boolean
  onChanged: (updated: GridLine, changeKind: 'drag' | 'vertex-added') => void
}

/**
 * `pm:markerdragend` (dragging an existing vertex) and `pm:vertexadded` (clicking a
 * Geoman "middle marker" to insert a new one — the library's default
 * `addVertexOn: 'click'` behavior) are both verified against the installed
 * `@geoman-io/leaflet-geoman-free` v2.20.0 source — see
 * docs/superpowers/specs/2026-07-20-grid-line-vertex-insertion-design.md §2 for the
 * exact trace. A third gesture (dragging a middle marker directly, without a
 * separate click first) is expected to fire BOTH events for one gesture — a disclosed,
 * accepted limitation, see that spec's §4.2 — not something this component tries to
 * de-duplicate.
 */
export function EditableNetworkLine({ line, color, missionOrigin, editable, onChanged }: EditableNetworkLineProps) {
  const layerRef = useRef<LeafletPolyline & { pm?: { enable: () => void; disable: () => void } }>(null)
  useMap() // ensures this only ever renders inside a MapContainer

  useEffect(() => {
    const layer = layerRef.current
    if (!layer?.pm) return
    if (editable) layer.pm.enable()
    else layer.pm.disable()
  }, [editable])

  useEffect(() => {
    const layer = layerRef.current as unknown as {
      on: (event: string, handler: (e: { target: { getLatLngs: () => { lat: number; lng: number }[] } }) => void) => void
      off: (event: string, handler: (e: { target: { getLatLngs: () => { lat: number; lng: number }[] } }) => void) => void
    } | null
    if (!layer) return

    // Fold every vertex from the gesture into a single updated GridLine, exactly
    // once per event (see applyAllVertices' doc comment for why looping per-vertex
    // would race) — shared between both event kinds, differing only in the
    // changeKind tag passed through to onChanged.
    function makeHandler(changeKind: 'drag' | 'vertex-added') {
      return function handle(e: { target: { getLatLngs: () => { lat: number; lng: number }[] } }) {
        const latlngs = e.target.getLatLngs()
        const points = latlngs.map((latlng) => latLngToLocal(latlng, missionOrigin))
        onChanged(applyAllVertices(line, points), changeKind)
      }
    }

    const handleDragEnd = makeHandler('drag')
    const handleVertexAdded = makeHandler('vertex-added')

    layer.on('pm:markerdragend', handleDragEnd)
    layer.on('pm:vertexadded', handleVertexAdded)
    return () => {
      layer.off('pm:markerdragend', handleDragEnd)
      layer.off('pm:vertexadded', handleVertexAdded)
    }
  }, [line, missionOrigin, onChanged])

  return (
    <Polyline
      ref={layerRef}
      positions={line.adjustedPoints.map((p) => {
        const latlng = localToLatLng(p, missionOrigin)
        return [latlng.lat, latlng.lng] as [number, number]
      })}
      pathOptions={{
        color,
        dashArray: line.polarity === '-' ? '6, 4' : undefined,
        weight: line.reinforced ? 4 : 2,
      }}
    />
  )
}

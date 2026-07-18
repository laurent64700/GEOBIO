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
  onChanged: (updated: GridLine) => void
}

/**
 * ⚠️ The `pm.enable()` call and `pm:markerdragend` event name below are a
 * best-effort guess at leaflet-geoman-free's actual API — VERIFY against
 * https://github.com/geoman-io/leaflet-geoman before relying on this. If the
 * event/method names are wrong, the surrounding logic (applyAllVertices,
 * onChanged, the repo update, undo) is unaffected — only this glue needs
 * correcting.
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
      off: (event: string) => void
    } | null
    if (!layer) return

    function handleDragEnd(e: { target: { getLatLngs: () => { lat: number; lng: number }[] } }) {
      // Fold every vertex from this one drag gesture into a single updated
      // GridLine, and call onChanged exactly once. getLatLngs() returns ALL
      // vertices (not just the one dragged) on every call — looping and
      // calling onChanged per-vertex would fire multiple stale updates that
      // race each other (see applyAllVertices' doc comment for why).
      const latlngs = e.target.getLatLngs()
      const points = latlngs.map((latlng) => latLngToLocal(latlng, missionOrigin))
      onChanged(applyAllVertices(line, points))
    }

    layer.on('pm:markerdragend', handleDragEnd)
    return () => layer.off('pm:markerdragend')
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

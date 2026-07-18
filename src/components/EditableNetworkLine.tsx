import { useEffect, useRef } from 'react'
import { Polyline, useMap } from 'react-leaflet'
import type { Polyline as LeafletPolyline } from 'leaflet'
import { localToLatLng, latLngToLocal, type LatLng } from '../geometry/localCoordinates'
import { applyVertexDrag } from '../geometry/lineEditing'
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
 * event/method names are wrong, the surrounding logic (applyVertexDrag,
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
      const latlngs = e.target.getLatLngs()
      latlngs.forEach((latlng, index) => {
        const point = latLngToLocal(latlng, missionOrigin)
        onChanged(applyVertexDrag(line, index, point))
      })
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

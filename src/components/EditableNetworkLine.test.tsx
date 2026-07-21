import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import type { Map as LeafletMap, Polyline as LeafletPolyline } from 'leaflet'
import { EditableNetworkLine } from './EditableNetworkLine'
import type { GridLine } from '../domain/types'

const line: GridLine = {
  id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a', polarity: '-', reinforced: true,
  theoreticalPoints: [{ x: 0, y: -10 }, { x: 0, y: 10 }],
  adjustedPoints: [{ x: 0, y: -10 }, { x: 0, y: 10 }],
}

describe('EditableNetworkLine', () => {
  it('renders without crashing and applies color/dash/weight from the line', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <EditableNetworkLine
          line={line}
          color="#d32f2f"
          missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
          editable={false}
          onChanged={vi.fn()}
        />
      </MapContainer>
    )
    const path = container.querySelector('path.leaflet-interactive')
    expect(path?.getAttribute('stroke')).toBe('#d32f2f')
    expect(path?.getAttribute('stroke-width')).toBe('4')
    expect(path?.getAttribute('stroke-dasharray')).toBe('6, 4')
  })

  function renderEditableLine(onChanged: (updated: GridLine, changeKind: 'drag' | 'vertex-added') => void) {
    // Holder object, not a plain `let map = null` reassigned inside the ref callback:
    // TypeScript's control-flow narrowing doesn't track a `let` variable's mutation
    // happening only inside a closure invoked by React — at the `.eachLayer(...)` call
    // below it would otherwise still see `map` narrowed to its literal initializer
    // `null` (type `never` after optional chaining), even though the explicit
    // annotation says `LeafletMap | null`. A holder's property access avoids this.
    const mapHolder: { current: LeafletMap | null } = { current: null }
    render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18} ref={(m) => { mapHolder.current = m }}>
        <EditableNetworkLine
          line={line}
          color="#d32f2f"
          missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
          editable
          onChanged={onChanged}
        />
      </MapContainer>
    )
    // With editable=true, Geoman's layer.pm.enable() adds its own vertex/middle-marker
    // Marker instances directly to the map as SIBLINGS of the Polyline (not nested
    // inside it) — map.eachLayer sees ALL of them (verified: 6 layers for a 2-point
    // line, 1 Polyline + 5 markers), not just the one Polyline this test cares about.
    // Duck-type on setLatLngs (only Polyline/Polygon-family layers have it; Markers
    // don't) rather than picking whichever layer eachLayer iterates to last.
    const polylineHolder: { current: LeafletPolyline | null } = { current: null }
    mapHolder.current?.eachLayer((layer) => {
      if (typeof (layer as unknown as { setLatLngs?: unknown }).setLatLngs === 'function') {
        polylineHolder.current = layer as unknown as LeafletPolyline
      }
    })
    if (!polylineHolder.current) throw new Error('Expected EditableNetworkLine to have rendered a Leaflet Polyline layer')
    return polylineHolder.current
  }

  it('calls onChanged with changeKind "drag" when Geoman fires pm:markerdragend', () => {
    const onChanged = vi.fn()
    const polyline = renderEditableLine(onChanged)

    // Simulate Geoman having already updated the layer's vertices before firing
    // the drag-end event (matches how getLatLngs() is read fresh in the handler).
    polyline.setLatLngs([
      [48.8567, 2.3522],
      [48.8565, 2.3522],
    ])
    polyline.fire('pm:markerdragend', { target: polyline })

    expect(onChanged).toHaveBeenCalledTimes(1)
    const [updated, changeKind] = onChanged.mock.calls[0]
    expect(changeKind).toBe('drag')
    expect(updated.adjustedPoints).toHaveLength(2)
  })

  it('calls onChanged with changeKind "vertex-added" when Geoman fires pm:vertexadded', () => {
    const onChanged = vi.fn()
    const polyline = renderEditableLine(onChanged)

    // One more point than the original 2-point line — simulates a midpoint click
    // having inserted a real vertex between the two endpoints.
    polyline.setLatLngs([
      [48.8567, 2.3522],
      [48.8566, 2.3522],
      [48.8565, 2.3522],
    ])
    polyline.fire('pm:vertexadded', { target: polyline })

    expect(onChanged).toHaveBeenCalledTimes(1)
    const [updated, changeKind] = onChanged.mock.calls[0]
    expect(changeKind).toBe('vertex-added')
    expect(updated.adjustedPoints).toHaveLength(3)
  })
})

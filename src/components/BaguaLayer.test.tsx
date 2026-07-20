// src/components/BaguaLayer.test.tsx
import { describe, it, expect } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { BaguaLayer } from './BaguaLayer'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }

describe('BaguaLayer', () => {
  it('renders 8 sector polygons', () => {
    const footprint = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <BaguaLayer footprint={footprint} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(8)
  })

  it('labels each sector with its correspondence-table entry on hover', async () => {
    // Leaflet's Tooltip (non-permanent, the default) only creates its DOM
    // content once opened via a mouseover/click listener — it's not present
    // in the tree on initial render. Simulate the hover Laurent would
    // actually perform before asserting on the label text.
    const footprint = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <BaguaLayer footprint={footprint} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const firstPath = container.querySelector('path.leaflet-interactive')!
    firstPath.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))

    // baguaCorrespondences.N.label is 'Carrière' (Task 5) — confirms the
    // tooltip content is actually sourced from the correspondence table,
    // not a hardcoded/generic label. Whichever sector happens to be first
    // in COMPASS_ORDER (N) is the one under test here.
    //
    // Deviation from the plan's literal snippet: Leaflet's Tooltip opens via
    // a React state update triggered by the native mouseover listener, which
    // isn't flushed synchronously after dispatchEvent (confirmed by React's
    // "not wrapped in act(...)" warning when asserting immediately) — wait
    // for the DOM to reflect it instead of asserting right after the event.
    await waitFor(() => expect(container.textContent).toContain('Carrière'))
  })

  it('renders nothing when footprint is null', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <BaguaLayer footprint={null} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing (instead of NaN polygons) for a degenerate zero-area footprint', () => {
    // Collinear points → shoelace area 0 → computeCentroid divides by zero,
    // yielding NaN/Infinity. Without the guard, Leaflet silently renders 8
    // invisible NaN-coordinate polygons.
    const degenerate = [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 10 },
    ]
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <BaguaLayer footprint={degenerate} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing when visible is false', () => {
    const footprint = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <BaguaLayer footprint={footprint} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})

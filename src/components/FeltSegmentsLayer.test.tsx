import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { FeltSegmentsLayer } from './FeltSegmentsLayer'
import type { FeltSegment } from '../domain/types'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const segments: FeltSegment[] = [
  { id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 }, polarityA: '+', polarityB: '-', createdAt: '2026-07-20T10:00:00Z' },
  { id: 'fs2', planId: 'p1', networkName: 'Curry', pointA: { x: -1, y: -1 }, pointB: { x: 1, y: 1 }, polarityA: null, polarityB: null, createdAt: '2026-07-20T10:01:00Z' },
]

describe('FeltSegmentsLayer', () => {
  it('renders one polyline per segment, colored by its network', () => {
    // Both fixtures have null polarity here specifically so no polarity
    // end-cap CircleMarkers are added — CircleMarker also renders as
    // path.leaflet-interactive, so this test stays a clean count of
    // polylines only; polarity end-caps have their own dedicated tests below.
    const noPolaritySegments: FeltSegment[] = segments.map((s) => ({ ...s, polarityA: null, polarityB: null }))
    const colorForNetwork = (name: string) => (name === 'Hartmann' ? '#d32f2f' : '#f2c230')
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer segments={noPolaritySegments} colorForNetwork={colorForNetwork} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const lines = container.querySelectorAll('path.leaflet-interactive')
    expect(lines).toHaveLength(2)
    expect(lines[0].getAttribute('stroke')).toBe('#d32f2f')
    expect(lines[1].getAttribute('stroke')).toBe('#f2c230')
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer segments={segments} colorForNetwork={() => '#000'} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('labels each end with its polarity when set (manually placed segments) — one permanent tooltip per end', () => {
    // Query scoped to .leaflet-tooltip specifically, not the whole page text:
    // Leaflet's own zoom control already renders literal "+"/"−" characters,
    // so a bare textContent-contains check would pass even with no polarity
    // rendering at all.
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer segments={[segments[0]]} colorForNetwork={() => '#d32f2f'} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const tooltips = container.querySelectorAll('.leaflet-tooltip')
    expect(tooltips).toHaveLength(2)
    const tooltipTexts = Array.from(tooltips).map((t) => t.textContent)
    expect(tooltipTexts).toContain('+')
    expect(tooltipTexts).toContain('-')
  })

  it('anchors the two polarity labels on opposite sides (top/bottom), not both centered on top of each other', () => {
    // Measured live 2026-07-23: at the ~1m/max-zoom scale this tool is used
    // at, two "direction=center" labels ~34px tall on a segment spanning as
    // little as ~19px overlap by ~285px². Opposite directions fix this for
    // any segment orientation — asserted here via Leaflet's own
    // direction-specific CSS classes rather than pixel geometry (jsdom has
    // no real layout), which is what actually drives where each renders.
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer segments={[segments[0]]} colorForNetwork={() => '#d32f2f'} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const tooltips = container.querySelectorAll('.leaflet-tooltip')
    expect(container.querySelectorAll('.leaflet-tooltip-top')).toHaveLength(1)
    expect(container.querySelectorAll('.leaflet-tooltip-bottom')).toHaveLength(1)
    expect(container.querySelectorAll('.leaflet-tooltip-center')).toHaveLength(0)
    expect(tooltips).toHaveLength(2)
  })

  it('shows no polarity labels for a segment with null polarity (ArUco-detected)', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer segments={[segments[1]]} colorForNetwork={() => '#f2c230'} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('.leaflet-tooltip')).toHaveLength(0)
  })

  it('calls onSegmentClick with the clicked segment when the calibration-picking prop is provided', () => {
    const onSegmentClick = vi.fn()
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer
          segments={segments}
          colorForNetwork={() => '#000'}
          missionOrigin={missionOrigin}
          visible
          onSegmentClick={onSegmentClick}
        />
      </MapContainer>
    )
    const lines = container.querySelectorAll('path.leaflet-interactive')
    fireEvent.click(lines[0])
    expect(onSegmentClick).toHaveBeenCalledWith(segments[0])
  })

  it('renders an already-picked segment (selectedSegmentIds) thicker than an unpicked one', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer
          segments={segments.map((s) => ({ ...s, polarityA: null, polarityB: null }))}
          colorForNetwork={() => '#000'}
          missionOrigin={missionOrigin}
          visible
          selectedSegmentIds={['fs1']}
        />
      </MapContainer>
    )
    const lines = container.querySelectorAll('path.leaflet-interactive')
    expect(Number(lines[0].getAttribute('stroke-width'))).toBeGreaterThan(Number(lines[1].getAttribute('stroke-width')))
  })

  it('renders nothing when there are no segments', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltSegmentsLayer segments={[]} colorForNetwork={() => '#000'} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})

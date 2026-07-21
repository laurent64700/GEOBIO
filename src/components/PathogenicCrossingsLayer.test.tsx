import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { PathogenicCrossingsLayer } from './PathogenicCrossingsLayer'
import type { PathogenicCrossing } from '../geometry/pathogenicCrossings'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const crossings: PathogenicCrossing[] = [
  { point: { x: 0, y: 0 }, hartmannLineId: 'h1', curryLineId: 'c1' },
  { point: { x: 2, y: 3 }, hartmannLineId: 'h2', curryLineId: 'c1' },
]

describe('PathogenicCrossingsLayer', () => {
  it('renders one marker per crossing', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PathogenicCrossingsLayer crossings={crossings} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(2)
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PathogenicCrossingsLayer crossings={crossings} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing when there are no crossings', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <PathogenicCrossingsLayer crossings={[]} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})

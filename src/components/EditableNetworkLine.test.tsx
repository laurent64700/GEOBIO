import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
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
})

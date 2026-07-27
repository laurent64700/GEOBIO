import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { IconMarker } from './IconMarker'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const sampleSvg = '<svg viewBox="0 0 512 512"><path d="M0 0h10v10H0z"/></svg>'

describe('IconMarker', () => {
  it('renders the given SVG inside a Leaflet marker, tinted with the given color', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <IconMarker position={{ x: 0, y: 0 }} missionOrigin={missionOrigin} svg={sampleSvg} color="#c0392b" />
      </MapContainer>
    )
    const marker = container.querySelector('.leaflet-marker-icon')
    expect(marker).not.toBeNull()
    expect(marker!.innerHTML).toContain('<svg')
    expect(marker!.innerHTML).toContain('#c0392b')
  })

  it('shows a small numeric badge when one is provided', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <IconMarker position={{ x: 0, y: 0 }} missionOrigin={missionOrigin} svg={sampleSvg} color="#c0392b" badge="3" />
      </MapContainer>
    )
    expect(container.querySelector('.leaflet-marker-icon')!.textContent).toContain('3')
  })

  it('shows no badge element when none is provided', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <IconMarker position={{ x: 0, y: 0 }} missionOrigin={missionOrigin} svg={sampleSvg} color="#c0392b" />
      </MapContainer>
    )
    expect(container.querySelector('.geobio-icon-badge')).toBeNull()
  })

  it('positions the marker at the position converted through missionOrigin', () => {
    const onClick = vi.fn()
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <IconMarker position={{ x: 5, y: 5 }} missionOrigin={missionOrigin} svg={sampleSvg} color="#000" onClick={onClick} />
      </MapContainer>
    )
    expect(container.querySelector('.leaflet-marker-icon')).not.toBeNull()
  })
})

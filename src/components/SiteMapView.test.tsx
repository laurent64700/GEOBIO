import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SiteMapView } from './SiteMapView'
import * as gridInstancesRepo from '../data/gridInstancesRepo'
import * as gridLinesRepo from '../data/gridLinesRepo'
import * as feltPointsRepo from '../data/feltPointsRepo'

vi.mock('../data/gridInstancesRepo')
vi.mock('../data/gridLinesRepo')
vi.mock('../data/feltPointsRepo')

vi.mock('./MapView', () => ({
  MapView: ({ children, onMapClick }: { children?: React.ReactNode; onMapClick?: (l: { lat: number; lng: number }) => void }) => (
    <div data-testid="map-view">
      {children}
      {onMapClick && (
        <button onClick={() => onMapClick({ lat: 48.8567, lng: 2.3523 })}>simulate-map-click</button>
      )}
    </div>
  ),
}))
vi.mock('./NetworkLinesLayer', () => ({
  NetworkLinesLayer: ({ visible, templateSnapshot }: { visible: boolean; templateSnapshot: { name?: string } }) =>
    visible ? <div data-testid={`lines-${templateSnapshot.name ?? 'unknown'}`} /> : null,
}))
vi.mock('./FeltPointsLayer', () => ({
  FeltPointsLayer: ({ visible }: { visible: boolean }) => (visible ? <div data-testid="felt-points" /> : null),
}))
vi.mock('./GuideLineLayer', () => ({
  GuideLineLayer: ({ anchor, bearingDeg }: { anchor: { x: number; y: number } | null; bearingDeg: number | null }) =>
    anchor !== null && bearingDeg !== null ? <div data-testid="guide-line" /> : null,
}))

const hartmannInstance = {
  id: 'gi1', planId: 'p1',
  templateSnapshot: { id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5, angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f', vibratoryBase: 7 },
  originX: 0, originY: 0,
}

describe('SiteMapView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads instances/lines/felt points, shows felt points by default and grid layers hidden by default', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([hartmannInstance])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)

    expect(await screen.findByTestId('felt-points')).toBeInTheDocument()
    expect(screen.queryByTestId('lines-Hartmann')).not.toBeInTheDocument()
  })

  it('toggling the Hartmann layer in the panel shows its lines', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([hartmannInstance])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)

    await screen.findByTestId('felt-points')
    fireEvent.click(await screen.findByLabelText('Hartmann'))

    await waitFor(() => expect(screen.getByTestId('lines-Hartmann')).toBeInTheDocument())
  })

  it('toggling "Ressenti terrain" off hides the felt points that were visible by default', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([hartmannInstance])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)

    await screen.findByTestId('felt-points')
    fireEvent.click(await screen.findByLabelText('Ressenti terrain'))

    await waitFor(() => expect(screen.queryByTestId('felt-points')).not.toBeInTheDocument())
  })

  it('shows an error message when loading grid instances fails', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockRejectedValue(
      new Error('Impossible de charger les instances de grille : network down')
    )
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })

  it('places a guide line at the clicked point once a bearing preset and "placer" are active', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByRole('button', { name: 'N/S' }))
    fireEvent.click(screen.getByRole('button', { name: /placer/i }))
    fireEvent.click(screen.getByText('simulate-map-click'))

    expect(await screen.findByTestId('guide-line')).toBeInTheDocument()
  })

  it('does not place a guide line from a map click when "placer" is not active', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByRole('button', { name: 'N/S' }))
    // no "Placer" click this time — onMapClick shouldn't even be wired up
    expect(screen.queryByText('simulate-map-click')).not.toBeInTheDocument()
  })

  it('also places a guide line using the E/O preset (not just N/S)', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByRole('button', { name: 'E/O' }))
    fireEvent.click(screen.getByRole('button', { name: /placer/i }))
    fireEvent.click(screen.getByText('simulate-map-click'))

    expect(await screen.findByTestId('guide-line')).toBeInTheDocument()
  })

  it('places a guide line using the 135° preset', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByRole('button', { name: '135°' }))
    fireEvent.click(screen.getByRole('button', { name: /placer/i }))
    fireEvent.click(screen.getByText('simulate-map-click'))

    expect(await screen.findByTestId('guide-line')).toBeInTheDocument()
  })

  it('places a guide line using a custom bearing entered via the numeric input', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)
    await screen.findByTestId('map-view')

    fireEvent.change(screen.getByLabelText('Angle personnalisé'), { target: { value: '27' } })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    fireEvent.click(screen.getByRole('button', { name: /placer/i }))
    fireEvent.click(screen.getByText('simulate-map-click'))

    expect(await screen.findByTestId('guide-line')).toBeInTheDocument()
  })

  it('stops forwarding map clicks to the guide line after one placement, until "placer" is pressed again', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByRole('button', { name: 'N/S' }))
    fireEvent.click(screen.getByRole('button', { name: /placer/i }))
    fireEvent.click(screen.getByText('simulate-map-click'))

    expect(await screen.findByTestId('guide-line')).toBeInTheDocument()
    // placingGuideLine should have reset to false after the first placement,
    // so onMapClick is no longer wired up and the simulate button disappears
    expect(screen.queryByText('simulate-map-click')).not.toBeInTheDocument()
  })

  it('clears the guide line and resets the tool state when "Effacer" is clicked', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)
    await screen.findByTestId('map-view')

    // "Effacer" is disabled until a guide line has been placed
    expect(screen.getByRole('button', { name: 'Effacer' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'N/S' }))
    fireEvent.click(screen.getByRole('button', { name: /placer/i }))
    fireEvent.click(screen.getByText('simulate-map-click'))
    expect(await screen.findByTestId('guide-line')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Effacer' }))

    expect(screen.queryByTestId('guide-line')).not.toBeInTheDocument()
    // resetting the whole tool means "Placer ici" is disabled again (no bearing selected)
    expect(screen.getByRole('button', { name: /placer/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Effacer' })).toBeDisabled()
  })
})

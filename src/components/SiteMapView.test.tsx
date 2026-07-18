import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SiteMapView } from './SiteMapView'
import * as gridInstancesRepo from '../data/gridInstancesRepo'
import * as gridLinesRepo from '../data/gridLinesRepo'
import * as feltPointsRepo from '../data/feltPointsRepo'
import { createGridForPlan } from '../domain/createGridForPlan'
import { getOrthogonalitySuggestion } from '../geometry/orthogonality'

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
vi.mock('./OrthogonalitySuggestion', () => ({
  OrthogonalitySuggestion: () => <div data-testid="orthogonality-preview" />,
}))
vi.mock('./EditableNetworkLine', () => ({
  EditableNetworkLine: ({ line, onChanged }: { line: { id: string; adjustedPoints: { x: number; y: number }[] }; onChanged: (l: unknown) => void }) => (
    <button onClick={() => onChanged({ ...line, adjustedPoints: [{ x: 0, y: -10 }, { x: 1, y: 10 }] })}>
      simulate-line-change-{line.id}
    </button>
  ),
}))

// vi.mock(...) calls are hoisted above every import AND above the file's own
// top-level `const hartmannInstance = {...}` below — a factory that closes
// over `hartmannInstance` directly would throw "Cannot access
// 'hartmannInstance' before initialization" the moment this file loads.
// vi.hoisted(...) exists exactly for this: it runs its callback at the same
// hoisted position as vi.mock, so the value is safe to reference inside the
// factory below.
const { mockHartmannInstance } = vi.hoisted(() => ({
  mockHartmannInstance: {
    id: 'gi1', planId: 'p1',
    templateSnapshot: {
      id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5, angleTrueNorthDeg: 0,
      originOffsetX: 0, originOffsetY: 0, color: '#d32f2f', vibratoryBase: 7,
    },
    originX: 0, originY: 0,
  },
}))

vi.mock('../domain/createGridForPlan')
vi.mock('./GridTemplatePicker', () => ({
  GridTemplatePicker: ({ onSelected }: { onSelected: (t: unknown) => void }) => (
    <button onClick={() => onSelected(mockHartmannInstance.templateSnapshot)}>simulate-select-hartmann</button>
  ),
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

  it('does not arm a bearing when "Valider" is clicked with an empty custom-angle input', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)
    await screen.findByTestId('map-view')

    // input starts empty; Number('') is 0 (not NaN), so the guard must also
    // check for the empty string explicitly rather than relying on NaN alone
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(screen.getByRole('button', { name: /placer/i })).toBeDisabled()
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

  const hartmannLine = {
    id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a' as const, polarity: '-' as const, reinforced: false,
    theoreticalPoints: [{ x: 0, y: -10 }, { x: 0, y: 10 }],
    adjustedPoints: [{ x: 0, y: -10 }, { x: 0, y: 10 }],
  }

  async function renderWithLineChangedOnce() {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([hartmannInstance])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([hartmannLine])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(gridLinesRepo.updateAdjustedPoints).mockResolvedValue(hartmannLine)

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)
    await screen.findByTestId('map-view')

    // Enter edit mode and show the Hartmann layer so EditableNetworkLine (mocked
    // above) renders its "simulate-line-change" trigger button.
    fireEvent.click(screen.getByLabelText(/mode édition/i))
    fireEvent.click(screen.getByLabelText('Hartmann'))
    fireEvent.click(await screen.findByText('simulate-line-change-gl1'))
  }

  it('shows the orthogonality-assist panel and preview after a line is adjusted', async () => {
    await renderWithLineChangedOnce()

    expect(await screen.findByTestId('orthogonality-preview')).toBeInTheDocument()
    expect(screen.getByText(/écart à l'orthogonal théorique/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /redresser/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ignorer/i })).toBeInTheDocument()
  })

  it('dismisses the orthogonality panel without further changes when "Ignorer" is clicked', async () => {
    await renderWithLineChangedOnce()
    await screen.findByTestId('orthogonality-preview')
    const updateCallsBeforeIgnore = vi.mocked(gridLinesRepo.updateAdjustedPoints).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: /ignorer/i }))

    expect(screen.queryByTestId('orthogonality-preview')).not.toBeInTheDocument()
    expect(vi.mocked(gridLinesRepo.updateAdjustedPoints).mock.calls.length).toBe(updateCallsBeforeIgnore)
  })

  it('straightens the line and persists the correctly-computed suggested points when "Redresser" is clicked', async () => {
    await renderWithLineChangedOnce()
    await screen.findByTestId('orthogonality-preview')
    const updateCallsBeforeAccept = vi.mocked(gridLinesRepo.updateAdjustedPoints).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: /redresser/i }))

    expect(screen.queryByTestId('orthogonality-preview')).not.toBeInTheDocument()
    // Accepting goes through handleLineChanged, which persists via updateAdjustedPoints —
    // and it must persist the actual straightened coordinates, not just "some" update.
    // The dragged line ([{x:0,y:-10},{x:1,y:10}], axis-a, angleTrueNorthDeg 0) should be
    // straightened to both endpoints at x≈0.5 (deviation split evenly, line made vertical).
    const { suggestedPoints } = getOrthogonalitySuggestion(
      [{ x: 0, y: -10 }, { x: 1, y: 10 }],
      'axis-a',
      { angleTrueNorthDeg: 0 }
    )
    const calls = vi.mocked(gridLinesRepo.updateAdjustedPoints).mock.calls
    expect(calls.length).toBeGreaterThan(updateCallsBeforeAccept)
    const [persistedLineId, persistedPoints] = calls[calls.length - 1]
    expect(persistedLineId).toBe('gl1')
    expect(persistedPoints).toHaveLength(2)
    expect(persistedPoints[0].x).toBeCloseTo(suggestedPoints[0].x)
    expect(persistedPoints[0].y).toBeCloseTo(suggestedPoints[0].y)
    expect(persistedPoints[1].x).toBeCloseTo(suggestedPoints[1].x)
    expect(persistedPoints[1].y).toBeCloseTo(suggestedPoints[1].y)
    // Sanity-check against the reviewer's hand-computed expectation directly,
    // so this test doesn't just check "matches whatever the function returns"
    // but that the function's own output is the mathematically correct one.
    expect(persistedPoints[0].x).toBeCloseTo(0.5)
    expect(persistedPoints[1].x).toBeCloseTo(0.5)
  })

  it('creates a grid end-to-end: pick template, click origin, set polarity, generate', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(createGridForPlan).mockResolvedValue({
      instance: mockHartmannInstance,
      lines: [],
    })

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByRole('button', { name: /ajouter une grille/i }))
    fireEvent.click(await screen.findByText('simulate-select-hartmann'))
    fireEvent.click(screen.getByText('simulate-map-click'))
    fireEvent.click(await screen.findByRole('button', { name: '+' }))
    fireEvent.click(screen.getByRole('button', { name: /générer/i }))

    await waitFor(() =>
      expect(createGridForPlan).toHaveBeenCalledWith(
        'p1',
        mockHartmannInstance.templateSnapshot,
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        '+'
      )
    )
  })

  it('does not let an in-progress guide-line placement leak into a grid-origin click, or vice versa', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(createGridForPlan).mockResolvedValue({
      instance: mockHartmannInstance,
      lines: [],
    })

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)
    await screen.findByTestId('map-view')

    // Arm the guide-line tool (bearing selected, "Placer ici" pressed) —
    // onMapClick is now wired up for the guide-line mode.
    fireEvent.click(screen.getByRole('button', { name: 'N/S' }))
    fireEvent.click(screen.getByRole('button', { name: /placer/i }))

    // Starting grid-origin placement must cancel the guide-line mode instead
    // of letting both flags be true — this is exactly the race the plan
    // calls out (handleGridOriginRequested clearing placingGuideLine).
    fireEvent.click(screen.getByRole('button', { name: /ajouter une grille/i }))
    fireEvent.click(await screen.findByText('simulate-select-hartmann'))
    fireEvent.click(screen.getByText('simulate-map-click'))

    // The click should have been consumed as the grid origin (polarity toggle
    // appears), not as a guide-line placement (no guide-line layer rendered).
    expect(await screen.findByRole('button', { name: '+' })).toBeInTheDocument()
    expect(screen.queryByTestId('guide-line')).not.toBeInTheDocument()

    // Symmetrically: re-arming the guide-line tool after a grid origin is
    // pending must cancel the grid-origin wait, so a subsequent click is
    // consumed as the guide-line anchor, not silently mis-set as an origin.
    fireEvent.click(screen.getByRole('button', { name: '+' }))
    fireEvent.click(screen.getByRole('button', { name: /générer/i }))
    await waitFor(() => expect(createGridForPlan).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'N/S' }))
    fireEvent.click(screen.getByRole('button', { name: /placer/i }))
    fireEvent.click(screen.getByText('simulate-map-click'))

    expect(await screen.findByTestId('guide-line')).toBeInTheDocument()
  })
})

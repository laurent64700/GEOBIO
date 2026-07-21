import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { SiteMapView } from './SiteMapView'
import * as gridInstancesRepo from '../data/gridInstancesRepo'
import * as gridLinesRepo from '../data/gridLinesRepo'
import * as feltPointsRepo from '../data/feltPointsRepo'
import * as feltSegmentsRepo from '../data/feltSegmentsRepo'
import * as gridTemplatesRepo from '../data/gridTemplatesRepo'
import * as buildingFootprintService from '../data/buildingFootprintService'
import * as missionsRepo from '../data/missionsRepo'
import * as phenomenaRepo from '../data/phenomenaRepo'
import { createGridForPlan } from '../domain/createGridForPlan'
import { getOrthogonalitySuggestion } from '../geometry/orthogonality'

vi.mock('../data/gridInstancesRepo')
vi.mock('../data/gridLinesRepo')
vi.mock('../data/feltPointsRepo')
vi.mock('../data/feltSegmentsRepo')
vi.mock('../data/gridTemplatesRepo')
vi.mock('../data/buildingFootprintService')
vi.mock('../data/missionsRepo')
vi.mock('../data/phenomenaRepo')

// SiteMapView.test.tsx mocks ./MapView down to a plain <div> — there is no
// real <MapContainer> anywhere in this test file, so a real, unmocked
// <Polygon> (which BuildingFootprintPicker renders per candidate) would
// crash on useLeafletContext() the moment candidates is non-empty. Mock it
// the same way NetworkLinesLayer/FeltPointsLayer/GuideLineLayer already are
// in this file — a stub that exposes just enough to drive the interaction
// under test.
vi.mock('./BuildingFootprintPicker', () => ({
  BuildingFootprintPicker: ({ candidates, onChoose }: { candidates: unknown[]; onChoose: (i: number) => void }) =>
    candidates.length > 0 ? <button onClick={() => onChoose(0)}>simulate-choose-building</button> : null,
}))
// Same reasoning as BuildingFootprintPicker above — BaguaLayer renders a real
// <Polygon> once visible/footprint are truthy, which would crash without a
// real Leaflet context.
vi.mock('./BaguaLayer', () => ({
  BaguaLayer: ({ visible }: { visible: boolean }) => (visible ? <div data-testid="bagua-layer" /> : null),
}))
// Same reasoning as BuildingFootprintPicker/BaguaLayer above —
// PathogenicCrossingsLayer renders a real <CircleMarker> per crossing, which
// would crash without a real Leaflet context.
vi.mock('./PathogenicCrossingsLayer', () => ({
  PathogenicCrossingsLayer: ({ crossings, visible }: { crossings: unknown[]; visible: boolean }) =>
    visible ? <div data-testid="pathogenic-crossings-count">{crossings.length}</div> : null,
}))
// Same reasoning as BuildingFootprintPicker/BaguaLayer/PathogenicCrossingsLayer
// above — PhenomenaLayer renders a real <CircleMarker>/<Tooltip> per
// phenomenon, which would crash without a real Leaflet context.
vi.mock('./PhenomenaLayer', () => ({
  PhenomenaLayer: ({ visible, phenomena }: { visible: boolean; phenomena: unknown[] }) =>
    visible ? <div data-testid="phenomena-count">{phenomena.length}</div> : null,
}))

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
vi.mock('./FeltSegmentsLayer', () => ({
  FeltSegmentsLayer: ({ visible }: { visible: boolean }) => (visible ? <div data-testid="felt-segments" /> : null),
}))
vi.mock('./GuideLineLayer', () => ({
  GuideLineLayer: ({ anchor, bearingDeg }: { anchor: { x: number; y: number } | null; bearingDeg: number | null }) =>
    anchor !== null && bearingDeg !== null ? <div data-testid="guide-line" /> : null,
}))
vi.mock('./OrthogonalitySuggestion', () => ({
  OrthogonalitySuggestion: () => <div data-testid="orthogonality-preview" />,
}))
vi.mock('./EditableNetworkLine', () => ({
  EditableNetworkLine: ({ line, onChanged }: { line: { id: string; adjustedPoints: { x: number; y: number }[] }; onChanged: (l: unknown, changeKind: 'drag' | 'vertex-added') => void }) => (
    <>
      <button onClick={() => onChanged({ ...line, adjustedPoints: [{ x: 0, y: -10 }, { x: 1, y: 10 }] }, 'drag')}>
        simulate-line-change-{line.id}
      </button>
      <button onClick={() => onChanged({ ...line, adjustedPoints: [{ x: 0, y: -10 }, { x: 0.5, y: 0 }, { x: 1, y: 10 }] }, 'vertex-added')}>
        simulate-vertex-added-{line.id}
      </button>
    </>
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
  beforeEach(() => {
    vi.clearAllMocks()
    // Deviation from the plan's literal snippet: vi.mock('../data/buildingFootprintService')
    // above applies file-wide, so every pre-existing test in this file (not
    // just the 3 new ones added for Task 8) now triggers SiteMapView's
    // building-footprint useEffect. Without a default resolved value here,
    // the auto-mocked fetchBuildingsInBounds returns undefined, `found.length`
    // throws, and setError fires — breaking every pre-existing test with an
    // unrelated "error" state. Default to "no buildings found nearby" so
    // existing tests are unaffected; individual tests below override this
    // with mockResolvedValue/mockRejectedValue as needed.
    vi.mocked(buildingFootprintService.fetchBuildingsInBounds).mockResolvedValue([])
    vi.mocked(gridTemplatesRepo.listGridTemplates).mockResolvedValue([])
    vi.mocked(feltSegmentsRepo.listFeltSegmentsForPlan).mockResolvedValue([])
    vi.mocked(phenomenaRepo.listPhenomenaForPlan).mockResolvedValue([])
  })

  it('loads instances/lines/felt points, shows felt points by default and grid layers hidden by default', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([hartmannInstance])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    expect(await screen.findByTestId('felt-points')).toBeInTheDocument()
    expect(screen.queryByTestId('lines-Hartmann')).not.toBeInTheDocument()
  })

  it('loads felt segments and shows the layer by default', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(feltSegmentsRepo.listFeltSegmentsForPlan).mockResolvedValue([
      { id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 }, createdAt: '2026-07-20T10:00:00Z' },
    ])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    expect(await screen.findByTestId('felt-segments')).toBeInTheDocument()
  })

  it('toggling "Tiges (segments ressentis)" off hides the felt segments that were visible by default', async () => {
    // Regression test: toggleLayer's default-visibility computation used to
    // only special-case FELT_POINTS_LAYER_ID, so any other default-visible
    // layer's first click computed currentlyVisible as false (already
    // matching its rendered-visible state) and set it back to true — a
    // silent no-op. This would have affected the felt-points checkbox too,
    // had it ever been exercised this way.
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(feltSegmentsRepo.listFeltSegmentsForPlan).mockResolvedValue([
      { id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 }, createdAt: '2026-07-20T10:00:00Z' },
    ])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    await screen.findByTestId('felt-segments')
    fireEvent.click(await screen.findByLabelText('Tiges (segments ressentis)'))

    await waitFor(() => expect(screen.queryByTestId('felt-segments')).not.toBeInTheDocument())
  })

  it('fetches grid templates alongside instances/lines/felt points', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(gridTemplatesRepo.listGridTemplates).mockResolvedValue([
      { id: 't-peyre', name: 'Peyré', spacingXM: 6.5, spacingYM: 7.25, angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#8e5fb3', vibratoryBase: 7 },
    ])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    await waitFor(() => expect(gridTemplatesRepo.listGridTemplates).toHaveBeenCalled())
  })

  it('toggling the Hartmann layer in the panel shows its lines', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([hartmannInstance])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    await screen.findByTestId('felt-points')
    fireEvent.click(await screen.findByLabelText('Hartmann'))

    await waitFor(() => expect(screen.getByTestId('lines-Hartmann')).toBeInTheDocument())
  })

  it('toggling "Ressenti terrain" off hides the felt points that were visible by default', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([hartmannInstance])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

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

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })

  it('places a guide line at the clicked point once a bearing preset and "placer" are active', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByRole('button', { name: 'N/S' }))
    fireEvent.click(screen.getByRole('button', { name: /placer/i }))
    fireEvent.click(screen.getByText('simulate-map-click'))

    expect(await screen.findByTestId('guide-line')).toBeInTheDocument()
  })

  it('does not place a guide line from a map click when "placer" is not active', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByRole('button', { name: 'N/S' }))
    // no "Placer" click this time — onMapClick shouldn't even be wired up
    expect(screen.queryByText('simulate-map-click')).not.toBeInTheDocument()
  })

  it('also places a guide line using the E/O preset (not just N/S)', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByRole('button', { name: 'E/O' }))
    fireEvent.click(screen.getByRole('button', { name: /placer/i }))
    fireEvent.click(screen.getByText('simulate-map-click'))

    expect(await screen.findByTestId('guide-line')).toBeInTheDocument()
  })

  it('places a guide line using the 135° preset', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByRole('button', { name: '135°' }))
    fireEvent.click(screen.getByRole('button', { name: /placer/i }))
    fireEvent.click(screen.getByText('simulate-map-click'))

    expect(await screen.findByTestId('guide-line')).toBeInTheDocument()
  })

  it('places a guide line using a custom bearing entered via the numeric input', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
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

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
    await screen.findByTestId('map-view')

    // input starts empty; Number('') is 0 (not NaN), so the guard must also
    // check for the empty string explicitly rather than relying on NaN alone
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(screen.getByRole('button', { name: /placer/i })).toBeDisabled()
  })

  it('stops forwarding map clicks to the guide line after one placement, until "placer" is pressed again', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
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

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
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

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
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

  async function renderWithVertexAddedOnce() {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([hartmannInstance])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([hartmannLine])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(gridLinesRepo.updateAdjustedPoints).mockResolvedValue(hartmannLine)

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByLabelText(/mode édition/i))
    fireEvent.click(screen.getByLabelText('Hartmann'))
    fireEvent.click(await screen.findByText('simulate-vertex-added-gl1'))
  }

  it('does not show the orthogonality-review panel after a vertex-added change', async () => {
    await renderWithVertexAddedOnce()
    expect(screen.queryByText(/écart à l'orthogonal théorique/i)).not.toBeInTheDocument()
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

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
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

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
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

  it('clearing an already-placed guide line does not cancel an unrelated pending grid-origin request', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(createGridForPlan).mockResolvedValue({ instance: mockHartmannInstance, lines: [] })

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
    await screen.findByTestId('map-view')

    // 1. Place a guide line successfully — guideLineAnchor is now set, no mode pending.
    fireEvent.click(screen.getByRole('button', { name: 'N/S' }))
    fireEvent.click(screen.getByRole('button', { name: /placer/i }))
    fireEvent.click(screen.getByText('simulate-map-click'))
    expect(await screen.findByTestId('guide-line')).toBeInTheDocument()

    // 2. Start a grid-origin request — pending, does NOT touch guideLineAnchor,
    // so "Effacer" (disabled only when guideLineAnchor is null) stays enabled.
    fireEvent.click(screen.getByRole('button', { name: /ajouter une grille/i }))
    fireEvent.click(await screen.findByText('simulate-select-hartmann'))

    // 3. Clear the (old, already-placed) guide line.
    fireEvent.click(screen.getByRole('button', { name: 'Effacer' }))
    expect(screen.queryByTestId('guide-line')).not.toBeInTheDocument()

    // 4. The map click should STILL complete the grid-origin placement that was
    // pending before step 3 — proving Effacer didn't silently cancel it. If it
    // did, this click would do nothing and the polarity toggle would never appear.
    fireEvent.click(screen.getByText('simulate-map-click'))
    expect(await screen.findByRole('button', { name: '+' })).toBeInTheDocument()
  })

  it('resets GridCreationPanel back to collapsed after a successful "Générer", so a second grid can be created', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(createGridForPlan).mockResolvedValue({
      instance: mockHartmannInstance,
      lines: [],
    })

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByRole('button', { name: /ajouter une grille/i }))
    fireEvent.click(await screen.findByText('simulate-select-hartmann'))
    fireEvent.click(screen.getByText('simulate-map-click'))
    fireEvent.click(await screen.findByRole('button', { name: '+' }))
    fireEvent.click(screen.getByRole('button', { name: /générer/i }))

    await waitFor(() => expect(createGridForPlan).toHaveBeenCalled())

    // Without a reset mechanism, GridCreationPanel's own expanded/template
    // state would survive the generate and its derived step would fall back
    // to "awaiting-origin" forever (pendingGridOrigin/awaitingGridOrigin were
    // cleared, but the panel never learns that) — permanently showing
    // "cliquez l'origine" with nothing listening for a click, and no way to
    // get back to "Ajouter une grille" for a second grid.
    expect(await screen.findByRole('button', { name: /ajouter une grille/i })).toBeInTheDocument()
    expect(screen.queryByText(/cliquez l'origine/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /générer/i })).not.toBeInTheDocument()
  })

  it('routes a map click to the guide-line tool, not grid-origin placement, when "Placer ici" cancels a pending grid-origin request', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
    await screen.findByTestId('map-view')

    // Start grid creation and pick a template — this sets awaitingGridOrigin
    // and shows "Cliquez l'origine sur la carte", but deliberately don't
    // click the map yet.
    fireEvent.click(screen.getByRole('button', { name: /ajouter une grille/i }))
    fireEvent.click(await screen.findByText('simulate-select-hartmann'))
    expect(screen.getByText(/cliquez l'origine sur la carte/i)).toBeInTheDocument()

    // Arm the guide-line tool instead and press "Placer ici" — this must
    // cancel the pending grid-origin request AND reset GridCreationPanel so
    // it doesn't keep showing a stale "cliquez l'origine" prompt for a click
    // that will actually place a guide-line anchor.
    fireEvent.click(screen.getByRole('button', { name: 'N/S' }))
    fireEvent.click(screen.getByRole('button', { name: /placer/i }))

    expect(screen.queryByText(/cliquez l'origine/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ajouter une grille/i })).toBeInTheDocument()

    fireEvent.click(screen.getByText('simulate-map-click'))

    // The click must land on the guide-line tool, not be silently swallowed
    // as a grid origin (which would show the polarity toggle instead).
    expect(await screen.findByTestId('guide-line')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument()
  })

  it('shows the building footprint picker when none is stored yet, and confirms one into place', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(buildingFootprintService.fetchBuildingsInBounds).mockResolvedValue([
      { ringsLatLng: [[{ lat: 48.8566, lng: 2.3522 }, { lat: 48.8567, lng: 2.3522 }, { lat: 48.8567, lng: 2.3523 }]] },
    ])
    // No shared Mission fixture exists in this test file today (grep it
    // first to confirm before assuming otherwise) — construct one inline,
    // matching every field on src/domain/types.ts's Mission interface.
    vi.mocked(missionsRepo.setBuildingFootprint).mockResolvedValue({
      id: 'm1', address: 'A', missionDate: '2026-07-20', declinationDeg: null,
      originLat: 48.8566, originLng: 2.3522,
      causeArchitectural: null, causeElectromagnetique: null, causeGeobiologique: null,
      causeParanormale: null, causeAutres: null, bovisRate: null, parcelRefs: [],
      buildingFootprint: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
    })

    render(
      <SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />
    )

    fireEvent.click(await screen.findByText('simulate-choose-building'))

    await waitFor(() => expect(missionsRepo.setBuildingFootprint).toHaveBeenCalled())
  })

  it('shows a clear message when no building is found even after widening the search', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(buildingFootprintService.fetchBuildingsInBounds).mockResolvedValue([]) // both calls return empty

    render(
      <SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />
    )

    expect(await screen.findByText(/aucun bâtiment détecté/i)).toBeInTheDocument()
    expect(buildingFootprintService.fetchBuildingsInBounds).toHaveBeenCalledTimes(2) // 100m then 300m
  })

  it('surfaces a building-fetch error as a dismissible card without replacing the map (spec §7: non-blocking)', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([hartmannInstance])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(buildingFootprintService.fetchBuildingsInBounds).mockRejectedValue(
      new Error('Impossible de charger les bâtiments : 500')
    )

    render(
      <SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les bâtiments : 500')
    // The building/Bagua flow is optional (spec §7: "pas de blocage du reste
    // du relevé") — the map, layer panel and felt points must stay usable,
    // unlike the full-replacement `error` state for initial grid loads.
    expect(screen.getByTestId('map-view')).toBeInTheDocument()
    expect(screen.getByTestId('felt-points')).toBeInTheDocument()
    expect(screen.getByLabelText('Hartmann')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('map-view')).toBeInTheDocument()
  })

  it('re-fires the building fetch when "Réessayer" is clicked after a failure', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    // First attempt fails; the retry succeeds with one candidate.
    vi.mocked(buildingFootprintService.fetchBuildingsInBounds)
      .mockRejectedValueOnce(new Error('Impossible de charger les bâtiments : 500'))
      .mockResolvedValue([
        { ringsLatLng: [[{ lat: 48.8566, lng: 2.3522 }, { lat: 48.8567, lng: 2.3522 }, { lat: 48.8567, lng: 2.3523 }]] },
      ])

    render(
      <SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />
    )
    await screen.findByRole('alert')
    const callsBeforeRetry = vi.mocked(buildingFootprintService.fetchBuildingsInBounds).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(await screen.findByText('simulate-choose-building')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      vi.mocked(buildingFootprintService.fetchBuildingsInBounds).mock.calls.length
    ).toBeGreaterThan(callsBeforeRetry)
  })

  it('surfaces a failed footprint save as a dismissible card without replacing the map', async () => {
    // The S1.1 production scenario: migration 0012 not pushed →
    // setBuildingFootprint rejects with a Postgres error. The whole
    // mission workspace must survive it.
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(buildingFootprintService.fetchBuildingsInBounds).mockResolvedValue([
      { ringsLatLng: [[{ lat: 48.8566, lng: 2.3522 }, { lat: 48.8567, lng: 2.3522 }, { lat: 48.8567, lng: 2.3523 }]] },
    ])
    vi.mocked(missionsRepo.setBuildingFootprint).mockRejectedValue(
      new Error("Impossible d'enregistrer le contour du bâtiment : column does not exist")
    )

    render(
      <SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />
    )

    fireEvent.click(await screen.findByText('simulate-choose-building'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/impossible d'enregistrer le contour/i)
    expect(screen.getByTestId('map-view')).toBeInTheDocument()
  })

  it("drops a superseded building fetch's late result instead of clobbering the newer run's state", async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    // Run 1's fetch (for the initial origin) stays in flight until we resolve
    // it by hand; every later call (run 2 for the new origin, incl. its 300m
    // widening) resolves [] immediately via the beforeEach default.
    let resolveStaleFetch!: (found: buildingFootprintService.BuildingFootprint[]) => void
    vi.mocked(buildingFootprintService.fetchBuildingsInBounds).mockImplementationOnce(
      () => new Promise((resolve) => { resolveStaleFetch = resolve })
    )

    const { rerender } = render(
      <SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />
    )
    await screen.findByTestId('map-view')

    // Origin changes while run 1's fetch is still in flight — the effect
    // cleanup must abort run 1, and run 2 fetches for the new origin.
    rerender(
      <SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 45.0, lng: 5.0 }} initialBuildingFootprint={null} />
    )

    // Run 2 (the current one) finds nothing even after widening.
    expect(await screen.findByText(/aucun bâtiment détecté/i)).toBeInTheDocument()

    // Now the SUPERSEDED run 1 resolves late with a candidate for the OLD
    // origin. Without the AbortController + aborted guards, it would
    // overwrite buildingCandidates and hide the (correct) empty-state message.
    await act(async () => {
      resolveStaleFetch([{ ringsLatLng: [[{ lat: 48.8566, lng: 2.3522 }]] }])
    })

    expect(screen.queryByText('simulate-choose-building')).not.toBeInTheDocument()
    expect(screen.getByText(/aucun bâtiment détecté/i)).toBeInTheDocument()

    // And the effect actually hands its AbortSignal to the service (both
    // services accept one) — otherwise nothing in flight can be cancelled.
    const calls = vi.mocked(buildingFootprintService.fetchBuildingsInBounds).mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(2)
    for (const call of calls) {
      expect(call[1]).toBeInstanceOf(AbortSignal)
    }
  })

  it('stacks the orthogonality panel and the Bagua legend in a single bottom-right overlay when both are visible', async () => {
    // Regression test for the two-sibling-<OverlayPanel corner="bottom-right">
    // bug: each instance is absolutely positioned at bottom:8/right:8, so two
    // sibling instances overlap instead of stacking. Both cards must live in
    // ONE bottom-right OverlayPanel (whose flex column stacks its children).
    await renderWithLineChangedOnce()
    await screen.findByText(/écart à l'orthogonal théorique/i)

    fireEvent.click(screen.getByLabelText(/bagua/i))
    await screen.findByText(/bagua : 8 secteurs/i)

    // Both pieces of content are on screen simultaneously...
    expect(screen.getByText(/écart à l'orthogonal théorique/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /redresser/i })).toBeInTheDocument()
    // ...inside exactly ONE bottom-right-positioned wrapper, not two
    // overlapping ones. OverlayPanel is the only thing rendering
    // absolutely-positioned bottom/right offsets in this tree.
    const bottomRightWrappers = Array.from(document.querySelectorAll('div')).filter(
      (div) => div.style.position === 'absolute' && div.style.bottom !== '' && div.style.right !== ''
    )
    expect(bottomRightWrappers).toHaveLength(1)
    // And that single wrapper contains both cards.
    expect(bottomRightWrappers[0]).toContainElement(screen.getByText(/écart à l'orthogonal théorique/i))
    expect(bottomRightWrappers[0]).toContainElement(screen.getByText(/bagua : 8 secteurs/i))
  })

  it('shows the Bagua legend collapsed by default when the layer is toggled visible, expanding only on "Détails"', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(
      <SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />
    )
    await screen.findByTestId('map-view')

    fireEvent.click(screen.getByLabelText(/bagua/i))

    expect(await screen.findByText(/bagua : 8 secteurs/i)).toBeInTheDocument()
    expect(screen.queryByText('Carrière')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Détails' }))

    expect(screen.getByText('Carrière')).toBeInTheDocument()
  })

  it('computes and shows Hartmann×Curry crossings once the layer is toggled visible', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([
      { id: 'gi-h', planId: 'p1', templateSnapshot: { id: 't-h', name: 'Hartmann', spacingXM: 1.8, spacingYM: 2.5, angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f', vibratoryBase: 7 }, originX: 0, originY: 0 },
      { id: 'gi-c', planId: 'p1', templateSnapshot: { id: 't-c', name: 'Curry', spacingXM: 4, spacingYM: 4, angleTrueNorthDeg: 45, originOffsetX: 0, originOffsetY: 0, color: '#f2c230', vibratoryBase: 5 }, originX: 0, originY: 0 },
    ])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockImplementation(async (instanceId) =>
      instanceId === 'gi-h'
        ? [{ id: 'h1', gridInstanceId: 'gi-h', family: 'axis-a', polarity: '+', reinforced: false, theoreticalPoints: [{ x: 0, y: -5 }, { x: 0, y: 5 }], adjustedPoints: [{ x: 0, y: -5 }, { x: 0, y: 5 }] }]
        : [{ id: 'c1', gridInstanceId: 'gi-c', family: 'axis-b', polarity: '+', reinforced: false, theoreticalPoints: [{ x: -5, y: 0 }, { x: 5, y: 0 }], adjustedPoints: [{ x: -5, y: 0 }, { x: 5, y: 0 }] }]
    )
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    fireEvent.click(await screen.findByLabelText(/croisements pathogènes/i))

    expect(await screen.findByTestId('pathogenic-crossings-count')).toHaveTextContent('1')
  })

  it('places a phenomenon on map click once a kind is selected', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(phenomenaRepo.listPhenomenaForPlan).mockResolvedValue([])
    vi.mocked(phenomenaRepo.createPhenomenon).mockResolvedValue({
      id: 'ph1', planId: 'p1', kind: 'spire-vortex', x: 1, y: 1, createdAt: '2026-07-21T10:00:00Z',
    })

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    fireEvent.click(await screen.findByRole('button', { name: /spire de vortex/i }))
    fireEvent.click(await screen.findByText('simulate-map-click'))

    await waitFor(() =>
      expect(phenomenaRepo.createPhenomenon).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 'p1', kind: 'spire-vortex' })
      )
    )
    fireEvent.click(screen.getByLabelText(/phénomènes ponctuels/i))
    expect(await screen.findByTestId('phenomena-count')).toHaveTextContent('1')
  })
})

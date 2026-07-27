import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import { SiteMapView } from './SiteMapView'
import * as gridInstancesRepo from '../data/gridInstancesRepo'
import * as gridLinesRepo from '../data/gridLinesRepo'
import * as feltPointsRepo from '../data/feltPointsRepo'
import * as feltSegmentsRepo from '../data/feltSegmentsRepo'
import * as gridTemplatesRepo from '../data/gridTemplatesRepo'
import * as buildingFootprintService from '../data/buildingFootprintService'
import * as missionsRepo from '../data/missionsRepo'
import * as phenomenaRepo from '../data/phenomenaRepo'
import * as freeformNetworksRepo from '../data/freeformNetworksRepo'
import * as plansRepo from '../data/plansRepo'
import * as contextObjectsRepo from '../data/contextObjectsRepo'
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
vi.mock('../data/freeformNetworksRepo')
vi.mock('../data/plansRepo')
vi.mock('../data/contextObjectsRepo')

// Same reasoning as the BuildingFootprintPicker mock below: CalibratedPlanOverlay
// calls react-leaflet's useMap(), which throws outside a real <MapContainer> —
// and this file's ./MapView mock is a plain <div>, not one.
vi.mock('./CalibratedPlanOverlay', () => ({
  CalibratedPlanOverlay: ({ imageUrl, visible }: { imageUrl: string; visible: boolean }) =>
    visible ? <div data-testid="calibrated-plan-overlay" data-image-url={imageUrl} /> : null,
}))

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
vi.mock('./ContextObjectsLayer', () => ({
  ContextObjectsLayer: ({ visible, objects }: { visible: boolean; objects: unknown[] }) =>
    visible ? <div data-testid="context-objects-count">{objects.length}</div> : null,
}))
vi.mock('./FreeformDrawTool', () => ({
  FreeformDrawTool: ({ active, onComplete }: { active: boolean; onComplete: (points: unknown[]) => void }) =>
    active ? <button onClick={() => onComplete([{ x: 0, y: 0 }, { x: 1, y: 1 }])}>simulate-freeform-complete</button> : null,
}))
vi.mock('./FreeformNetworkLayer', () => ({
  FreeformNetworkLayer: ({ visible, networks }: { visible: boolean; networks: unknown[] }) =>
    visible ? <div data-testid="freeform-count">{networks.length}</div> : null,
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
  FeltSegmentsLayer: ({
    visible,
    segments,
    onSegmentClick,
  }: {
    visible: boolean
    segments: { id: string }[]
    onSegmentClick?: (segment: { id: string }) => void
  }) =>
    visible ? (
      <div data-testid="felt-segments">
        {onSegmentClick &&
          segments.map((s) => <button key={s.id} onClick={() => onSegmentClick(s)}>simulate-pick-{s.id}</button>)}
      </div>
    ) : null,
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
    vi.mocked(contextObjectsRepo.listContextObjectsForPlan).mockResolvedValue([])
    vi.mocked(freeformNetworksRepo.listFreeformNetworksForPlan).mockResolvedValue([])
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([])
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
      { id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 }, polarityA: null, polarityB: null, createdAt: '2026-07-20T10:00:00Z' },
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
      { id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 }, polarityA: null, polarityB: null, createdAt: '2026-07-20T10:00:00Z' },
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

  it('renders the calibrated interior plan overlay, visible by default, when one exists for the mission', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([
      { id: 'p-ext', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null },
      {
        id: 'p-int', missionId: 'm1', kind: 'interieur', imageUrl: 'https://x/plan.jpg',
        calibration: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      },
    ])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    const overlay = await screen.findByTestId('calibrated-plan-overlay')
    expect(overlay).toHaveAttribute('data-image-url', 'https://x/plan.jpg')
  })

  it('does not render the interior plan overlay when no interior plan has both an image and a completed calibration', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([
      { id: 'p-ext', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null },
    ])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
    await screen.findByTestId('map-view')

    expect(screen.queryByTestId('calibrated-plan-overlay')).not.toBeInTheDocument()
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

  describe('grid recalibration on a crossing of 2 felt segments', () => {
    const verticalSegment = {
      id: 'fs1', planId: 'p1', networkName: 'Hartmann',
      pointA: { x: 5, y: -1 }, pointB: { x: 5, y: 1 },
      polarityA: '+' as const, polarityB: '-' as const, createdAt: '2026-07-23T10:00:00Z',
    }
    const horizontalSegment = {
      id: 'fs2', planId: 'p1', networkName: 'Hartmann',
      pointA: { x: 4, y: 3 }, pointB: { x: 6, y: 3 },
      polarityA: '+' as const, polarityB: '-' as const, createdAt: '2026-07-23T10:01:00Z',
    }
    const nearParallelSegment = {
      // Nearly vertical (small x drift over a large y span) — within ~5.7° of
      // verticalSegment's own direction, below the 10° trust threshold.
      id: 'fs3', planId: 'p1', networkName: 'Hartmann',
      pointA: { x: 4, y: -1 }, pointB: { x: 4.2, y: 1 },
      polarityA: '+' as const, polarityB: '-' as const, createdAt: '2026-07-23T10:02:00Z',
    }

    async function renderArmedForCalibration(segments: typeof verticalSegment[]) {
      vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([hartmannInstance])
      vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([hartmannLine])
      vi.mocked(feltSegmentsRepo.listFeltSegmentsForPlan).mockResolvedValue(segments)
      vi.mocked(gridInstancesRepo.updateGridInstanceOrigin).mockResolvedValue({
        ...hartmannInstance, originX: 5, originY: 3,
      })
      vi.mocked(gridLinesRepo.updateLinePoints).mockResolvedValue(hartmannLine)

      render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)
      await screen.findByTestId('map-view')

      fireEvent.click(screen.getByLabelText('Hartmann')) // make the grid layer visible
      fireEvent.click(screen.getByLabelText(/recaler la grille/i))
    }

    it('computes the crossing of the 2 picked segments and rigidly translates the grid instance + its lines onto it', async () => {
      await renderArmedForCalibration([verticalSegment, horizontalSegment])

      fireEvent.click(await screen.findByText('simulate-pick-fs1'))
      fireEvent.click(screen.getByText('simulate-pick-fs2'))

      await waitFor(() => expect(gridInstancesRepo.updateGridInstanceOrigin).toHaveBeenCalledWith('gi1', 5, 3))
      // hartmannLine's points are [{x:0,y:-10},{x:0,y:10}] and the instance's
      // original origin is (0,0), so translating onto crossing (5,3) shifts
      // every point by exactly (+5,+3).
      expect(gridLinesRepo.updateLinePoints).toHaveBeenCalledWith(
        'gl1',
        [{ x: 5, y: -7 }, { x: 5, y: 13 }],
        [{ x: 5, y: -7 }, { x: 5, y: 13 }]
      )
      // Picking mode closes itself after a successful recalibration.
      expect(screen.queryByText(/tiges déjà relevées/i)).not.toBeInTheDocument()
    })

    it('shows a dismissible error and resets the picks when the 2 segments are too close to parallel', async () => {
      await renderArmedForCalibration([verticalSegment, nearParallelSegment])

      fireEvent.click(await screen.findByText('simulate-pick-fs1'))
      fireEvent.click(screen.getByText('simulate-pick-fs3'))

      expect(await screen.findByRole('alert')).toHaveTextContent(/parallèles/i)
      expect(gridInstancesRepo.updateGridInstanceOrigin).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
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

  it('renders the orthogonality-review card inside the lone remaining bottom-right overlay', async () => {
    // Was a regression test for the OLD two-sibling-<OverlayPanel
    // corner="bottom-right"> bug, where the orthogonality card and the Bagua
    // legend shared one bottom-right panel to avoid overlapping absolutely-
    // positioned siblings. That premise is gone now that Bagua moved into
    // the sidebar accordion (spec §3) — there is only ever one bottom-right
    // OverlayPanel left (the orthogonality card), so the thing worth
    // asserting is simply that it renders inside it; Bagua's presence in the
    // sidebar is covered elsewhere (the "shows the Bagua legend collapsed by
    // default..." test below), not here.
    await renderWithLineChangedOnce()
    await screen.findByText(/écart à l'orthogonal théorique/i)

    expect(screen.getByRole('button', { name: /redresser/i })).toBeInTheDocument()
    // Exactly ONE bottom-right-positioned wrapper exists, and it contains the
    // orthogonality card. OverlayPanel is the only thing rendering
    // absolutely-positioned bottom/right offsets in this tree.
    const bottomRightWrappers = Array.from(document.querySelectorAll('div')).filter(
      (div) => div.style.position === 'absolute' && div.style.bottom !== '' && div.style.right !== ''
    )
    expect(bottomRightWrappers).toHaveLength(1)
    expect(bottomRightWrappers[0]).toContainElement(screen.getByText(/écart à l'orthogonal théorique/i))
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

  it('places a context object on map click once a kind is selected, and can place a second of the same kind without reselecting', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(contextObjectsRepo.listContextObjectsForPlan).mockResolvedValue([])
    vi.mocked(contextObjectsRepo.createContextObject)
      .mockResolvedValueOnce({ id: 'co1', planId: 'p1', kind: 'arbre-chene', x: 1, y: 1, createdAt: '2026-07-27T10:00:00Z' })
      .mockResolvedValueOnce({ id: 'co2', planId: 'p1', kind: 'arbre-chene', x: 2, y: 2, createdAt: '2026-07-27T10:01:00Z' })

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    fireEvent.click(await screen.findByRole('button', { name: /arbre \(chêne\)/i }))
    fireEvent.click(await screen.findByText('simulate-map-click'))

    await waitFor(() =>
      expect(contextObjectsRepo.createContextObject).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 'p1', kind: 'arbre-chene' })
      )
    )

    // Placing a second one shouldn't require reselecting the kind.
    fireEvent.click(screen.getByText('simulate-map-click'))
    await waitFor(() => expect(contextObjectsRepo.createContextObject).toHaveBeenCalledTimes(2))

    expect(await screen.findByTestId('context-objects-count')).toHaveTextContent('2')
  })

  it('captures a freeform trace, submits metadata, and saves it', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(phenomenaRepo.listPhenomenaForPlan).mockResolvedValue([])
    vi.mocked(freeformNetworksRepo.listFreeformNetworksForPlan).mockResolvedValue([])
    vi.mocked(freeformNetworksRepo.createFreeformNetwork).mockResolvedValue({
      id: 'fn1', planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      currentBearingDeg: null, depthM: null, flowRate: null, createdAt: '2026-07-21T10:00:00Z',
    })

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    fireEvent.click(await screen.findByRole('button', { name: /tracer l'eau/i }))
    fireEvent.click(await screen.findByText('simulate-freeform-complete'))
    // The guide-line "Angle personnalisé" card also has its own "Valider"
    // button with the same visible text, so plain /valider/i is ambiguous —
    // FreeformMetadataForm's submit button carries a distinguishing
    // aria-label ("Valider le tracé") instead of relying on DOM order.
    fireEvent.click(await screen.findByRole('button', { name: /valider le tracé/i })) // all fields left blank

    await waitFor(() =>
      expect(freeformNetworksRepo.createFreeformNetwork).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })
      )
    )
    fireEvent.click(screen.getByLabelText(/tracés eau\/faille/i))
    expect(await screen.findByTestId('freeform-count')).toHaveTextContent('1')
  })

  it('renders a dismissible error card and keeps the metadata form open when the hook reports a freeformSaveError', async () => {
    // Thin rendering-only counterpart to the hook-state test now covering
    // handleSubmitFreeformMetadata's failure path in
    // usePlacementMode.test.ts ("keeps freeformSaveError and
    // pendingFreeformTrace across a failed save..."). This test only checks
    // that SiteMapView renders correctly off the hook's exposed
    // freeformSaveError/pendingFreeformTrace values — not the hook's own
    // state-transition logic.
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(freeformNetworksRepo.createFreeformNetwork)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        id: 'fn1', planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        currentBearingDeg: null, depthM: null, flowRate: null, createdAt: '2026-07-21T10:00:00Z',
      })

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    fireEvent.click(await screen.findByRole('button', { name: /tracer l'eau/i }))
    fireEvent.click(await screen.findByText('simulate-freeform-complete'))

    // First submit attempt fails.
    fireEvent.click(await screen.findByRole('button', { name: /valider le tracé/i }))
    await waitFor(() => expect(freeformNetworksRepo.createFreeformNetwork).toHaveBeenCalledTimes(1))

    // The failure must surface as a dismissible message, NOT the page-blocking
    // `error` state — the map/overlay must still be present, proving the whole
    // view wasn't replaced by <p role="alert">.
    expect(screen.getByText('network down')).toBeInTheDocument()
    expect(screen.getByTestId('map-view')).toBeInTheDocument()

    // The metadata form must still be present — the trace was NOT discarded.
    expect(screen.getByRole('button', { name: /valider le tracé/i })).toBeInTheDocument()

    // Retry, without redrawing — succeeds this time, and both the form and
    // the error message should now be gone.
    fireEvent.click(screen.getByRole('button', { name: /valider le tracé/i }))
    await waitFor(() => expect(screen.queryByRole('button', { name: /valider le tracé/i })).not.toBeInTheDocument())
    expect(screen.queryByText('network down')).not.toBeInTheDocument()
  })

  it('places a felt point via FeltPointPicker: select a network, click the map, confirm polarity, segment is created', async () => {
    // Superseded by the felt-segment/polarity protocol correction (spec:
    // network felt points are a manually-oriented 1m segment with a polarity
    // chosen at each end, not a single point) — createFeltPoint is no longer
    // called from this flow at all; createFeltSegment is.
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
    vi.mocked(feltSegmentsRepo.createFeltSegment).mockResolvedValue({
      id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 1, y: 0 },
      polarityA: '+', polarityB: '-', createdAt: '2026-07-22T10:00:00Z',
    })

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Hartmann' }))
    // MapView's test mock (this file's own top-of-file vi.mock('./MapView', ...))
    // renders a plain <div data-testid="map-view"> with NO click handler of its
    // own — onMapClick only fires from a nested
    // <button>simulate-map-click</button>, rendered when onMapClick is truthy.
    // Every other map-click-driven test in this file (e.g. the guide-line
    // placement test) clicks that button, not the outer div — do the same here.
    fireEvent.click(screen.getByText('simulate-map-click'))

    // The click only stages a pendingFeltSegment — FeltSegmentPolarityForm
    // must be confirmed before anything is persisted.
    fireEvent.click(await screen.findByRole('button', { name: 'Valider le segment' }))

    await waitFor(() => expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'p1', networkName: 'Hartmann', polarityA: '+', polarityB: '-' })
    ))
  })

  // Scoped to the "Ligne guide" accordion section specifically: once a
  // network is armed, FeltPointPicker (in the sidebar's pinned band) renders
  // its OWN orientation buttons with the exact same labels (N/S/E/O/45°/135°)
  // for the felt-segment's own bearing — a deliberate, separate control for a
  // different purpose (spec: segment orientation, not guide-line placement).
  // An unscoped query is genuinely ambiguous between the two; these tests
  // only ever cared about the guide-line accordion's own preset set.
  function guideLineSection(): HTMLElement {
    const details = screen.getByText('Ligne guide').closest('details')
    if (!details) throw new Error('Ligne guide accordion section not found')
    return details as HTMLElement
  }

  it('shows only N/S and E/O guide-line presets while Hartmann is armed for felt-point placement', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Hartmann' }))

    const section = within(guideLineSection())
    expect(section.getByRole('button', { name: 'N/S' })).toBeInTheDocument()
    expect(section.getByRole('button', { name: 'E/O' })).toBeInTheDocument()
    expect(section.queryByRole('button', { name: '45°' })).not.toBeInTheDocument()
    expect(section.queryByRole('button', { name: '135°' })).not.toBeInTheDocument()
    // Custom angle field + its Valider button always remain available:
    expect(section.getByLabelText('Angle personnalisé')).toBeInTheDocument()
  })

  it('shows only 45° and 135° guide-line presets while Curry is armed', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Curry' }))

    const section = within(guideLineSection())
    expect(section.getByRole('button', { name: '45°' })).toBeInTheDocument()
    expect(section.getByRole('button', { name: '135°' })).toBeInTheDocument()
    expect(section.queryByRole('button', { name: 'N/S' })).not.toBeInTheDocument()
    expect(section.queryByRole('button', { name: 'E/O' })).not.toBeInTheDocument()
  })

  it('shows all 4 guide-line presets when no felt-point network is armed', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    expect(await screen.findByRole('button', { name: 'N/S' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'E/O' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '45°' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '135°' })).toBeInTheDocument()
  })

  it('always renders the permanent compass indicator', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

    expect(await screen.findByTestId('compass-indicator')).toBeInTheDocument()
  })
})

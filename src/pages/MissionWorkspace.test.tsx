// src/pages/MissionWorkspace.test.tsx (full replacement)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MissionWorkspace } from './MissionWorkspace'
import * as plansRepo from '../data/plansRepo'
import * as missionsRepo from '../data/missionsRepo'
import * as planImageStorage from '../data/planImageStorage'
import * as geocodingService from '../data/geocodingService'

vi.mock('../data/plansRepo')
vi.mock('../data/missionsRepo')
vi.mock('../data/planImageStorage')
vi.mock('../data/geocodingService')

vi.mock('../components/MissionForm', async () => {
  const { useEffect } = await import('react')
  return {
    MissionForm: ({ onCreated }: { onCreated: (m: unknown) => void }) => {
      useEffect(() => {
        onCreated({
          id: 'm1', address: 'x', missionDate: '2026-07-20', declinationDeg: null,
          originLat: null, originLng: null,
          causeArchitectural: null, causeElectromagnetique: null, causeGeobiologique: null,
          causeParanormale: null, causeAutres: null, bovisRate: null,
          parcelRefs: [],
          buildingFootprint: null,
        })
      }, [onCreated])
      return null
    },
  }
})

vi.mock('../components/MapView', () => ({
  MapView: ({
    center,
    onMapClick,
  }: {
    center: [number, number]
    onMapClick?: (latlng: { lat: number; lng: number }) => void
  }) => (
    <div data-testid="map-view" data-center={`${center[0]},${center[1]}`}>
      {onMapClick && (
        <button onClick={() => onMapClick({ lat: 48.8566, lng: 2.3522 })}>simulate-map-click</button>
      )}
    </div>
  ),
}))

vi.mock('../components/SiteMapView', () => ({
  SiteMapView: ({ planId }: { planId: string }) => (
    <div data-testid="site-map-view" data-plan-id={planId} />
  ),
}))

vi.mock('../components/MissionPhotosGallery', () => ({
  MissionPhotosGallery: ({
    missionId,
    planId,
    missionOrigin,
  }: {
    missionId: string
    planId: string
    missionOrigin: { lat: number; lng: number }
  }) => (
    <div
      data-testid="mission-photos-gallery"
      data-mission-id={missionId}
      data-plan-id={planId}
      data-mission-origin={missionOrigin && `${missionOrigin.lat},${missionOrigin.lng}`}
    />
  ),
}))

vi.mock('../components/PlanCalibrationTool', () => ({
  PlanCalibrationTool: ({ onCalibrated }: { onCalibrated: (c: unknown) => void }) => (
    <button onClick={() => onCalibrated({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })}>
      simulate-calibrated
    </button>
  ),
}))

vi.mock('../components/GlobalAssessmentForm', () => ({
  GlobalAssessmentForm: ({ onSaved }: { onSaved: (i: unknown) => void }) => (
    <button
      onClick={() =>
        onSaved({
          causeArchitectural: 3, causeElectromagnetique: 6, causeGeobiologique: 8,
          causeParanormale: 1, causeAutres: 0, bovisRate: 9500,
        })
      }
    >
      simulate-global-assessment
    </button>
  ),
}))

vi.mock('../components/GlobalAssessmentBar', () => ({
  GlobalAssessmentBar: ({
    values,
    onChange,
  }: {
    values: { causeArchitectural: number; causeElectromagnetique: number; causeGeobiologique: number; causeParanormale: number; causeAutres: number; bovisRate: number }
    onChange: (v: typeof values) => void
  }) => (
    <div data-testid="global-assessment-bar" data-bovis-rate={values.bovisRate}>
      <button onClick={() => onChange({ ...values, bovisRate: 12000 })}>simulate-bar-change</button>
    </div>
  ),
}))

const missionWithOrigin = {
  id: 'm1', address: 'x', missionDate: '2026-07-20', declinationDeg: null,
  originLat: 48.8566, originLng: 2.3522,
  causeArchitectural: null, causeElectromagnetique: null, causeGeobiologique: null,
  causeParanormale: null, causeAutres: null, bovisRate: null,
  parcelRefs: [],
  buildingFootprint: null,
}

// The mission as returned by setGlobalAssessment: causes/Bovis populated,
// origin still unset (origin-setting is the next phase).
const missionAfterGlobalAssessment = {
  id: 'm1', address: 'x', missionDate: '2026-07-20', declinationDeg: null,
  originLat: null, originLng: null,
  causeArchitectural: 3, causeElectromagnetique: 6, causeGeobiologique: 8,
  causeParanormale: 1, causeAutres: 0, bovisRate: 9500,
  parcelRefs: [],
  buildingFootprint: null,
}

// Common setup shared by every test whose flow needs to get past the
// global-assessment phase to reach origin-setting.
async function advanceToOriginSetting() {
  vi.mocked(missionsRepo.setGlobalAssessment).mockResolvedValue(missionAfterGlobalAssessment)
  fireEvent.click(await screen.findByText('simulate-global-assessment'))
  await waitFor(() => expect(missionsRepo.setGlobalAssessment).toHaveBeenCalled())
  await screen.findByText(/cliquez sur la carte/i)
}

describe('MissionWorkspace', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an exterior plan once a mission is created, then shows the global assessment form', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })

    render(<MissionWorkspace />)

    await waitFor(() =>
      expect(plansRepo.createPlan).toHaveBeenCalledWith({ missionId: 'm1', kind: 'exterieur' })
    )
    expect(await screen.findByText('simulate-global-assessment')).toBeInTheDocument()
  })

  it('shows an error if exterior plan creation fails', async () => {
    vi.mocked(plansRepo.createPlan).mockRejectedValue(
      new Error('Impossible de créer le plan : network down')
    )
    render(<MissionWorkspace />)
    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })

  it('records the mission origin on map click, then shows the map and the interior-upload option', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)

    render(<MissionWorkspace />)
    await advanceToOriginSetting()
    fireEvent.click(screen.getByText('simulate-map-click'))

    await waitFor(() =>
      expect(missionsRepo.setMissionOrigin).toHaveBeenCalledWith('m1', { lat: 48.8566, lng: 2.3522 })
    )
    const siteMapView = await screen.findByTestId('site-map-view')
    expect(siteMapView).toBeInTheDocument()
    // SiteMapView must be scoped to the exterior Plan's id ('p1'), not the
    // Mission's id ('m1') — this is the exact distinction the mid-task
    // exteriorPlan-threading correction exists to get right.
    expect(siteMapView).toHaveAttribute('data-plan-id', 'p1')
    expect(screen.getByLabelText(/importer un plan intérieur/i)).toBeInTheDocument()
    // The photos gallery must be threaded with the exterior Plan's id (same
    // 'p1'-not-'m1' distinction as SiteMapView) and the mission origin, so
    // rod-marker detection can calibrate photos and create FeltPoints.
    const gallery = screen.getByTestId('mission-photos-gallery')
    expect(gallery).toHaveAttribute('data-plan-id', 'p1')
    expect(gallery).toHaveAttribute('data-mission-origin', '48.8566,2.3522')
  })

  it('uploads a chosen interior file, then shows the calibration tool', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
    vi.mocked(planImageStorage.uploadPlanImage).mockResolvedValue('https://x/plan.jpg')

    render(<MissionWorkspace />)
    await advanceToOriginSetting()
    fireEvent.click(screen.getByText('simulate-map-click'))
    await screen.findByLabelText(/importer un plan intérieur/i)

    const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })

    await waitFor(() => expect(planImageStorage.uploadPlanImage).toHaveBeenCalledWith('m1', file))
    expect(await screen.findByText('simulate-calibrated')).toBeInTheDocument()
  })

  it('saves an interior Plan once calibration completes', async () => {
    vi.mocked(plansRepo.createPlan)
      .mockResolvedValueOnce({ id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null })
      .mockResolvedValueOnce({
        id: 'p2', missionId: 'm1', kind: 'interieur', imageUrl: 'https://x/plan.jpg',
        calibration: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      })
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
    vi.mocked(planImageStorage.uploadPlanImage).mockResolvedValue('https://x/plan.jpg')

    render(<MissionWorkspace />)
    await advanceToOriginSetting()
    fireEvent.click(screen.getByText('simulate-map-click'))
    await screen.findByLabelText(/importer un plan intérieur/i)
    const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })
    await screen.findByText('simulate-calibrated')

    fireEvent.click(screen.getByText('simulate-calibrated'))

    await waitFor(() =>
      expect(plansRepo.createPlan).toHaveBeenCalledWith({
        missionId: 'm1', kind: 'interieur', imageUrl: 'https://x/plan.jpg',
        calibration: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      })
    )
    const siteMapView = await screen.findByTestId('site-map-view')
    expect(siteMapView).toBeInTheDocument()
    // Back in ready-no-interior after calibration: must still be scoped to
    // the original exterior Plan ('p1'), not the newly-created interior Plan
    // ('p2') or the Mission's own id ('m1').
    expect(siteMapView).toHaveAttribute('data-plan-id', 'p1')
  })

  it('shows the global assessment form after the exterior plan, then proceeds to origin-setting', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setGlobalAssessment).mockResolvedValue({
      ...missionWithOrigin, originLat: null, originLng: null,
      causeArchitectural: 3, causeElectromagnetique: 6, causeGeobiologique: 8,
      causeParanormale: 1, causeAutres: 0, bovisRate: 9500,
    })

    render(<MissionWorkspace />)

    fireEvent.click(await screen.findByText('simulate-global-assessment'))

    await waitFor(() =>
      expect(missionsRepo.setGlobalAssessment).toHaveBeenCalledWith('m1', {
        causeArchitectural: 3, causeElectromagnetique: 6, causeGeobiologique: 8,
        causeParanormale: 1, causeAutres: 0, bovisRate: 9500,
      })
    )
    expect(await screen.findByText(/cliquez sur la carte/i)).toBeInTheDocument()
  })

  it('renders GlobalAssessmentBar (pre-filled from the mission) during ready-no-interior, and calls setGlobalAssessment on change', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    // setMissionOrigin only updates origin fields on the real (Supabase) row —
    // it still returns the cause/Bovis values already saved by the earlier
    // setGlobalAssessment call, not the origin-only-populated missionWithOrigin
    // fixture (which other tests use precisely because they don't care about
    // those fields). This test does care — it asserts the bar is pre-filled
    // from the mission — so its origin-set mission must carry them forward.
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue({
      ...missionAfterGlobalAssessment, originLat: missionWithOrigin.originLat, originLng: missionWithOrigin.originLng,
    })
    vi.mocked(missionsRepo.setGlobalAssessment)
      .mockResolvedValueOnce(missionAfterGlobalAssessment) // the initial mandatory step
      .mockResolvedValueOnce({ ...missionWithOrigin, bovisRate: 12000 }) // the bar's own change

    render(<MissionWorkspace />)
    await advanceToOriginSetting()
    fireEvent.click(screen.getByText('simulate-map-click'))
    await screen.findByTestId('site-map-view') // confirms ready-no-interior was reached

    const bar = screen.getByTestId('global-assessment-bar')
    expect(bar).toHaveAttribute('data-bovis-rate', '9500') // pre-filled from missionAfterGlobalAssessment

    fireEvent.click(screen.getByText('simulate-bar-change'))

    await waitFor(() =>
      expect(missionsRepo.setGlobalAssessment).toHaveBeenNthCalledWith(
        2,
        'm1',
        expect.objectContaining({ bovisRate: 12000 })
      )
    )
  })

  it('centers the setting-origin map on the geocoded address when available', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setGlobalAssessment).mockResolvedValue(missionAfterGlobalAssessment)
    vi.mocked(geocodingService.geocodeAddress).mockResolvedValue({ lat: 45.5, lng: 6.5 })

    render(<MissionWorkspace />)
    fireEvent.click(await screen.findByText('simulate-global-assessment'))

    const mapView = await screen.findByTestId('map-view')
    expect(mapView).toHaveAttribute('data-center', '45.5,6.5')
  })

  it('falls back to DEFAULT_CENTER without blocking the flow when geocoding finds nothing', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setGlobalAssessment).mockResolvedValue(missionAfterGlobalAssessment)
    vi.mocked(geocodingService.geocodeAddress).mockResolvedValue(null)

    render(<MissionWorkspace />)
    fireEvent.click(await screen.findByText('simulate-global-assessment'))

    const mapView = await screen.findByTestId('map-view')
    expect(mapView).toHaveAttribute('data-center', '46.6,2.5') // DEFAULT_CENTER — verify this literal matches the real constant in MissionWorkspace.tsx before relying on it
    // the "Cliquez sur la carte..." flow still works exactly as today:
    expect(screen.getByText(/cliquez sur la carte/i)).toBeInTheDocument()
  })

  it('starts directly at global-assessment when resumed there', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    render(
      <MissionWorkspace
        initialResumePhase={{ name: 'global-assessment', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
      />
    )
    expect(await screen.findByText('simulate-global-assessment')).toBeInTheDocument()
    // No fresh mission/plan creation should happen on a resumed mission:
    expect(plansRepo.createPlan).not.toHaveBeenCalled()
  })

  it('starts directly at setting-origin (with DEFAULT_CENTER, no re-geocoding) when resumed there', async () => {
    render(
      <MissionWorkspace
        initialResumePhase={{ name: 'setting-origin', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
      />
    )
    expect(await screen.findByText(/cliquez sur la carte/i)).toBeInTheDocument()
  })

  it('starts directly at ready-no-interior (SiteMapView visible immediately) when resumed there', async () => {
    render(
      <MissionWorkspace
        initialResumePhase={{ name: 'ready-no-interior', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
      />
    )
    const siteMapView = await screen.findByTestId('site-map-view')
    expect(siteMapView).toHaveAttribute('data-plan-id', 'p1')
  })
})

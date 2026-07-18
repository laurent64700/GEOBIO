// src/pages/MissionWorkspace.test.tsx (full replacement)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MissionWorkspace } from './MissionWorkspace'
import * as plansRepo from '../data/plansRepo'
import * as missionsRepo from '../data/missionsRepo'
import * as planImageStorage from '../data/planImageStorage'

vi.mock('../data/plansRepo')
vi.mock('../data/missionsRepo')
vi.mock('../data/planImageStorage')

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
        })
      }, [onCreated])
      return null
    },
  }
})

vi.mock('../components/MapView', () => ({
  MapView: ({ onMapClick }: { onMapClick?: (latlng: { lat: number; lng: number }) => void }) => (
    <div data-testid="map-view">
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
  MissionPhotosGallery: ({ missionId }: { missionId: string }) => (
    <div data-testid="mission-photos-gallery" data-mission-id={missionId} />
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

const missionWithOrigin = {
  id: 'm1', address: 'x', missionDate: '2026-07-20', declinationDeg: null,
  originLat: 48.8566, originLng: 2.3522,
  causeArchitectural: null, causeElectromagnetique: null, causeGeobiologique: null,
  causeParanormale: null, causeAutres: null, bovisRate: null,
  parcelRefs: [],
}

// The mission as returned by setGlobalAssessment: causes/Bovis populated,
// origin still unset (origin-setting is the next phase).
const missionAfterGlobalAssessment = {
  id: 'm1', address: 'x', missionDate: '2026-07-20', declinationDeg: null,
  originLat: null, originLng: null,
  causeArchitectural: 3, causeElectromagnetique: 6, causeGeobiologique: 8,
  causeParanormale: 1, causeAutres: 0, bovisRate: 9500,
  parcelRefs: [],
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
})

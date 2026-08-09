// src/pages/MissionWorkspace.test.tsx (full replacement)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MissionWorkspace } from './MissionWorkspace'
import * as plansRepo from '../data/plansRepo'
import * as missionsRepo from '../data/missionsRepo'
import * as planImageStorage from '../data/planImageStorage'
import * as geocodingService from '../data/geocodingService'
import * as preloadModule from '../offline/preload'
import * as currentSessionModule from '../offline/currentSession'
import * as connectivity from '../offline/connectivity'
import { useOfflineSync } from '../hooks/useOfflineSync'
import type { Mission } from '../domain/types'

vi.mock('../data/plansRepo')
vi.mock('../data/missionsRepo')
vi.mock('../data/planImageStorage')
vi.mock('../data/geocodingService')
vi.mock('../offline/preload')
vi.mock('../offline/currentSession')
vi.mock('../offline/connectivity')
// MissionWorkspace now calls useOfflineSync() directly (Task 11, for the
// Fichier menu's "Enregistrer"). Its real implementation hits IndexedDB on
// mount, which jsdom doesn't provide — mock it the same way
// OfflineIndicator.test.tsx does, so every ready-no-interior render here
// doesn't trigger an unhandled "indexedDB is not defined" rejection.
vi.mock('../hooks/useOfflineSync')

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
  SiteMapView: ({ planId, fitBounds, reloadKey }: { planId: string; fitBounds?: unknown; reloadKey?: number }) => (
    <div
      data-testid="site-map-view"
      data-plan-id={planId}
      data-fit-bounds={fitBounds ? JSON.stringify(fitBounds) : undefined}
      data-reload-key={reloadKey}
    />
  ),
}))

// UndoRedoControls now renders directly in MissionWorkspace's Toolbar (moved
// out of SiteMapView, which is fully mocked above). It has its own dedicated
// test file (UndoRedoControls.test.tsx) — stub it here the same way
// SiteMapView.test.tsx used to, so it doesn't poll actionHistory (IndexedDB/
// Supabase) unmocked during these tests. The button exposes onChanged so a
// test can trigger it directly, matching this file's own pattern for other
// mocked child components (e.g. ParcelSelectionStep's
// "simulate-parcels-confirmed" button below).
vi.mock('../components/UndoRedoControls', () => ({
  UndoRedoControls: ({ onChanged }: { onChanged: () => void }) => (
    <button onClick={onChanged}>simulate-undo-redo-changed</button>
  ),
}))

vi.mock('../components/ParcelSelectionStep', () => ({
  ParcelSelectionStep: ({ onConfirm }: { onConfirm: (parcels: unknown[]) => void }) => (
    <button
      onClick={() =>
        onConfirm([{ id: 'A123', section: 'A', ringsLatLng: [[{ lat: 48.8566, lng: 2.3522 }]] }])
      }
    >
      simulate-parcels-confirmed
    </button>
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

// Continues from origin-setting through the map click and the (mocked)
// parcel-selection step, landing on ready-no-interior. `resolvedMission` is
// what setSelectedParcels resolves to — defaults to missionWithOrigin, since
// that's what every existing ready-no-interior test already expects.
async function advanceToReadyNoInterior(resolvedMission: Mission = missionWithOrigin) {
  vi.mocked(missionsRepo.setSelectedParcels).mockResolvedValue(resolvedMission)
  fireEvent.click(screen.getByText('simulate-map-click'))
  fireEvent.click(await screen.findByText('simulate-parcels-confirmed'))
  await waitFor(() => expect(missionsRepo.setSelectedParcels).toHaveBeenCalled())
}

// MenuBar (unmocked here, unlike UndoRedoControls above) renders a real
// Radix DropdownMenu.Trigger, which opens on pointerdown, not a synthetic
// click — jsdom's fireEvent.click doesn't synthesize the pointer-event
// sequence a real click produces. Same helper as MenuBar.test.tsx's
// `openMenu`; duplicated locally rather than imported since MenuBar.test.tsx
// doesn't export it.
function openMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger)
  fireEvent.pointerUp(trigger)
}

describe('MissionWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default to a resolved preload so every test that merely passes through
    // parcel-selection (most of them, via advanceToReadyNoInterior) doesn't
    // have to care about offline preloading. Tests that specifically exercise
    // the preload call/failure path override this.
    vi.mocked(preloadModule.preloadPlanForOffline).mockResolvedValue(undefined)
    // Default useOfflineSync stub — no test in this file exercises the
    // Fichier menu's "Enregistrer" flow (that's MenuBar.test.tsx's job); this
    // just needs to exist so mounting Toolbar's <MenuBar> doesn't crash.
    vi.mocked(useOfflineSync).mockReturnValue({ pendingCount: 0, flushNow: vi.fn().mockResolvedValue(undefined) })
  })

  it('creates an exterior plan once a mission is created, then shows the global assessment form', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)

    await waitFor(() =>
      expect(plansRepo.createPlan).toHaveBeenCalledWith({ missionId: 'm1', kind: 'exterieur' })
    )
    expect(await screen.findByText('simulate-global-assessment')).toBeInTheDocument()
  })

  it('shows an error if exterior plan creation fails', async () => {
    vi.mocked(plansRepo.createPlan).mockRejectedValue(
      new Error('Impossible de créer le plan : network down')
    )
    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })

  it('shows the parcel-selection step after setting the origin, then persists the selection and fits the map to it', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
    vi.mocked(missionsRepo.setSelectedParcels).mockResolvedValue({ ...missionWithOrigin, parcelRefs: ['A123'] })

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
    await advanceToOriginSetting()
    fireEvent.click(screen.getByText('simulate-map-click'))

    fireEvent.click(await screen.findByText('simulate-parcels-confirmed'))

    await waitFor(() => expect(missionsRepo.setSelectedParcels).toHaveBeenCalledWith('m1', ['A123']))
    const siteMapView = await screen.findByTestId('site-map-view')
    expect(siteMapView).toHaveAttribute('data-fit-bounds', JSON.stringify([[48.8566, 2.3522], [48.8566, 2.3522]]))
    // Confirming parcels must kick off offline preloading in the background,
    // using the UPDATED mission (post-confirmation, with parcelRefs set) —
    // not the pre-confirmation mission — and the exterior Plan from the
    // current phase.
    await waitFor(() =>
      expect(preloadModule.preloadPlanForOffline).toHaveBeenCalledWith(
        { ...missionWithOrigin, parcelRefs: ['A123'] },
        { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null }
      )
    )
  })

  it('still opens the mission normally even if offline preloading fails after parcel confirmation', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
    vi.mocked(missionsRepo.setSelectedParcels).mockResolvedValue({ ...missionWithOrigin, parcelRefs: ['A123'] })
    vi.mocked(preloadModule.preloadPlanForOffline).mockRejectedValue(new Error('indexeddb unavailable'))

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
    await advanceToOriginSetting()
    fireEvent.click(screen.getByText('simulate-map-click'))

    fireEvent.click(await screen.findByText('simulate-parcels-confirmed'))

    // The parcel-confirmation flow must complete normally — reaching
    // ready-no-interior — despite the rejected preload promise.
    const siteMapView = await screen.findByTestId('site-map-view')
    expect(siteMapView).toBeInTheDocument()
    await waitFor(() => expect(preloadModule.preloadPlanForOffline).toHaveBeenCalled())
  })

  it('records the mission origin on map click, then shows the map and the interior-upload option', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
    await advanceToOriginSetting()
    await advanceToReadyNoInterior()

    expect(missionsRepo.setMissionOrigin).toHaveBeenCalledWith('m1', { lat: 48.8566, lng: 2.3522 })
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

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
    await advanceToOriginSetting()
    await advanceToReadyNoInterior()
    await screen.findByLabelText(/importer un plan intérieur/i)

    const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })

    await waitFor(() => expect(planImageStorage.uploadPlanImage).toHaveBeenCalledWith('m1', file))
    expect(await screen.findByText('simulate-calibrated')).toBeInTheDocument()
  })

  it('shows a non-blocking banner (not the full-page error) when the interior file upload fails', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
    vi.mocked(planImageStorage.uploadPlanImage).mockRejectedValue(new Error('network down'))

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
    await advanceToOriginSetting()
    await advanceToReadyNoInterior()
    await screen.findByLabelText(/importer un plan intérieur/i)

    const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })

    await waitFor(() =>
      expect(screen.getByText(/import du plan intérieur.*network down/i)).toBeInTheDocument()
    )
    // Le reste de l'écran terrain reste monté — pas basculé en page d'erreur pleine page.
    expect(screen.getByTestId('site-map-view')).toBeInTheDocument()
  })

  it('clears a stale upload error banner once a retry on the same action succeeds', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
    vi.mocked(planImageStorage.uploadPlanImage)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce('https://x/plan.jpg')

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
    await advanceToOriginSetting()
    await advanceToReadyNoInterior()
    await screen.findByLabelText(/importer un plan intérieur/i)
    const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })

    fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })
    await screen.findByText(/import du plan intérieur.*network down/i)

    fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })

    await waitFor(() => expect(screen.queryByText(/network down/i)).not.toBeInTheDocument())
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

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
    await advanceToOriginSetting()
    await advanceToReadyNoInterior()
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

  it('shows a non-blocking banner (not the full-page error) when saving the interior plan fails', async () => {
    vi.mocked(plansRepo.createPlan)
      .mockResolvedValueOnce({ id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null })
      .mockRejectedValueOnce(new Error('network down'))
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
    vi.mocked(planImageStorage.uploadPlanImage).mockResolvedValue('https://x/plan.jpg')

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
    await advanceToOriginSetting()
    await advanceToReadyNoInterior()
    await screen.findByLabelText(/importer un plan intérieur/i)
    const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })
    await screen.findByText('simulate-calibrated')

    fireEvent.click(screen.getByText('simulate-calibrated'))

    await waitFor(() =>
      expect(screen.getByText(/calage du plan.*network down/i)).toBeInTheDocument()
    )
    // Toujours dans calibrating-interior, PAS l'écran d'erreur plein page — le
    // bouton de simulation de calibration (rendu par PlanCalibrationTool) reste là.
    expect(screen.getByText('simulate-calibrated')).toBeInTheDocument()
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

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)

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

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
    await advanceToOriginSetting()
    await advanceToReadyNoInterior({
      ...missionAfterGlobalAssessment,
      originLat: missionWithOrigin.originLat,
      originLng: missionWithOrigin.originLng,
    })
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

  it('shows a non-blocking banner when saving the global assessment fails, without an unhandled rejection', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
    // advanceToOriginSetting() lui-même configure setGlobalAssessment pour
    // RÉSOUDRE (c'est cet appel qui fait avancer de global-assessment vers
    // setting-origin) — donc on ne peut PAS pré-configurer le rejet avant cet
    // appel, il serait écrasé. On reconfigure setGlobalAssessment pour rejeter
    // seulement APRÈS être arrivé sur ready-no-interior, juste avant de
    // déclencher le changement de curseur qu'on veut faire échouer.
    await advanceToOriginSetting()
    await advanceToReadyNoInterior()
    await screen.findByTestId('global-assessment-bar')
    vi.mocked(missionsRepo.setGlobalAssessment).mockRejectedValue(new Error('network down'))

    fireEvent.click(screen.getByText('simulate-bar-change'))

    await waitFor(() =>
      expect(screen.getByText(/bilan global.*network down/i)).toBeInTheDocument()
    )
    // Toujours ready-no-interior, pas l'écran d'erreur plein page.
    expect(screen.getByTestId('site-map-view')).toBeInTheDocument()
  })

  it('clears a stale banner from one action when a different action starts a new attempt', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
    vi.mocked(planImageStorage.uploadPlanImage).mockRejectedValue(new Error('upload failed'))
    // Pas besoin de reconfigurer setGlobalAssessment ici : advanceToOriginSetting()
    // le configure déjà pour résoudre (nécessaire pour avancer jusqu'à
    // ready-no-interior), et ce test n'a pas besoin d'une réponse précise — il
    // vérifie seulement que setNonBlockingError(null), appelé au tout début du
    // handler onChange (avant même l'appel réseau), efface le message d'upload
    // encore affiché.

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
    await advanceToOriginSetting()
    await advanceToReadyNoInterior()
    await screen.findByLabelText(/importer un plan intérieur/i)

    const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })
    await screen.findByText(/import du plan intérieur.*upload failed/i)

    fireEvent.click(screen.getByText('simulate-bar-change'))

    await waitFor(() => expect(screen.queryByText(/upload failed/i)).not.toBeInTheDocument())
  })

  it('centers the setting-origin map on the geocoded address when available', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setGlobalAssessment).mockResolvedValue(missionAfterGlobalAssessment)
    vi.mocked(geocodingService.geocodeAddress).mockResolvedValue({ lat: 45.5, lng: 6.5 })

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
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

    render(<MissionWorkspace onNavigateToMissionList={vi.fn()} onNavigateToNewMission={vi.fn()} />)
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
        onNavigateToMissionList={vi.fn()}
        onNavigateToNewMission={vi.fn()}
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
        onNavigateToMissionList={vi.fn()}
        onNavigateToNewMission={vi.fn()}
      />
    )
    expect(await screen.findByText(/cliquez sur la carte/i)).toBeInTheDocument()
    // setting-origin uses the shared FLEX_COLUMN_FULL_HEIGHT_STYLE unpadded and
    // renders no Toolbar — it must stay visually unaffected by the new
    // ready-no-interior-only READY_NO_INTERIOR_STYLE/Toolbar addition.
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })

  it('starts directly at ready-no-interior (SiteMapView visible immediately) when resumed there', async () => {
    render(
      <MissionWorkspace
        initialResumePhase={{ name: 'ready-no-interior', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
        onNavigateToMissionList={vi.fn()}
        onNavigateToNewMission={vi.fn()}
      />
    )
    const siteMapView = await screen.findByTestId('site-map-view')
    expect(siteMapView).toHaveAttribute('data-plan-id', 'p1')
    // ready-no-interior mounts the Toolbar as the first child of its
    // READY_NO_INTERIOR_STYLE wrapper — confirm it actually renders here.
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })

  it('bumps SiteMapView\'s reloadKey when UndoRedoControls (in the Toolbar) reports a change', async () => {
    // Closes the gap flagged by code review: UndoRedoControls now lives in
    // MissionWorkspace's Toolbar (not inside SiteMapView), wired via
    // onChanged={() => setReloadKey((k) => k + 1)} feeding SiteMapView's own
    // reloadKey prop. Neither the old UndoRedoControls-as-() => null mock nor
    // the old SiteMapView mock (which dropped reloadKey entirely) could ever
    // have caught a typo in that wiring — this test exercises it directly.
    render(
      <MissionWorkspace
        initialResumePhase={{ name: 'ready-no-interior', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
        onNavigateToMissionList={vi.fn()}
        onNavigateToNewMission={vi.fn()}
      />
    )
    const siteMapView = await screen.findByTestId('site-map-view')
    expect(siteMapView).toHaveAttribute('data-reload-key', '0')

    fireEvent.click(screen.getByText('simulate-undo-redo-changed'))

    await waitFor(() => expect(siteMapView).toHaveAttribute('data-reload-key', '1'))
  })

  it('wires the real MenuBar into Toolbar: "Quitter la mission" calls onNavigateToMissionList (not onNavigateToNewMission)', async () => {
    // Unlike MenuBar.test.tsx (which exercises MenuBar in isolation with mock
    // props), this proves MissionWorkspace's own prop wiring is correct —
    // MenuBar is NOT mocked in this file, so this renders the real
    // <MenuBar> Toolbar mounts in the ready-no-interior case.
    const onNavigateToMissionList = vi.fn()
    const onNavigateToNewMission = vi.fn()
    render(
      <MissionWorkspace
        initialResumePhase={{ name: 'ready-no-interior', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
        onNavigateToMissionList={onNavigateToMissionList}
        onNavigateToNewMission={onNavigateToNewMission}
      />
    )
    await screen.findByTestId('site-map-view')

    openMenu(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /quitter la mission/i }))

    expect(onNavigateToMissionList).toHaveBeenCalled()
    expect(onNavigateToNewMission).not.toHaveBeenCalled()
  })

  it('onDeleteMission calls deleteMission, clears current_session when it matches the deleted mission, and navigates to the mission list', async () => {
    vi.mocked(missionsRepo.deleteMission).mockResolvedValue(undefined)
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    vi.mocked(currentSessionModule.getCurrentSession).mockResolvedValue({
      mission: missionWithOrigin,
      exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null },
    })
    const onNavigateToMissionList = vi.fn()
    render(
      <MissionWorkspace
        initialResumePhase={{ name: 'ready-no-interior', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
        onNavigateToMissionList={onNavigateToMissionList}
        onNavigateToNewMission={vi.fn()}
      />
    )
    await screen.findByTestId('site-map-view')

    openMenu(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /supprimer la mission/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))

    // onDeleteMission's chain is deleteMission → getCurrentSession →
    // (conditionally) clearCurrentSession → onNavigateToMissionList — all pure
    // microtask chaining, no real timers. Waiting for the LAST effect in the
    // chain via waitFor, then asserting the earlier ones synchronously right
    // after, is safe (everything before it has necessarily already resolved)
    // and avoids 3 separate waitFor calls for one linear chain.
    await waitFor(() => expect(onNavigateToMissionList).toHaveBeenCalled())
    expect(missionsRepo.deleteMission).toHaveBeenCalledWith('m1')
    expect(currentSessionModule.clearCurrentSession).toHaveBeenCalled()
  })

  it('does not clear current_session when it references a different mission', async () => {
    vi.mocked(missionsRepo.deleteMission).mockResolvedValue(undefined)
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    vi.mocked(currentSessionModule.getCurrentSession).mockResolvedValue({
      mission: { ...missionWithOrigin, id: 'some-other-mission' },
      exteriorPlan: { id: 'p2', missionId: 'some-other-mission', kind: 'exterieur', imageUrl: null, calibration: null },
    })
    const onNavigateToMissionList = vi.fn()
    render(
      <MissionWorkspace
        initialResumePhase={{ name: 'ready-no-interior', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
        onNavigateToMissionList={onNavigateToMissionList}
        onNavigateToNewMission={vi.fn()}
      />
    )
    await screen.findByTestId('site-map-view')

    openMenu(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /supprimer la mission/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))

    await waitFor(() => expect(onNavigateToMissionList).toHaveBeenCalled())
    expect(missionsRepo.deleteMission).toHaveBeenCalledWith('m1')
    expect(currentSessionModule.clearCurrentSession).not.toHaveBeenCalled()
  })

  it('still navigates to the mission list even if the post-delete current_session check fails — the mission is already deleted, a session-cache hiccup must not be reported as a failed deletion', async () => {
    vi.mocked(missionsRepo.deleteMission).mockResolvedValue(undefined)
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
    vi.mocked(currentSessionModule.getCurrentSession).mockRejectedValue(new Error('indexeddb unavailable'))
    const onNavigateToMissionList = vi.fn()
    render(
      <MissionWorkspace
        initialResumePhase={{ name: 'ready-no-interior', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
        onNavigateToMissionList={onNavigateToMissionList}
        onNavigateToNewMission={vi.fn()}
      />
    )
    await screen.findByTestId('site-map-view')

    openMenu(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /supprimer la mission/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Supprimer' }))

    await waitFor(() => expect(onNavigateToMissionList).toHaveBeenCalled())
    expect(missionsRepo.deleteMission).toHaveBeenCalledWith('m1')
    // No ConfirmDialog error alert — the deletion itself succeeded, so its
    // catch-all must never see this rejection.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import * as missionsRepo from './data/missionsRepo'
import * as deriveResumePhaseModule from './pages/deriveResumePhase'
import * as currentSessionModule from './offline/currentSession'
import * as connectivity from './offline/connectivity'

vi.mock('./data/missionsRepo')
vi.mock('./pages/deriveResumePhase') // mock separately per the real module path
vi.mock('./offline/currentSession')
vi.mock('./offline/connectivity')

// Mocked so this file tests App.tsx's own wiring (which phase MissionWorkspace
// receives) without needing to also stand up MissionWorkspace's full child
// tree (SiteMapView, MapView, etc.) — same isolation principle already used
// throughout this codebase's other page-level tests.
vi.mock('./pages/MissionWorkspace', () => ({
  MissionWorkspace: ({ initialResumePhase }: { initialResumePhase?: { name: string } }) => (
    <div data-testid="mission-workspace" data-resume-phase-name={initialResumePhase?.name ?? 'none'} />
  ),
}))

const existingMission = {
  id: 'm1', address: '10 Rue de Rivoli', missionDate: '2026-07-20', declinationDeg: null,
  originLat: null, originLng: null, causeArchitectural: null, causeElectromagnetique: null,
  causeGeobiologique: null, causeParanormale: null, causeAutres: null, bovisRate: null,
  parcelRefs: [], buildingFootprint: null,
}

describe('App', () => {
  beforeEach(() => {
    // Clear call history first (needed for the `not.toHaveBeenCalled()`
    // assertion below), then restore `isOnlineNow`'s default. `vi.clearAllMocks()`
    // only resets call history — it does NOT reset `mockResolvedValue`
    // implementations set by `vi.mock('./offline/connectivity')`'s auto-mock,
    // so without this, tests would depend on execution order (see
    // gridTemplatesRepo.test.ts / gridLinesRepo.test.ts / plansRepo.test.ts
    // for the same pattern applied elsewhere in this codebase).
    vi.clearAllMocks()
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
  })

  it('shows the mission list on load, with existing missions from listMissions()', async () => {
    vi.mocked(missionsRepo.listMissions).mockResolvedValue([existingMission])
    render(<App />)
    expect(await screen.findByText(/10 Rue de Rivoli/)).toBeInTheDocument()
  })

  it('"Nouvelle mission" goes to the mission-creation flow', async () => {
    vi.mocked(missionsRepo.listMissions).mockResolvedValue([])
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle mission' }))
    const workspace = await screen.findByTestId('mission-workspace')
    expect(workspace).toHaveAttribute('data-resume-phase-name', 'none')
  })

  it('selecting an existing mission derives its resume phase and passes it to MissionWorkspace', async () => {
    vi.mocked(missionsRepo.listMissions).mockResolvedValue([existingMission])
    vi.mocked(deriveResumePhaseModule.deriveResumePhase).mockResolvedValue({
      name: 'setting-origin',
      mission: existingMission,
      exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null },
    })

    render(<App />)
    fireEvent.click(await screen.findByText(/10 Rue de Rivoli/))

    await waitFor(() => expect(deriveResumePhaseModule.deriveResumePhase).toHaveBeenCalledWith(existingMission))
    const workspace = await screen.findByTestId('mission-workspace')
    expect(workspace).toHaveAttribute('data-resume-phase-name', 'setting-origin')
  })

  it('shows an error, not a crash, when deriveResumePhase fails (e.g. the orphaned-mission retry itself fails)', async () => {
    vi.mocked(missionsRepo.listMissions).mockResolvedValue([existingMission])
    vi.mocked(deriveResumePhaseModule.deriveResumePhase).mockRejectedValue(new Error('network down'))

    render(<App />)
    fireEvent.click(await screen.findByText(/10 Rue de Rivoli/))

    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })

  it('persists the mission + exterior plan into current_session after a successful resume', async () => {
    vi.mocked(missionsRepo.listMissions).mockResolvedValue([existingMission])
    const exteriorPlan = { id: 'p1', missionId: 'm1', kind: 'exterieur' as const, imageUrl: null, calibration: null }
    vi.mocked(deriveResumePhaseModule.deriveResumePhase).mockResolvedValue({
      name: 'ready-no-interior', mission: existingMission, exteriorPlan,
    })

    render(<App />)
    fireEvent.click(await screen.findByText(/10 Rue de Rivoli/))

    await waitFor(() => expect(currentSessionModule.setCurrentSession).toHaveBeenCalledWith(existingMission, exteriorPlan))
  })

  it('boots straight into the resuming phase from the cached session when offline at mount, without calling listMissions', async () => {
    const exteriorPlan = { id: 'p1', missionId: 'm1', kind: 'exterieur' as const, imageUrl: null, calibration: null }
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    vi.mocked(currentSessionModule.getCurrentSession).mockResolvedValue({ mission: existingMission, exteriorPlan })

    render(<App />)

    const workspace = await screen.findByTestId('mission-workspace')
    expect(workspace).toHaveAttribute('data-resume-phase-name', 'ready-no-interior')
    expect(missionsRepo.listMissions).not.toHaveBeenCalled()
  })

  it('falls back to the normal listMissions() flow when offline at mount but no session is cached', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    vi.mocked(currentSessionModule.getCurrentSession).mockResolvedValue(null)
    vi.mocked(missionsRepo.listMissions).mockRejectedValue(new Error('network down'))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })

  it('shows an error, not an infinite loading screen, when getCurrentSession fails while offline at mount', async () => {
    vi.mocked(connectivity.isOnlineNow).mockResolvedValue(false)
    vi.mocked(currentSessionModule.getCurrentSession).mockRejectedValue(new Error('indexeddb unavailable'))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('indexeddb unavailable')
  })
})

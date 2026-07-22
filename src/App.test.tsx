import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import * as missionsRepo from './data/missionsRepo'
import * as deriveResumePhaseModule from './pages/deriveResumePhase'

vi.mock('./data/missionsRepo')
vi.mock('./pages/deriveResumePhase') // mock separately per the real module path

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
})

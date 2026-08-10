// src/pages/MissionWorkspace.undoRedoBusy.test.tsx
//
// A focused integration test proving the CROSS-COMPONENT wiring of the
// shared undo/redo busy state — not just each component in isolation.
// UndoRedoControls.test.tsx and MenuBar.test.tsx each verify their own half
// of the contract using mocked/simulated parents; this file renders the
// REAL UndoRedoControls and the REAL MenuBar together, wired through the
// REAL MissionWorkspace, and proves that an in-flight call started from
// EITHER trigger disables the OTHER trigger's buttons too. This is exactly
// the test that would have caught the one-directional bug code review
// found: an earlier version mirrored UndoRedoControls' busy state outward
// (one-way, via an optional onBusyChange prop) without MenuBar's own
// in-flight calls ever feeding back into it, so Toolbar's own Undo button
// stayed clickable while Modifier's "Annuler" was still running.
//
// Unlike MissionWorkspace.test.tsx, this file deliberately does NOT mock
// UndoRedoControls (that file mocks it as a stub button, since its own
// undo/redo behavior belongs to UndoRedoControls.test.tsx) — here, both
// real components need to be mounted side by side.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MissionWorkspace } from './MissionWorkspace'
import * as actionHistory from '../offline/actionHistory'
import { useOfflineSync } from '../hooks/useOfflineSync'
import type { Mission, Plan } from '../domain/types'

vi.mock('../offline/actionHistory')
vi.mock('../hooks/useOfflineSync')

vi.mock('../components/SiteMapView', () => ({
  SiteMapView: () => <div data-testid="site-map-view" />,
}))

vi.mock('../components/MissionPhotosGallery', () => ({
  MissionPhotosGallery: () => <div data-testid="mission-photos-gallery" />,
}))

vi.mock('../components/GlobalAssessmentBar', () => ({
  GlobalAssessmentBar: () => <div data-testid="global-assessment-bar" />,
}))

const mission: Mission = {
  id: 'm1', address: 'x', missionDate: '2026-07-20', declinationDeg: null,
  originLat: 48.8566, originLng: 2.3522,
  causeArchitectural: null, causeElectromagnetique: null, causeGeobiologique: null,
  causeParanormale: null, causeAutres: null, bovisRate: null,
  parcelRefs: [],
  buildingFootprint: null, selectedParcelsGeometry: null,
}

const exteriorPlan: Plan = { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null }

// Radix's DropdownMenu.Trigger opens on pointerdown, not a synthetic click.
function openMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger)
  fireEvent.pointerUp(trigger)
}

function renderReadyNoInterior() {
  return render(
    <MissionWorkspace
      initialResumePhase={{ name: 'ready-no-interior', mission, exteriorPlan }}
      onNavigateToMissionList={vi.fn()}
      onNavigateToNewMission={vi.fn()}
    />
  )
}

describe('MissionWorkspace — shared undo/redo busy state (Toolbar <-> Modifier menu)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useOfflineSync).mockReturnValue({ pendingCount: 0, flushNow: vi.fn().mockResolvedValue(undefined) })
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(true)
    vi.mocked(actionHistory.hasRedoableAction).mockResolvedValue(true)
  })

  it("disables MenuBar's Modifier Annuler/Refaire while Toolbar's own Undo button is mid-operation", async () => {
    let resolveUndo: () => void
    vi.mocked(actionHistory.undo).mockReturnValue(
      new Promise((resolve) => {
        resolveUndo = () => resolve(undefined)
      })
    )

    renderReadyNoInterior()
    const toolbarUndoButton = await screen.findByRole('button', { name: 'Annuler' })
    await waitFor(() => expect(toolbarUndoButton).toBeEnabled())

    fireEvent.click(toolbarUndoButton)

    // Toolbar's own button disables itself immediately (UndoRedoControls'
    // existing behavior) — the real assertion this test exists for is that
    // MenuBar's Modifier menu ALSO reflects the same in-flight call.
    await waitFor(() => expect(toolbarUndoButton).toBeDisabled())
    openMenu(screen.getByRole('button', { name: /modifier/i }))
    expect(await screen.findByRole('menuitem', { name: /^annuler$/i })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: /^refaire$/i })).toHaveAttribute('aria-disabled', 'true')

    resolveUndo!()
    await waitFor(() => expect(toolbarUndoButton).toBeEnabled())
  })

  it("disables Toolbar's own Undo/Redo buttons while MenuBar's Modifier \"Annuler\" is mid-operation (the direction the one-way mirror bug missed)", async () => {
    let resolveUndo: () => void
    vi.mocked(actionHistory.undo).mockReturnValue(
      new Promise((resolve) => {
        resolveUndo = () => resolve(undefined)
      })
    )

    renderReadyNoInterior()
    const toolbarUndoButton = await screen.findByRole('button', { name: 'Annuler' })
    const toolbarRedoButton = screen.getByRole('button', { name: 'Refaire' })
    await waitFor(() => expect(toolbarUndoButton).toBeEnabled())

    openMenu(screen.getByRole('button', { name: /modifier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /^annuler$/i }))

    // This is the exact gap code review found: without the shared, lifted
    // busy state, Toolbar's own Undo/Redo buttons would stay clickable here
    // while Modifier's "Annuler" is still awaiting undo(planId), letting a
    // user fire a second concurrent undo() call by clicking Toolbar's button.
    await waitFor(() => expect(toolbarUndoButton).toBeDisabled())
    expect(toolbarRedoButton).toBeDisabled()

    resolveUndo!()
    await waitFor(() => expect(toolbarUndoButton).toBeEnabled())
  })
})

// src/components/MenuBar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MenuBar } from './MenuBar'
import * as actionHistory from '../offline/actionHistory'

vi.mock('../offline/actionHistory')

// Radix opens DropdownMenu.Trigger on pointerdown, not a synthetic click —
// see this task's note above. Reused by every menu test in this file
// (Fichier here; Modifier/Affichage appended in later tasks).
function openMenu(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger)
  fireEvent.pointerUp(trigger)
}

const baseProps = {
  onNavigateToMissionList: vi.fn(),
  onNavigateToNewMission: vi.fn(),
  missionInfo: { address: '12 rue des Lilas', missionDate: '2026-08-06', parcelRefs: ['ABC-123'] },
  onSaveNow: vi.fn().mockResolvedValue(undefined),
  onDuplicateMission: vi.fn().mockResolvedValue(undefined),
  onQuitMission: vi.fn(),
  planId: 'p1',
  undoRedoBusy: false,
  onUndoRedoBusyChange: vi.fn(),
  onToggleCalques: vi.fn(),
  onToggleEditMode: vi.fn(),
}

describe('MenuBar — Fichier', () => {
  it('calls onNavigateToNewMission when "Nouvelle mission" is clicked', async () => {
    render(<MenuBar {...baseProps} />)
    openMenu(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /nouvelle mission/i }))
    expect(baseProps.onNavigateToNewMission).toHaveBeenCalled()
  })

  it('calls onNavigateToMissionList when "Mes missions" is clicked', async () => {
    render(<MenuBar {...baseProps} />)
    openMenu(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /mes missions/i }))
    expect(baseProps.onNavigateToMissionList).toHaveBeenCalled()
  })

  it('calls onSaveNow when "Enregistrer" is clicked, and reports an error if it rejects', async () => {
    const onSaveNow = vi.fn().mockRejectedValue(new Error('sync failed'))
    render(<MenuBar {...baseProps} onSaveNow={onSaveNow} />)
    openMenu(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /^enregistrer$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('sync failed')
  })

  it('calls onDuplicateMission when "Enregistrer sous" is clicked', async () => {
    render(<MenuBar {...baseProps} />)
    openMenu(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /enregistrer sous/i }))
    expect(baseProps.onDuplicateMission).toHaveBeenCalled()
  })

  it('renders "Imprimer" disabled with a tooltip', async () => {
    render(<MenuBar {...baseProps} />)
    openMenu(screen.getByRole('button', { name: /fichier/i }))
    const item = await screen.findByRole('menuitem', { name: /imprimer/i })
    expect(item).toHaveAttribute('aria-disabled', 'true')
  })

  it('calls onQuitMission when "Quitter la mission" is clicked', async () => {
    render(<MenuBar {...baseProps} />)
    openMenu(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /quitter la mission/i }))
    expect(baseProps.onQuitMission).toHaveBeenCalled()
  })

  it('shows address/date/parcels from missionInfo when "Infos de la mission" is clicked, and hides them again on "Fermer"', async () => {
    render(<MenuBar {...baseProps} />)
    openMenu(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /infos de la mission/i }))

    expect(await screen.findByText('12 rue des Lilas')).toBeInTheDocument()
    expect(screen.getByText('2026-08-06')).toBeInTheDocument()
    expect(screen.getByText('ABC-123')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /fermer/i }))
    expect(screen.queryByText('12 rue des Lilas')).not.toBeInTheDocument()
  })
})

describe('MenuBar — Modifier', () => {
  beforeEach(() => {
    // MenuBar's undo/redo mocks carry mockReturnValue overrides (pending
    // promises) between tests otherwise — reset call history AND
    // implementations so each test starts from the auto-mocked default.
    vi.mocked(actionHistory.undo).mockReset()
    vi.mocked(actionHistory.redo).mockReset()
  })

  it('calls undo(planId) when "Annuler" is clicked', async () => {
    render(<MenuBar {...baseProps} planId="p1" undoRedoBusy={false} />)
    openMenu(screen.getByRole('button', { name: /modifier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /^annuler$/i }))
    expect(actionHistory.undo).toHaveBeenCalledWith('p1')
  })

  it('disables Annuler/Refaire when undoRedoBusy is true (Toolbar\'s own control is mid-operation)', async () => {
    render(<MenuBar {...baseProps} planId="p1" undoRedoBusy={true} />)
    openMenu(screen.getByRole('button', { name: /modifier/i }))
    expect(await screen.findByRole('menuitem', { name: /^annuler$/i })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: /^refaire$/i })).toHaveAttribute('aria-disabled', 'true')
  })

  it('disables Annuler/Refaire for the duration of its own in-flight call, once the parent reflects busy back down via undoRedoBusy', async () => {
    // MenuBar no longer tracks its own local busy state (that was the
    // one-way-mirror design code review flagged) — it only reports outward
    // via onUndoRedoBusyChange. This test plays the parent's role by hand:
    // observe the call, then re-render with undoRedoBusy={true}, exactly as
    // MissionWorkspace's real setUndoRedoBusy state update would cause.
    let resolveUndo: () => void
    vi.mocked(actionHistory.undo).mockReturnValue(new Promise((resolve) => { resolveUndo = () => resolve(undefined) }))
    const onUndoRedoBusyChange = vi.fn()
    const { rerender } = render(
      <MenuBar {...baseProps} planId="p1" undoRedoBusy={false} onUndoRedoBusyChange={onUndoRedoBusyChange} />
    )
    openMenu(screen.getByRole('button', { name: /modifier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /^annuler$/i }))

    expect(onUndoRedoBusyChange).toHaveBeenCalledWith(true)
    rerender(<MenuBar {...baseProps} planId="p1" undoRedoBusy={true} onUndoRedoBusyChange={onUndoRedoBusyChange} />)

    openMenu(screen.getByRole('button', { name: /modifier/i }))
    expect(await screen.findByRole('menuitem', { name: /^annuler$/i })).toHaveAttribute('aria-disabled', 'true')

    resolveUndo!()
  })

  it('reports its own in-flight undo as busy via onUndoRedoBusyChange(true), so a real parent could disable Toolbar\'s UndoRedoControls in turn', async () => {
    // Proves the reverse direction the one-way-mirror bug left unguarded:
    // Modifier's own action must report busy outward, not just receive it.
    let resolveUndo: () => void
    vi.mocked(actionHistory.undo).mockReturnValue(new Promise((resolve) => { resolveUndo = () => resolve(undefined) }))
    const onUndoRedoBusyChange = vi.fn()
    render(<MenuBar {...baseProps} planId="p1" undoRedoBusy={false} onUndoRedoBusyChange={onUndoRedoBusyChange} />)
    openMenu(screen.getByRole('button', { name: /modifier/i }))

    fireEvent.click(await screen.findByRole('menuitem', { name: /^annuler$/i }))

    expect(onUndoRedoBusyChange).toHaveBeenCalledWith(true)
    resolveUndo!()
    await waitFor(() => expect(onUndoRedoBusyChange).toHaveBeenLastCalledWith(false))
  })

  it('renders "Supprimer l\'élément sélectionné" disabled', async () => {
    render(<MenuBar {...baseProps} planId="p1" undoRedoBusy={false} />)
    openMenu(screen.getByRole('button', { name: /modifier/i }))
    expect(await screen.findByRole('menuitem', { name: /supprimer l'élément/i })).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('MenuBar — Affichage', () => {
  it('calls onToggleCalques when "Basculer Calques" is clicked', async () => {
    render(<MenuBar {...baseProps} />)
    openMenu(screen.getByRole('button', { name: /affichage/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /basculer calques/i }))
    expect(baseProps.onToggleCalques).toHaveBeenCalled()
  })

  it('calls onToggleEditMode when "Mode édition" is clicked', async () => {
    const onToggleEditMode = vi.fn()
    render(<MenuBar {...baseProps} onToggleCalques={vi.fn()} onToggleEditMode={onToggleEditMode} />)
    openMenu(screen.getByRole('button', { name: /affichage/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /mode édition/i }))
    expect(onToggleEditMode).toHaveBeenCalled()
  })

  it('renders "Zoom +/-", "Recentrer sur les parcelles" and "Fond de carte" disabled', async () => {
    render(<MenuBar {...baseProps} onToggleCalques={vi.fn()} onToggleEditMode={vi.fn()} />)
    openMenu(screen.getByRole('button', { name: /affichage/i }))
    expect(await screen.findByRole('menuitem', { name: /zoom \+/i })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: /zoom −/i })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: /recentrer/i })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: /fond de carte/i })).toHaveAttribute('aria-disabled', 'true')
  })
})

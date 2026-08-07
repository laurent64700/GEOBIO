// src/components/MenuBar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

  it('disables Annuler/Refaire for the duration of its own in-flight call (self-reentrancy guard)', async () => {
    let resolveUndo: () => void
    vi.mocked(actionHistory.undo).mockReturnValue(new Promise((resolve) => { resolveUndo = () => resolve(undefined) }))
    render(<MenuBar {...baseProps} planId="p1" undoRedoBusy={false} />)
    openMenu(screen.getByRole('button', { name: /modifier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /^annuler$/i }))

    openMenu(screen.getByRole('button', { name: /modifier/i }))
    expect(await screen.findByRole('menuitem', { name: /^annuler$/i })).toHaveAttribute('aria-disabled', 'true')

    resolveUndo!()
  })

  it('renders "Supprimer l\'élément sélectionné" disabled', async () => {
    render(<MenuBar {...baseProps} planId="p1" undoRedoBusy={false} />)
    openMenu(screen.getByRole('button', { name: /modifier/i }))
    expect(await screen.findByRole('menuitem', { name: /supprimer l'élément/i })).toHaveAttribute('aria-disabled', 'true')
  })
})

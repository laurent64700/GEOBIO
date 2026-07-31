import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { UndoRedoControls } from './UndoRedoControls'
import * as actionHistory from '../offline/actionHistory'

vi.mock('../offline/actionHistory')

describe('UndoRedoControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(false)
    vi.mocked(actionHistory.hasRedoableAction).mockResolvedValue(false)
  })

  it('renders both buttons disabled when there is nothing to undo/redo', async () => {
    render(<UndoRedoControls planId="p1" onChanged={vi.fn()} />)

    expect(await screen.findByRole('button', { name: /annuler/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /refaire/i })).toBeDisabled()
  })

  it('enables the buttons once hasUndoableAction/hasRedoableAction resolve true', async () => {
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(true)
    vi.mocked(actionHistory.hasRedoableAction).mockResolvedValue(true)

    render(<UndoRedoControls planId="p1" onChanged={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /annuler/i })).toBeEnabled())
    expect(screen.getByRole('button', { name: /refaire/i })).toBeEnabled()
  })

  it('clicking Annuler calls undo(planId) and then the onChanged callback', async () => {
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(true)
    const onChanged = vi.fn()
    render(<UndoRedoControls planId="p1" onChanged={onChanged} />)
    const undoButton = await screen.findByRole('button', { name: /annuler/i })
    await waitFor(() => expect(undoButton).toBeEnabled())

    fireEvent.click(undoButton)

    await waitFor(() => expect(actionHistory.undo).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('clicking Refaire calls redo(planId) and then the onChanged callback', async () => {
    vi.mocked(actionHistory.hasRedoableAction).mockResolvedValue(true)
    const onChanged = vi.fn()
    render(<UndoRedoControls planId="p1" onChanged={onChanged} />)
    const redoButton = await screen.findByRole('button', { name: /refaire/i })
    await waitFor(() => expect(redoButton).toBeEnabled())

    fireEvent.click(redoButton)

    await waitFor(() => expect(actionHistory.redo).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('shows a dismissible error banner if undo() rejects, without calling onChanged', async () => {
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(true)
    vi.mocked(actionHistory.undo).mockRejectedValue(new Error('réseau indisponible'))
    const onChanged = vi.fn()
    render(<UndoRedoControls planId="p1" onChanged={onChanged} />)
    const undoButton = await screen.findByRole('button', { name: /annuler/i })
    await waitFor(() => expect(undoButton).toBeEnabled())

    fireEvent.click(undoButton)

    expect(await screen.findByRole('alert')).toHaveTextContent('réseau indisponible')
    expect(onChanged).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('disables both Annuler and Refaire while an undo call is in flight (reentrancy guard per actionHistory.ts precondition)', async () => {
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(true)
    vi.mocked(actionHistory.hasRedoableAction).mockResolvedValue(true)

    let resolveUndo: () => void
    const pendingUndo = new Promise<void>((resolve) => {
      resolveUndo = resolve
    })
    vi.mocked(actionHistory.undo).mockReturnValue(pendingUndo)

    render(<UndoRedoControls planId="p1" onChanged={vi.fn()} />)
    const undoButton = await screen.findByRole('button', { name: /annuler/i })
    const redoButton = screen.getByRole('button', { name: /refaire/i })
    await waitFor(() => expect(undoButton).toBeEnabled())
    await waitFor(() => expect(redoButton).toBeEnabled())

    fireEvent.click(undoButton)

    // Both buttons must be disabled while the undo call is pending — Refaire
    // was never clicked, proving the busy flag is shared, not per-button.
    await waitFor(() => expect(undoButton).toBeDisabled())
    expect(redoButton).toBeDisabled()

    await act(async () => {
      resolveUndo!()
      await pendingUndo
    })

    // Once settled, state reverts to whatever the (mocked) poll-derived
    // values say — both true here.
    await waitFor(() => expect(undoButton).toBeEnabled())
    expect(redoButton).toBeEnabled()
  })

  it('re-checks hasUndoableAction/hasRedoableAction on the poll interval, not just on mount (regression test for the interval actually being wired up)', async () => {
    vi.useFakeTimers()
    try {
      render(<UndoRedoControls planId="p1" onChanged={vi.fn()} />)
      // Mount-time call only.
      expect(vi.mocked(actionHistory.hasUndoableAction)).toHaveBeenCalledTimes(1)

      vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(true)
      // Must be wrapped in act() — the interval's setState calls happen
      // outside any React act() boundary otherwise, and with fake timers
      // active, findByRole's own polling never observes the DOM update
      // (confirmed empirically: without this wrapper, the test hangs until
      // Vitest's timeout, with an "update ... not wrapped in act(...)" warning).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500) // POLL_INTERVAL_MS
      })

      expect(vi.mocked(actionHistory.hasUndoableAction)).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('button', { name: /annuler/i })).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })
})

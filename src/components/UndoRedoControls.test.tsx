import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { UndoRedoControls } from './UndoRedoControls'
import * as actionHistory from '../offline/actionHistory'

vi.mock('../offline/actionHistory')

// A minimal controlled parent — mirrors how MissionWorkspace actually lifts
// `busy` state and wires it to both UndoRedoControls and MenuBar in
// production. UndoRedoControls no longer tracks busy internally (fully
// controlled prop, see UndoRedoControlsProps' doc comment), so any test that
// needs to observe the buttons' disabled state actually reacting to an
// in-flight call must render through a real stateful parent like this one,
// rather than a bare mock onBusyChange that never feeds a value back in.
function ControlledUndoRedoControls({
  planId,
  onChanged,
  onBusyChange,
}: {
  planId: string
  onChanged: () => void
  onBusyChange?: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <UndoRedoControls
      planId={planId}
      onChanged={onChanged}
      busy={busy}
      onBusyChange={(value) => {
        setBusy(value)
        onBusyChange?.(value)
      }}
    />
  )
}

describe('UndoRedoControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(false)
    vi.mocked(actionHistory.hasRedoableAction).mockResolvedValue(false)
  })

  it('renders both buttons disabled when there is nothing to undo/redo', async () => {
    render(<UndoRedoControls planId="p1" onChanged={vi.fn()} busy={false} onBusyChange={vi.fn()} />)

    expect(await screen.findByRole('button', { name: /annuler/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /refaire/i })).toBeDisabled()
  })

  it('enables the buttons once hasUndoableAction/hasRedoableAction resolve true', async () => {
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(true)
    vi.mocked(actionHistory.hasRedoableAction).mockResolvedValue(true)

    render(<UndoRedoControls planId="p1" onChanged={vi.fn()} busy={false} onBusyChange={vi.fn()} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /annuler/i })).toBeEnabled())
    expect(screen.getByRole('button', { name: /refaire/i })).toBeEnabled()
  })

  it('clicking Annuler calls undo(planId) and then the onChanged callback', async () => {
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(true)
    const onChanged = vi.fn()
    render(<UndoRedoControls planId="p1" onChanged={onChanged} busy={false} onBusyChange={vi.fn()} />)
    const undoButton = await screen.findByRole('button', { name: /annuler/i })
    await waitFor(() => expect(undoButton).toBeEnabled())

    fireEvent.click(undoButton)

    await waitFor(() => expect(actionHistory.undo).toHaveBeenCalledWith('p1'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('clicking Refaire calls redo(planId) and then the onChanged callback', async () => {
    vi.mocked(actionHistory.hasRedoableAction).mockResolvedValue(true)
    const onChanged = vi.fn()
    render(<UndoRedoControls planId="p1" onChanged={onChanged} busy={false} onBusyChange={vi.fn()} />)
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
    render(<UndoRedoControls planId="p1" onChanged={onChanged} busy={false} onBusyChange={vi.fn()} />)
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

    render(<ControlledUndoRedoControls planId="p1" onChanged={vi.fn()} />)
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
      render(<UndoRedoControls planId="p1" onChanged={vi.fn()} busy={false} onBusyChange={vi.fn()} />)
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

  it('calls onBusyChange(true) then onBusyChange(false) around an undo call, disabling the buttons via the busy prop in between', async () => {
    const onBusyChange = vi.fn()
    vi.mocked(actionHistory.hasUndoableAction).mockResolvedValue(true)
    let resolveUndo: () => void
    const pendingUndo = new Promise<void>((resolve) => {
      resolveUndo = resolve
    })
    vi.mocked(actionHistory.undo).mockReturnValue(pendingUndo)
    render(<ControlledUndoRedoControls planId="p1" onChanged={vi.fn()} onBusyChange={onBusyChange} />)
    await waitFor(() => expect(screen.getByLabelText('Annuler')).not.toBeDisabled())

    fireEvent.click(screen.getByLabelText('Annuler'))

    expect(onBusyChange).toHaveBeenCalledWith(true)
    // UndoRedoControls is now a fully controlled component — it no longer
    // flips its own disabled state internally. This only goes true because
    // ControlledUndoRedoControls (standing in for the real parent,
    // MissionWorkspace) received onBusyChange(true) and re-rendered with
    // busy={true}. That round-trip through a real parent is exactly what a
    // one-way mirror (the bug code review caught) would have failed to do.
    await waitFor(() => expect(screen.getByLabelText('Annuler')).toBeDisabled())

    await act(async () => {
      resolveUndo!()
      await pendingUndo
    })

    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false))
  })
})

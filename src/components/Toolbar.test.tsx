// src/components/Toolbar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Toolbar } from './Toolbar'

describe('Toolbar', () => {
  it('renders as a fixed top toolbar', () => {
    render(<Toolbar>{/* children filled in by later tasks */}</Toolbar>)
    // A basic smoke test for now — asserts the wrapper renders; later tasks in
    // this chunk add assertions on actual content (UndoRedoControls, guide-line).
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })

  it('reveals the guide-line slot only while "Ligne guide" is toggled open, and reports null when it closes', () => {
    const onGuideLineSlotReady = vi.fn()
    render(<Toolbar onGuideLineSlotReady={onGuideLineSlotReady} />)
    expect(onGuideLineSlotReady).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /ligne guide/i }))
    expect(onGuideLineSlotReady).toHaveBeenCalledWith(expect.any(HTMLDivElement))

    fireEvent.click(screen.getByRole('button', { name: /ligne guide/i }))
    // Not toHaveBeenLastCalledWith(null): React DOM 19's DEV-mode ref-cleanup
    // path (safelyDetachRef) invokes the ref callback through
    // runWithFiberInDEV(fiber, ref, null), a fixed 5-argument-slot helper
    // that forwards all 5 positions — so the real call lands as
    // (null, undefined, undefined, undefined, undefined), not just (null).
    // toHaveBeenLastCalledWith does exact-arity matching and would fail on
    // that trailing padding even though the ref is genuinely invoked with
    // null as its one meaningful argument — verified empirically against
    // this repo's installed react-dom. Check the first argument directly
    // instead of the full argument list.
    expect(onGuideLineSlotReady.mock.calls.at(-1)?.[0]).toBeNull()
  })
})

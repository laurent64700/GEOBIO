// src/components/Toolbar.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Toolbar } from './Toolbar'

describe('Toolbar', () => {
  it('renders as a fixed top toolbar', () => {
    render(<Toolbar>{/* children filled in by later tasks */}</Toolbar>)
    // A basic smoke test for now — asserts the wrapper renders; later tasks in
    // this chunk add assertions on actual content (UndoRedoControls, guide-line).
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })
})

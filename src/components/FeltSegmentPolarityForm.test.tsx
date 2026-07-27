import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeltSegmentPolarityForm } from './FeltSegmentPolarityForm'

describe('FeltSegmentPolarityForm', () => {
  it('submits the chosen polarity for each end (default +/-)', () => {
    const onSubmit = vi.fn()
    render(<FeltSegmentPolarityForm onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Valider le segment' }))

    expect(onSubmit).toHaveBeenCalledWith({ polarityA: '+', polarityB: '-' })
  })

  it('lets each end be toggled independently before submitting (button shows current value, click flips it)', () => {
    const onSubmit = vi.fn()
    render(<FeltSegmentPolarityForm onSubmit={onSubmit} onCancel={vi.fn()} />)

    // Defaults: A='+', B='-' — click each once to flip both.
    fireEvent.click(screen.getByRole('button', { name: 'Extrémité A : +' }))
    fireEvent.click(screen.getByRole('button', { name: 'Extrémité B : -' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valider le segment' }))

    expect(onSubmit).toHaveBeenCalledWith({ polarityA: '-', polarityB: '+' })
  })

  it('calls onCancel when Annuler is clicked', () => {
    const onCancel = vi.fn()
    render(<FeltSegmentPolarityForm onSubmit={vi.fn()} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(onCancel).toHaveBeenCalled()
  })
})

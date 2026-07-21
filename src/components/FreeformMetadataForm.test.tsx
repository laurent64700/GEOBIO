// src/components/FreeformMetadataForm.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FreeformMetadataForm } from './FreeformMetadataForm'

describe('FreeformMetadataForm', () => {
  it('submits with all fields filled', () => {
    const onSubmit = vi.fn()
    render(<FreeformMetadataForm onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/sens du courant/i), { target: { value: '45' } })
    fireEvent.change(screen.getByLabelText(/profondeur/i), { target: { value: '2.5' } })
    fireEvent.change(screen.getByLabelText(/débit/i), { target: { value: 'faible' } })
    fireEvent.click(screen.getByRole('button', { name: /valider/i }))

    expect(onSubmit).toHaveBeenCalledWith({ currentBearingDeg: 45, depthM: 2.5, flowRate: 'faible' })
  })

  it('submits with all fields left empty as null (spec §5 — all optional)', () => {
    const onSubmit = vi.fn()
    render(<FreeformMetadataForm onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /valider/i }))

    expect(onSubmit).toHaveBeenCalledWith({ currentBearingDeg: null, depthM: null, flowRate: null })
  })

  it('calls onCancel without submitting', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<FreeformMetadataForm onSubmit={onSubmit} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: /annuler/i }))

    expect(onCancel).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

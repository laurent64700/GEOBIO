// src/components/GlobalAssessmentForm.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GlobalAssessmentForm } from './GlobalAssessmentForm'

describe('GlobalAssessmentForm', () => {
  it('renders a 0-10 slider for each of the 5 causes and a 0-180000 slider for Bovis', () => {
    render(<GlobalAssessmentForm onSaved={vi.fn()} />)
    ;[
      'Architectural', 'Électromagnétique', 'Géobiologique', 'Paranormal', 'Autres',
    ].forEach((label) => {
      const input = screen.getByLabelText(label) as HTMLInputElement
      expect(input.min).toBe('0')
      expect(input.max).toBe('10')
    })
    const bovis = screen.getByLabelText(/taux vibratoire/i) as HTMLInputElement
    expect(bovis.min).toBe('0')
    expect(bovis.max).toBe('180000')
  })

  it('calls onSaved with the slider values when submitted', () => {
    const onSaved = vi.fn()
    render(<GlobalAssessmentForm onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText('Architectural'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Électromagnétique'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Géobiologique'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Paranormal'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Autres'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText(/taux vibratoire/i), { target: { value: '9500' } })
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

    expect(onSaved).toHaveBeenCalledWith({
      causeArchitectural: 3, causeElectromagnetique: 6, causeGeobiologique: 8,
      causeParanormale: 1, causeAutres: 0, bovisRate: 9500,
    })
  })
})

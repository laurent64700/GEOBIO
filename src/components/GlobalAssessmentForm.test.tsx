// src/components/GlobalAssessmentForm.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GlobalAssessmentForm } from './GlobalAssessmentForm'

describe('GlobalAssessmentForm', () => {
  it('renders a 0-10 slider for each of the 5 causes and a plain number field for Bovis', () => {
    // Bovis used to be a 0-180000 range slider — with that span on a
    // physical slider track, each pixel represented well over 1000 units,
    // making it impossible to land on the exact figure a dowsing chart gives
    // (Laurent, field testing 08/2026: "ça ne se cale pas bien, on peut
    // avoir juste une case à remplir avec un chiffre que je donne"). A plain
    // number field lets him type the exact reading directly.
    render(<GlobalAssessmentForm onSaved={vi.fn()} />)
    ;[
      'Architectural', 'Électromagnétique', 'Géobiologique', 'Paranormal', 'Autres',
    ].forEach((label) => {
      const input = screen.getByLabelText(label) as HTMLInputElement
      expect(input.type).toBe('range')
      expect(input.min).toBe('0')
      expect(input.max).toBe('10')
    })
    const bovis = screen.getByLabelText(/taux vibratoire/i) as HTMLInputElement
    expect(bovis.type).toBe('number')
    expect(bovis.min).toBe('0')
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

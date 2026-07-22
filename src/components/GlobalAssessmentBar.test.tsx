// src/components/GlobalAssessmentBar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GlobalAssessmentBar } from './GlobalAssessmentBar'

describe('GlobalAssessmentBar', () => {
  const baseValues = {
    causeArchitectural: 3, causeElectromagnetique: 1, causeGeobiologique: 5,
    causeParanormale: 0, causeAutres: 2, bovisRate: 8000,
  }

  it('renders all 6 sliders pre-filled with the current mission values', () => {
    render(<GlobalAssessmentBar values={baseValues} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Architectural')).toHaveValue('3')
    expect(screen.getByLabelText('Géobiologique')).toHaveValue('5')
  })

  it('calls onChange with the full updated value set after a debounce delay following a slider change (no explicit save button)', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<GlobalAssessmentBar values={baseValues} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Architectural'), { target: { value: '7' } })
    expect(onChange).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(600))
    expect(onChange).toHaveBeenCalledWith({ ...baseValues, causeArchitectural: 7 })

    expect(screen.queryByRole('button', { name: /enregistrer/i })).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})

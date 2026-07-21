import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PhenomenonPicker } from './PhenomenonPicker'

describe('PhenomenonPicker', () => {
  it('calls onSelectKind with the clicked kind', () => {
    const onSelectKind = vi.fn()
    render(<PhenomenonPicker activeKind={null} onSelectKind={onSelectKind} />)

    fireEvent.click(screen.getByRole('button', { name: /spire.*vortex/i }))

    expect(onSelectKind).toHaveBeenCalledWith('spire-vortex')
  })

  it('shows which kind is currently active for placement', () => {
    render(<PhenomenonPicker activeKind="tube-magique" onSelectKind={vi.fn()} />)
    expect(screen.getByRole('button', { name: /tube.*magique/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking the active kind again deselects it (cancels placement mode)', () => {
    const onSelectKind = vi.fn()
    render(<PhenomenonPicker activeKind="point-cosmique" onSelectKind={onSelectKind} />)

    fireEvent.click(screen.getByRole('button', { name: /point.*cosmique/i }))

    expect(onSelectKind).toHaveBeenCalledWith(null)
  })
})

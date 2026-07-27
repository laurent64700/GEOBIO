import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ContextObjectPicker } from './ContextObjectPicker'

describe('ContextObjectPicker', () => {
  it('calls onSelectKind with the clicked kind', () => {
    const onSelectKind = vi.fn()
    render(<ContextObjectPicker activeKind={null} onSelectKind={onSelectKind} />)

    fireEvent.click(screen.getByRole('button', { name: /canapé/i }))

    expect(onSelectKind).toHaveBeenCalledWith('canape')
  })

  it('shows which kind is currently active for placement', () => {
    render(<ContextObjectPicker activeKind="puits" onSelectKind={vi.fn()} />)
    expect(screen.getByRole('button', { name: /puits/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking the active kind again deselects it (cancels placement mode)', () => {
    const onSelectKind = vi.fn()
    render(<ContextObjectPicker activeKind="route" onSelectKind={onSelectKind} />)

    fireEvent.click(screen.getByRole('button', { name: /route/i }))

    expect(onSelectKind).toHaveBeenCalledWith(null)
  })

  it('groups options under "Intérieur" and "Extérieur" headings', () => {
    render(<ContextObjectPicker activeKind={null} onSelectKind={vi.fn()} />)
    expect(screen.getByText('Intérieur')).toBeInTheDocument()
    expect(screen.getByText('Extérieur')).toBeInTheDocument()
    // sanity: an indoor and an outdoor option are both present
    expect(screen.getByRole('button', { name: /table$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /haie/i })).toBeInTheDocument()
  })
})

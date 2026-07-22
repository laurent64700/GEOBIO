import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeltPointPicker } from './FeltPointPicker'

describe('FeltPointPicker', () => {
  it('calls onSelectNetwork with the clicked network name', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName={null} onSelectNetwork={onSelectNetwork} />)

    fireEvent.click(screen.getByRole('button', { name: 'Hartmann' }))

    expect(onSelectNetwork).toHaveBeenCalledWith('Hartmann')
  })

  it('shows which network is currently active for placement', () => {
    render(<FeltPointPicker activeNetworkName="Curry" onSelectNetwork={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Curry' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking the active network again deselects it (cancels placement mode)', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName="Palm" onSelectNetwork={onSelectNetwork} />)

    fireEvent.click(screen.getByRole('button', { name: 'Palm' }))

    expect(onSelectNetwork).toHaveBeenCalledWith(null)
  })

  it('"Autre" reveals a free-text field; submitting it arms placement with the typed name', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName={null} onSelectNetwork={onSelectNetwork} />)

    fireEvent.click(screen.getByRole('button', { name: 'Autre' }))
    fireEvent.change(screen.getByLabelText(/nom du réseau/i), { target: { value: 'Réseau X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(onSelectNetwork).toHaveBeenCalledWith('Réseau X')
  })

  it('does not submit an empty custom network name', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName={null} onSelectNetwork={onSelectNetwork} />)

    fireEvent.click(screen.getByRole('button', { name: 'Autre' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(onSelectNetwork).not.toHaveBeenCalled()
  })

  it('shows "Autre" as pressed and lets a single click deselect an already-armed custom network (no reopened text field)', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName="Réseau X" onSelectNetwork={onSelectNetwork} />)

    const autreButton = screen.getByRole('button', { name: 'Autre' })
    expect(autreButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(autreButton)

    expect(onSelectNetwork).toHaveBeenCalledWith(null)
    expect(screen.queryByLabelText(/nom du réseau/i)).not.toBeInTheDocument()
  })
})

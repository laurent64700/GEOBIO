import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeltPointPicker } from './FeltPointPicker'

describe('FeltPointPicker', () => {
  it('calls onSelectNetwork with the clicked network name', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName={null} onSelectNetwork={onSelectNetwork} selectedBearing={null} onSelectBearing={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Hartmann' }))

    expect(onSelectNetwork).toHaveBeenCalledWith('Hartmann')
  })

  it('shows which network is currently active for placement', () => {
    render(<FeltPointPicker activeNetworkName="Curry" onSelectNetwork={vi.fn()} selectedBearing={45} onSelectBearing={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Curry' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking the active network again deselects it (cancels placement mode)', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName="Palm" onSelectNetwork={onSelectNetwork} selectedBearing={0} onSelectBearing={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Palm' }))

    expect(onSelectNetwork).toHaveBeenCalledWith(null)
  })

  it('"Autre" reveals a free-text field; submitting it arms placement with the typed name', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName={null} onSelectNetwork={onSelectNetwork} selectedBearing={null} onSelectBearing={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Autre' }))
    fireEvent.change(screen.getByLabelText(/nom du réseau/i), { target: { value: 'Réseau X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(onSelectNetwork).toHaveBeenCalledWith('Réseau X')
  })

  it('does not submit an empty custom network name', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName={null} onSelectNetwork={onSelectNetwork} selectedBearing={null} onSelectBearing={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Autre' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(onSelectNetwork).not.toHaveBeenCalled()
  })

  it('shows "Autre" as pressed and lets a single click deselect an already-armed custom network (no reopened text field)', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName="Réseau X" onSelectNetwork={onSelectNetwork} selectedBearing={0} onSelectBearing={vi.fn()} />)

    const autreButton = screen.getByRole('button', { name: 'Autre' })
    expect(autreButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(autreButton)

    expect(onSelectNetwork).toHaveBeenCalledWith(null)
    expect(screen.queryByLabelText(/nom du réseau/i)).not.toBeInTheDocument()
  })

  it('shows no bearing buttons when no network is armed', () => {
    render(<FeltPointPicker activeNetworkName={null} onSelectNetwork={vi.fn()} selectedBearing={null} onSelectBearing={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'N/S' })).not.toBeInTheDocument()
  })

  it('shows the N/S and E/O orientation buttons for a 0°-family network (Hartmann)', () => {
    render(<FeltPointPicker activeNetworkName="Hartmann" onSelectNetwork={vi.fn()} selectedBearing={0} onSelectBearing={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'N/S' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'E/O' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: '45°' })).not.toBeInTheDocument()
  })

  it('shows the 45°/135° orientation buttons for a 45°-family network (Curry)', () => {
    render(<FeltPointPicker activeNetworkName="Curry" onSelectNetwork={vi.fn()} selectedBearing={135} onSelectBearing={vi.fn()} />)
    expect(screen.getByRole('button', { name: '45°' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '135°' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'N/S' })).not.toBeInTheDocument()
  })

  it('falls back to N/S and E/O for a custom (non-family) network name', () => {
    render(<FeltPointPicker activeNetworkName="Réseau X" onSelectNetwork={vi.fn()} selectedBearing={0} onSelectBearing={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'N/S' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'E/O' })).toBeInTheDocument()
  })

  it('calls onSelectBearing when an orientation button is clicked', () => {
    const onSelectBearing = vi.fn()
    render(<FeltPointPicker activeNetworkName="Hartmann" onSelectNetwork={vi.fn()} selectedBearing={0} onSelectBearing={onSelectBearing} />)

    fireEvent.click(screen.getByRole('button', { name: 'E/O' }))

    expect(onSelectBearing).toHaveBeenCalledWith(90)
  })

  it('hides the orientation buttons once a segment is pending (bearingLocked): clicking them after the map click had no effect, so they must not appear as if it still would', () => {
    render(
      <FeltPointPicker
        activeNetworkName="Hartmann"
        onSelectNetwork={vi.fn()}
        selectedBearing={0}
        onSelectBearing={vi.fn()}
        bearingLocked
      />
    )
    expect(screen.queryByRole('button', { name: 'N/S' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'E/O' })).not.toBeInTheDocument()
    // The network buttons themselves are unaffected — only orientation is locked.
    expect(screen.getByRole('button', { name: 'Hartmann' })).toBeInTheDocument()
  })
})

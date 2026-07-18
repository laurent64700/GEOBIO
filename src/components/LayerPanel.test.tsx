import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LayerPanel } from './LayerPanel'

describe('LayerPanel', () => {
  it('shows "Ressenti terrain" checked by default, grid layers unchecked by default', () => {
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Ressenti terrain')).toBeChecked()
    expect(screen.getByLabelText('Hartmann')).not.toBeChecked()
  })

  it('respects explicit visibility overrides', () => {
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{ 'felt-points': false, gi1: true }}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Ressenti terrain')).not.toBeChecked()
    expect(screen.getByLabelText('Hartmann')).toBeChecked()
  })

  it('calls onToggle with the layer id when a checkbox is clicked', () => {
    const onToggle = vi.fn()
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={onToggle}
      />
    )
    fireEvent.click(screen.getByLabelText('Hartmann'))
    expect(onToggle).toHaveBeenCalledWith('gi1')
  })
})

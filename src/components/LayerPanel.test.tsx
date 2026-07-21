import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  LayerPanel,
  BAGUA_LAYER_ID,
  FELT_SEGMENTS_LAYER_ID,
  PATHOGENIC_CROSSINGS_LAYER_ID,
  PHENOMENA_LAYER_ID,
  FREEFORM_NETWORK_LAYER_ID,
} from './LayerPanel'

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

  it('shows "Tiges (segments ressentis)" checked by default, like felt points (real field data, not an auxiliary layer)', () => {
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Tiges (segments ressentis)')).toBeChecked()
  })

  it('calls onToggle with FELT_SEGMENTS_LAYER_ID when the felt-segments checkbox is clicked', () => {
    const onToggle = vi.fn()
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={onToggle}
      />
    )
    fireEvent.click(screen.getByLabelText('Tiges (segments ressentis)'))
    expect(onToggle).toHaveBeenCalledWith(FELT_SEGMENTS_LAYER_ID)
  })

  it('shows the Bagua layer checkbox, unchecked by default (correction-phase tool, not a blind-sensing default)', () => {
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/bagua/i)).not.toBeChecked()
  })

  it('calls onToggle with BAGUA_LAYER_ID when the Bagua checkbox is clicked', () => {
    const onToggle = vi.fn()
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={onToggle}
      />
    )
    fireEvent.click(screen.getByLabelText(/bagua/i))
    expect(onToggle).toHaveBeenCalledWith(BAGUA_LAYER_ID)
  })

  it('shows the pathogenic-crossings layer checkbox, unchecked by default (like grid layers)', () => {
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/croisements pathogènes/i)).not.toBeChecked()
  })

  it('calls onToggle with PATHOGENIC_CROSSINGS_LAYER_ID when the crossings checkbox is clicked', () => {
    const onToggle = vi.fn()
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={onToggle}
      />
    )
    fireEvent.click(screen.getByLabelText(/croisements pathogènes/i))
    expect(onToggle).toHaveBeenCalledWith(PATHOGENIC_CROSSINGS_LAYER_ID)
  })

  it('shows the phenomena layer checkbox, unchecked by default (like Bagua/pathogenic-crossings)', () => {
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/phénomènes ponctuels/i)).not.toBeChecked()
  })

  it('calls onToggle with PHENOMENA_LAYER_ID when the phenomena checkbox is clicked', () => {
    const onToggle = vi.fn()
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={onToggle}
      />
    )
    fireEvent.click(screen.getByLabelText(/phénomènes ponctuels/i))
    expect(onToggle).toHaveBeenCalledWith(PHENOMENA_LAYER_ID)
  })

  it('shows the freeform-network layer checkbox, unchecked by default (like Bagua/pathogenic-crossings/phenomena)', () => {
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByLabelText(/tracés eau\/faille/i)).not.toBeChecked()
  })

  it('calls onToggle with FREEFORM_NETWORK_LAYER_ID when the freeform-network checkbox is clicked', () => {
    const onToggle = vi.fn()
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={onToggle}
      />
    )
    fireEvent.click(screen.getByLabelText(/tracés eau\/faille/i))
    expect(onToggle).toHaveBeenCalledWith(FREEFORM_NETWORK_LAYER_ID)
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

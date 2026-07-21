import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GridCreationPanel } from './GridCreationPanel'
import * as gridTemplatesRepo from '../data/gridTemplatesRepo'

vi.mock('../data/gridTemplatesRepo')

const hartmann = {
  id: 't0', name: 'Hartmann', spacingXM: 2.5, spacingYM: 1.8, angleTrueNorthDeg: 0,
  originOffsetX: 0, originOffsetY: 0, color: '#d32f2f', vibratoryBase: 7,
}

describe('GridCreationPanel', () => {
  it('starts collapsed, showing only an "Ajouter une grille" button', () => {
    render(<GridCreationPanel onOriginRequested={vi.fn()} onGenerate={vi.fn()} pendingOrigin={null} />)
    expect(screen.getByRole('button', { name: /ajouter une grille/i })).toBeInTheDocument()
    expect(screen.queryByText(/cliquez l'origine/i)).not.toBeInTheDocument()
  })

  it('shows the template picker after "Ajouter une grille", then prompts for an origin click once one is chosen', async () => {
    vi.mocked(gridTemplatesRepo.listGridTemplates).mockResolvedValue([hartmann])
    const onOriginRequested = vi.fn()

    render(<GridCreationPanel onOriginRequested={onOriginRequested} onGenerate={vi.fn()} pendingOrigin={null} />)
    fireEvent.click(screen.getByRole('button', { name: /ajouter une grille/i }))

    fireEvent.click(await screen.findByRole('button', { name: /hartmann/i }))

    expect(onOriginRequested).toHaveBeenCalled()
    expect(screen.getByText(/cliquez l'origine sur la carte/i)).toBeInTheDocument()
  })

  it('shows a polarity toggle once a pending origin exists, and calls onGenerate with the template/origin/polarity', async () => {
    vi.mocked(gridTemplatesRepo.listGridTemplates).mockResolvedValue([hartmann])
    const onGenerate = vi.fn()

    const { rerender } = render(
      <GridCreationPanel onOriginRequested={vi.fn()} onGenerate={onGenerate} pendingOrigin={null} />
    )
    fireEvent.click(screen.getByRole('button', { name: /ajouter une grille/i }))
    fireEvent.click(await screen.findByRole('button', { name: /hartmann/i }))

    // Simulates SiteMapView reporting a map click back to this panel as a prop update:
    rerender(
      <GridCreationPanel onOriginRequested={vi.fn()} onGenerate={onGenerate} pendingOrigin={{ x: 3, y: -2 }} />
    )

    expect(screen.getByText(/polarité ressentie/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+' }))
    fireEvent.click(screen.getByRole('button', { name: /générer/i }))

    expect(onGenerate).toHaveBeenCalledWith(hartmann, { x: 3, y: -2 }, '+')
  })
})

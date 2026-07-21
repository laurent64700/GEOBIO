import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GridTemplatePicker } from './GridTemplatePicker'
import * as gridTemplatesRepo from '../data/gridTemplatesRepo'

vi.mock('../data/gridTemplatesRepo')

const hartmann = {
  id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5,
  angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f',
  vibratoryBase: 7,
}

describe('GridTemplatePicker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists existing templates and calls onSelected when one is chosen', async () => {
    vi.mocked(gridTemplatesRepo.listGridTemplates).mockResolvedValue([hartmann])
    const onSelected = vi.fn()

    render(<GridTemplatePicker onSelected={onSelected} />)

    const option = await screen.findByRole('button', { name: /hartmann/i })
    fireEvent.click(option)
    expect(onSelected).toHaveBeenCalledWith(hartmann)
  })

  it('creates a new template and calls onSelected with it', async () => {
    vi.mocked(gridTemplatesRepo.listGridTemplates).mockResolvedValue([])
    const curry = {
      id: 't1', name: 'Curry', spacingXM: 2, spacingYM: 2,
      angleTrueNorthDeg: 45, originOffsetX: 0, originOffsetY: 0, color: '#52a675',
      vibratoryBase: 5,
    }
    vi.mocked(gridTemplatesRepo.createGridTemplate).mockResolvedValue(curry)
    const onSelected = vi.fn()

    render(<GridTemplatePicker onSelected={onSelected} />)
    await screen.findByText(/aucun gabarit/i)

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Curry' } })
    fireEvent.change(screen.getByLabelText(/espacement x/i), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/espacement y/i), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/angle/i), { target: { value: '45' } })
    fireEvent.change(screen.getByLabelText('Couleur'), { target: { value: '#52a675' } })
    fireEvent.change(screen.getByLabelText(/base vibratoire/i), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /créer le gabarit/i }))

    await waitFor(() =>
      expect(gridTemplatesRepo.createGridTemplate).toHaveBeenCalledWith({
        name: 'Curry', spacingXM: 2, spacingYM: 2, angleTrueNorthDeg: 45,
        originOffsetX: 0, originOffsetY: 0, color: '#52a675', vibratoryBase: 5,
      })
    )
    expect(onSelected).toHaveBeenCalledWith(curry)
  })
})

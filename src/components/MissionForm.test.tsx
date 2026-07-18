import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MissionForm } from './MissionForm'
import * as missionsRepo from '../data/missionsRepo'

vi.mock('../data/missionsRepo')

describe('MissionForm', () => {
  it('creates a mission and calls onCreated with the result', async () => {
    const mission = {
      id: 'm1', address: '12 rue des Lilas', missionDate: '2026-07-20', declinationDeg: null,
      originLat: null, originLng: null,
      causeArchitectural: null, causeElectromagnetique: null, causeGeobiologique: null,
      causeParanormale: null, causeAutres: null, bovisRate: null,
    }
    vi.mocked(missionsRepo.createMission).mockResolvedValue(mission)
    const onCreated = vi.fn()

    render(<MissionForm onCreated={onCreated} />)
    fireEvent.change(screen.getByLabelText('Adresse'), { target: { value: '12 rue des Lilas' } })
    fireEvent.change(screen.getByLabelText('Date de mission'), { target: { value: '2026-07-20' } })
    fireEvent.click(screen.getByRole('button', { name: /créer la mission/i }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(mission))
  })

  it('shows an error message when creation fails', async () => {
    vi.mocked(missionsRepo.createMission).mockRejectedValue(
      new Error('Impossible de créer la mission : network down')
    )

    render(<MissionForm onCreated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Adresse'), { target: { value: 'x' } })
    fireEvent.change(screen.getByLabelText('Date de mission'), { target: { value: '2026-07-20' } })
    fireEvent.click(screen.getByRole('button', { name: /créer la mission/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })
})

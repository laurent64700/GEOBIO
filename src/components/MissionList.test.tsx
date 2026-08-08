// src/components/MissionList.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MissionList } from './MissionList'
import type { Mission } from '../domain/types'
import { isOnlineNow } from '../offline/connectivity'

vi.mock('../offline/connectivity')

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'm1', address: '10 Rue de Rivoli, 75001 Paris', missionDate: '2026-07-20',
    declinationDeg: null, originLat: null, originLng: null,
    causeArchitectural: null, causeElectromagnetique: null, causeGeobiologique: null,
    causeParanormale: null, causeAutres: null, bovisRate: null,
    parcelRefs: [], buildingFootprint: null,
    ...overrides,
  }
}

describe('MissionList', () => {
  beforeEach(() => {
    vi.mocked(isOnlineNow).mockResolvedValue(true)
  })

  it('renders each mission with its address and date, and a "Nouvelle mission" button', () => {
    render(<MissionList missions={[makeMission()]} onSelectMission={vi.fn()} onCreateNew={vi.fn()} onDeleteMission={vi.fn()} />)
    expect(screen.getByText(/10 Rue de Rivoli/)).toBeInTheDocument()
    expect(screen.getByText(/2026-07-20/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nouvelle mission' })).toBeInTheDocument()
  })

  it('clicking a mission calls onSelectMission with it', () => {
    const onSelectMission = vi.fn()
    const mission = makeMission()
    render(<MissionList missions={[mission]} onSelectMission={onSelectMission} onCreateNew={vi.fn()} onDeleteMission={vi.fn()} />)
    fireEvent.click(screen.getByText(/10 Rue de Rivoli/))
    expect(onSelectMission).toHaveBeenCalledWith(mission)
  })

  it('clicking "Nouvelle mission" calls onCreateNew', () => {
    const onCreateNew = vi.fn()
    render(<MissionList missions={[]} onSelectMission={vi.fn()} onCreateNew={onCreateNew} onDeleteMission={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle mission' }))
    expect(onCreateNew).toHaveBeenCalled()
  })

  it('renders a delete button per mission', () => {
    render(<MissionList missions={[makeMission()]} onSelectMission={vi.fn()} onCreateNew={vi.fn()} onDeleteMission={vi.fn()} />)
    expect(screen.getByRole('button', { name: /supprimer la mission/i })).toBeInTheDocument()
  })

  it('clicking delete opens a confirmation, cancelling it does not call onDeleteMission', () => {
    const onDeleteMission = vi.fn()
    render(<MissionList missions={[makeMission()]} onSelectMission={vi.fn()} onCreateNew={vi.fn()} onDeleteMission={onDeleteMission} />)
    fireEvent.click(screen.getByRole('button', { name: /supprimer la mission/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onDeleteMission).not.toHaveBeenCalled()
    expect(screen.queryByText(/irréversible/i)).not.toBeInTheDocument()
  })

  it('confirming calls onDeleteMission with the mission', async () => {
    const onDeleteMission = vi.fn().mockResolvedValue(undefined)
    const mission = makeMission()
    render(<MissionList missions={[mission]} onSelectMission={vi.fn()} onCreateNew={vi.fn()} onDeleteMission={onDeleteMission} />)
    fireEvent.click(screen.getByRole('button', { name: /supprimer la mission/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => expect(onDeleteMission).toHaveBeenCalledWith(mission))
  })
})

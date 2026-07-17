import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MissionWorkspace } from './MissionWorkspace'
import * as plansRepo from '../data/plansRepo'

vi.mock('../data/plansRepo')
vi.mock('../components/MissionForm', async () => {
  const { useEffect } = await import('react')
  return {
    // Calls onCreated from an effect, not during render — matches how the
    // real MissionForm invokes it (from an async submit handler, after
    // render completes), and avoids React's "Cannot update a component
    // while rendering a different component" warning that a synchronous
    // in-render call would trigger.
    MissionForm: ({ onCreated }: { onCreated: (m: unknown) => void }) => {
      useEffect(() => {
        onCreated({ id: 'm1', address: 'x', missionDate: '2026-07-20', declinationDeg: null })
      }, [onCreated])
      return null
    },
  }
})
vi.mock('../components/MapView', () => ({
  MapView: () => <div data-testid="map-view" />,
}))

describe('MissionWorkspace', () => {
  it('creates an exterior plan once a mission is created, then shows the map', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1',
      missionId: 'm1',
      kind: 'exterieur',
      imageUrl: null,
      calibration: null,
    })

    render(<MissionWorkspace />)

    await waitFor(() =>
      expect(plansRepo.createPlan).toHaveBeenCalledWith({ missionId: 'm1', kind: 'exterieur' })
    )
    expect(await screen.findByTestId('map-view')).toBeInTheDocument()
  })

  it('shows an error if exterior plan creation fails', async () => {
    vi.mocked(plansRepo.createPlan).mockRejectedValue(
      new Error('Impossible de créer le plan : network down')
    )

    render(<MissionWorkspace />)

    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ParcelSelectionStep } from './ParcelSelectionStep'
import * as cadastreService from '../data/cadastreService'
import type { CadastralParcel } from '../data/cadastreService'

vi.mock('../data/cadastreService')

vi.mock('./MapView', () => ({
  MapView: ({ children }: { children?: React.ReactNode }) => <div data-testid="map-view">{children}</div>,
}))
vi.mock('./ParcelPicker', () => ({
  ParcelPicker: ({
    parcels,
    selectedIds,
    onToggle,
  }: {
    parcels: CadastralParcel[]
    selectedIds: Set<string>
    onToggle: (id: string) => void
  }) => (
    <div data-testid="parcel-picker">
      {parcels.map((p) => (
        <button key={p.id} onClick={() => onToggle(p.id)} data-selected={selectedIds.has(p.id)}>
          {p.id}
        </button>
      ))}
    </div>
  ),
}))

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const parcels: CadastralParcel[] = [
  { id: 'A123', section: 'A', ringsLatLng: [[{ lat: 48.8560, lng: 2.3510 }, { lat: 48.8562, lng: 2.3512 }]] },
  { id: 'A124', section: 'A', ringsLatLng: [[{ lat: 48.8563, lng: 2.3520 }, { lat: 48.8565, lng: 2.3522 }]] },
]

describe('ParcelSelectionStep', () => {
  beforeEach(() => {
    vi.mocked(cadastreService.fetchParcelsInBounds).mockResolvedValue(parcels)
  })

  it('fetches parcels around the mission origin and renders them once loaded', async () => {
    render(<ParcelSelectionStep missionOrigin={missionOrigin} onConfirm={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('A123')).toBeInTheDocument())
    expect(screen.getByText('A124')).toBeInTheDocument()
  })

  it('disables the confirm button until at least one parcel is selected', async () => {
    render(<ParcelSelectionStep missionOrigin={missionOrigin} onConfirm={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('A123')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /valider la sélection/i })).toBeDisabled()

    fireEvent.click(screen.getByText('A123'))
    expect(screen.getByRole('button', { name: /valider la sélection/i })).toBeEnabled()
  })

  it('calls onConfirm with the full parcel objects for the selected ids', async () => {
    const onConfirm = vi.fn()
    render(<ParcelSelectionStep missionOrigin={missionOrigin} onConfirm={onConfirm} />)
    await waitFor(() => expect(screen.getByText('A123')).toBeInTheDocument())

    fireEvent.click(screen.getByText('A123'))
    fireEvent.click(screen.getByText('A124'))
    fireEvent.click(screen.getByRole('button', { name: /valider la sélection/i }))

    expect(onConfirm.mock.calls[0][0]).toHaveLength(2)
    expect(onConfirm.mock.calls[0][0].map((p: CadastralParcel) => p.id).sort()).toEqual(['A123', 'A124'])
  })

  it('shows an error message when the parcel fetch fails', async () => {
    vi.mocked(cadastreService.fetchParcelsInBounds).mockRejectedValue(new Error('boom'))
    render(<ParcelSelectionStep missionOrigin={missionOrigin} onConfirm={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'))
  })
})

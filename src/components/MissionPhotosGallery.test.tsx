// src/components/MissionPhotosGallery.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MissionPhotosGallery } from './MissionPhotosGallery'
import * as missionPhotosRepo from '../data/missionPhotosRepo'

vi.mock('../data/missionPhotosRepo')
vi.mock('./RodDetectionPanel', () => ({
  RodDetectionPanel: ({
    photo,
    planId,
  }: {
    photo: { id: string }
    planId: string
  }) => <div data-testid="rod-detection-panel" data-photo-id={photo.id} data-plan-id={planId} />,
}))

const galleryProps = {
  missionId: 'm1',
  planId: 'p1',
  missionOrigin: { lat: 48.8566, lng: 2.3522 },
}

describe('MissionPhotosGallery', () => {
  it('loads and displays existing photos', async () => {
    vi.mocked(missionPhotosRepo.listMissionPhotos).mockResolvedValue([
      { id: 'mp1', missionId: 'm1', imageUrl: 'https://x/a.jpg', calibration: null, createdAt: '2026-07-16T10:00:00Z' },
    ])
    render(<MissionPhotosGallery {...galleryProps} />)
    expect(await screen.findByAltText(/photo aérienne/i)).toBeInTheDocument()
  })

  it('uploads a chosen file and adds it to the displayed list', async () => {
    vi.mocked(missionPhotosRepo.listMissionPhotos).mockResolvedValue([])
    vi.mocked(missionPhotosRepo.addMissionPhoto).mockResolvedValue({
      id: 'mp1', missionId: 'm1', imageUrl: 'https://x/new.jpg', calibration: null, createdAt: '2026-07-16T10:05:00Z',
    })

    render(<MissionPhotosGallery {...galleryProps} />)
    await waitFor(() => expect(missionPhotosRepo.listMissionPhotos).toHaveBeenCalled())

    const file = new File(['x'], 'new.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/ajouter une photo/i), { target: { files: [file] } })

    await waitFor(() => expect(missionPhotosRepo.addMissionPhoto).toHaveBeenCalledWith('m1', file))
    expect(await screen.findByAltText(/photo aérienne/i)).toBeInTheDocument()
  })

  it('opens RodDetectionPanel for the chosen photo, threaded with the plan id', async () => {
    vi.mocked(missionPhotosRepo.listMissionPhotos).mockResolvedValue([
      { id: 'mp1', missionId: 'm1', imageUrl: 'https://x/a.jpg', calibration: null, createdAt: '2026-07-16T10:00:00Z' },
    ])
    render(<MissionPhotosGallery {...galleryProps} />)

    fireEvent.click(await screen.findByRole('button', { name: /détecter les tiges/i }))

    const panel = await screen.findByTestId('rod-detection-panel')
    expect(panel).toHaveAttribute('data-photo-id', 'mp1')
    expect(panel).toHaveAttribute('data-plan-id', 'p1')
  })

  it('returns to the gallery when the panel is closed', async () => {
    vi.mocked(missionPhotosRepo.listMissionPhotos).mockResolvedValue([
      { id: 'mp1', missionId: 'm1', imageUrl: 'https://x/a.jpg', calibration: null, createdAt: '2026-07-16T10:00:00Z' },
    ])
    render(<MissionPhotosGallery {...galleryProps} />)
    fireEvent.click(await screen.findByRole('button', { name: /détecter les tiges/i }))
    await screen.findByTestId('rod-detection-panel')

    fireEvent.click(screen.getByRole('button', { name: /retour à la galerie/i }))

    expect(screen.queryByTestId('rod-detection-panel')).not.toBeInTheDocument()
    expect(await screen.findByAltText(/photo aérienne/i)).toBeInTheDocument()
  })
})

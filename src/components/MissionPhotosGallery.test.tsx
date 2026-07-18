// src/components/MissionPhotosGallery.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MissionPhotosGallery } from './MissionPhotosGallery'
import * as missionPhotosRepo from '../data/missionPhotosRepo'

vi.mock('../data/missionPhotosRepo')

describe('MissionPhotosGallery', () => {
  it('loads and displays existing photos', async () => {
    vi.mocked(missionPhotosRepo.listMissionPhotos).mockResolvedValue([
      { id: 'mp1', missionId: 'm1', imageUrl: 'https://x/a.jpg', createdAt: '2026-07-16T10:00:00Z' },
    ])
    render(<MissionPhotosGallery missionId="m1" />)
    expect(await screen.findByAltText(/photo aérienne/i)).toBeInTheDocument()
  })

  it('uploads a chosen file and adds it to the displayed list', async () => {
    vi.mocked(missionPhotosRepo.listMissionPhotos).mockResolvedValue([])
    vi.mocked(missionPhotosRepo.addMissionPhoto).mockResolvedValue({
      id: 'mp1', missionId: 'm1', imageUrl: 'https://x/new.jpg', createdAt: '2026-07-16T10:05:00Z',
    })

    render(<MissionPhotosGallery missionId="m1" />)
    await waitFor(() => expect(missionPhotosRepo.listMissionPhotos).toHaveBeenCalled())

    const file = new File(['x'], 'new.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/ajouter une photo/i), { target: { files: [file] } })

    await waitFor(() => expect(missionPhotosRepo.addMissionPhoto).toHaveBeenCalledWith('m1', file))
    expect(await screen.findByAltText(/photo aérienne/i)).toBeInTheDocument()
  })
})

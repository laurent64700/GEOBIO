// src/components/RodDetectionPanel.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RodDetectionPanel } from './RodDetectionPanel'
import * as arucoDetector from '../vision/arucoDetector'
import * as arucoMapping from '../vision/arucoMapping'
import * as rodMarkersRepo from '../data/rodMarkersRepo'
import * as missionPhotosRepo from '../data/missionPhotosRepo'
import * as feltPointsRepo from '../data/feltPointsRepo'

vi.mock('../vision/arucoDetector')
vi.mock('../vision/arucoMapping')
vi.mock('../data/rodMarkersRepo')
vi.mock('../data/missionPhotosRepo')
vi.mock('../data/feltPointsRepo')
vi.mock('./PlanCalibrationTool', () => ({
  PlanCalibrationTool: ({ onCalibrated }: { onCalibrated: (c: unknown) => void }) => (
    <button onClick={() => onCalibrated({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })}>simulate-calibrated</button>
  ),
}))

const uncalibratedPhoto = {
  id: 'mp1', missionId: 'm1', imageUrl: 'https://x/a.jpg', calibration: null,
  createdAt: '2026-07-16T10:00:00Z',
}
const calibratedPhoto = { ...uncalibratedPhoto, calibration: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } }

describe('RodDetectionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom's Image doesn't actually load image bytes — stub it so `new Image()`
    // fires onload on the next tick, simulating a successful load.
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_: string) {
          setTimeout(() => this.onload?.(), 0)
        }
      }
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  it('shows PlanCalibrationTool when the photo has no calibration yet', () => {
    render(
      <RodDetectionPanel
        photo={uncalibratedPhoto}
        planId="p1"
        missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
        mapCenter={[48.8566, 2.3522]}
        onCalibrated={vi.fn()}
      />
    )
    expect(screen.getByText('simulate-calibrated')).toBeInTheDocument()
  })

  it('saves the calibration and notifies the parent once calibrated', async () => {
    vi.mocked(missionPhotosRepo.setPhotoCalibration).mockResolvedValue(calibratedPhoto)
    const onCalibrated = vi.fn()

    render(
      <RodDetectionPanel
        photo={uncalibratedPhoto}
        planId="p1"
        missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
        mapCenter={[48.8566, 2.3522]}
        onCalibrated={onCalibrated}
      />
    )
    fireEvent.click(screen.getByText('simulate-calibrated'))

    await waitFor(() =>
      expect(missionPhotosRepo.setPhotoCalibration).toHaveBeenCalledWith('mp1', {
        a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
      })
    )
    expect(onCalibrated).toHaveBeenCalledWith(calibratedPhoto)
  })

  it('shows a "Détecter les tiges" button once calibrated, and runs the full pipeline on click', async () => {
    vi.mocked(arucoDetector.detectMarkers).mockReturnValue([
      { markerId: 101, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
    ])
    vi.mocked(rodMarkersRepo.listRodMarkers).mockResolvedValue([
      { markerId: 101, networkName: 'Hartmann', rodNumber: 1 },
    ])
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({
      recognized: [{ markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 5, y: 5 }],
      totalDetected: 1,
      totalRecognized: 1,
    })
    vi.mocked(feltPointsRepo.createFeltPoint).mockResolvedValue({
      id: 'fp1', planId: 'p1', networkName: 'Hartmann', x: 5, y: 5, createdAt: '2026-07-16T10:00:00Z',
    })

    render(
      <RodDetectionPanel
        photo={calibratedPhoto}
        planId="p1"
        missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
        mapCenter={[48.8566, 2.3522]}
        onCalibrated={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /détecter les tiges/i }))

    await waitFor(() =>
      expect(feltPointsRepo.createFeltPoint).toHaveBeenCalledWith({
        planId: 'p1', networkName: 'Hartmann', x: 5, y: 5,
      })
    )
    expect(await screen.findByText('1 marqueurs détectés, 1 reconnus.')).toBeInTheDocument()
  })
})

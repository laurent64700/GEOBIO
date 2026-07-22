// src/components/RodDetectionPanel.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RodDetectionPanel } from './RodDetectionPanel'
import * as arucoDetector from '../vision/arucoDetector'
import * as arucoMapping from '../vision/arucoMapping'
import * as rodMarkersRepo from '../data/rodMarkersRepo'
import * as missionPhotosRepo from '../data/missionPhotosRepo'
import * as feltPointsRepo from '../data/feltPointsRepo'
import * as feltSegmentsRepo from '../data/feltSegmentsRepo'

vi.mock('../vision/arucoDetector')
vi.mock('../vision/arucoMapping')
vi.mock('../data/rodMarkersRepo')
vi.mock('../data/missionPhotosRepo')
vi.mock('../data/feltPointsRepo')
vi.mock('../data/feltSegmentsRepo')
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
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [],
      points: [{ markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 5, y: 5 }],
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
    expect(
      await screen.findByText('1 marqueurs détectés, 1 reconnus (0 tiges complètes, 1 points isolés).')
    ).toBeInTheDocument()
  })

  it('creates a FeltSegment for a paired rod and reports the split in the summary', async () => {
    vi.mocked(arucoDetector.detectMarkers).mockReturnValue([
      { markerId: 101, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      { markerId: 102, corners: [{ x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 10 }, { x: 40, y: 10 }] },
    ])
    vi.mocked(rodMarkersRepo.listRodMarkers).mockResolvedValue([
      { markerId: 101, networkName: 'Hartmann', rodNumber: 1 },
      { markerId: 102, networkName: 'Hartmann', rodNumber: 1 },
    ])
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({
      recognized: [
        { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
        { markerId: 102, rodNumber: 1, networkName: 'Hartmann', x: 4, y: 0 },
      ],
      totalDetected: 2,
      totalRecognized: 2,
    })
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [{ networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 } }],
      points: [],
    })
    vi.mocked(feltSegmentsRepo.createFeltSegment).mockResolvedValue({
      id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 }, polarityA: null, polarityB: null, createdAt: '2026-07-20T10:00:00Z',
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
      expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledWith({
        planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 },
      })
    )
    expect(feltPointsRepo.createFeltPoint).not.toHaveBeenCalled()
    expect(await screen.findByText('2 marqueurs détectés, 2 reconnus (1 tiges complètes, 0 points isolés).')).toBeInTheDocument()
  })

  it('creates both a FeltSegment and a FeltPoint when the pairing returns a mix of both', async () => {
    vi.mocked(arucoDetector.detectMarkers).mockReturnValue([
      { markerId: 101, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      { markerId: 102, corners: [{ x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 10 }, { x: 40, y: 10 }] },
      { markerId: 103, corners: [{ x: 80, y: 0 }, { x: 90, y: 0 }, { x: 90, y: 10 }, { x: 80, y: 10 }] },
    ])
    vi.mocked(rodMarkersRepo.listRodMarkers).mockResolvedValue([
      { markerId: 101, networkName: 'Hartmann', rodNumber: 1 },
      { markerId: 102, networkName: 'Hartmann', rodNumber: 1 },
      { markerId: 103, networkName: 'Curry', rodNumber: 2 },
    ])
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({
      recognized: [
        { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 0, y: 0 },
        { markerId: 102, rodNumber: 1, networkName: 'Hartmann', x: 4, y: 0 },
        { markerId: 103, rodNumber: 2, networkName: 'Curry', x: 9, y: 9 },
      ],
      totalDetected: 3,
      totalRecognized: 3,
    })
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [{ networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 } }],
      points: [{ markerId: 103, rodNumber: 2, networkName: 'Curry', x: 9, y: 9 }],
    })
    vi.mocked(feltSegmentsRepo.createFeltSegment).mockResolvedValue({
      id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 }, polarityA: null, polarityB: null, createdAt: '2026-07-20T10:00:00Z',
    })
    vi.mocked(feltPointsRepo.createFeltPoint).mockResolvedValue({
      id: 'fp1', planId: 'p1', networkName: 'Curry', x: 9, y: 9, createdAt: '2026-07-20T10:00:00Z',
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
      expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledWith({
        planId: 'p1', networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 4, y: 0 },
      })
    )
    expect(feltPointsRepo.createFeltPoint).toHaveBeenCalledWith({
      planId: 'p1', networkName: 'Curry', x: 9, y: 9,
    })
    expect(
      await screen.findByText('3 marqueurs détectés, 3 reconnus (1 tiges complètes, 1 points isolés).')
    ).toBeInTheDocument()
  })
})

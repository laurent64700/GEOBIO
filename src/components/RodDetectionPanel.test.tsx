// src/components/RodDetectionPanel.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RodDetectionPanel } from './RodDetectionPanel'
import * as arucoDetector from '../vision/arucoDetector'
import * as arucoMapping from '../vision/arucoMapping'
import * as rodPhotoCalibration from '../vision/rodPhotoCalibration'
import * as rodMarkersRepo from '../data/rodMarkersRepo'
import * as feltPointsRepo from '../data/feltPointsRepo'
import * as feltSegmentsRepo from '../data/feltSegmentsRepo'
import type { FeltSegment } from '../domain/types'

vi.mock('../vision/arucoDetector')
vi.mock('../vision/arucoMapping')
vi.mock('../vision/rodPhotoCalibration')
vi.mock('../data/rodMarkersRepo')
vi.mock('../data/feltPointsRepo')
vi.mock('../data/feltSegmentsRepo')
vi.mock('./MapView', () => ({
  // Matches the mock convention already used in PlanCalibrationTool.test.tsx —
  // real map interaction is covered by MapView's own tests.
  MapView: ({ onMapClick }: { onMapClick?: (latlng: { lat: number; lng: number }) => void }) => (
    <button onClick={() => onMapClick?.({ lat: 48.8566, lng: 2.3522 })}>simulate-map-click</button>
  ),
}))

const photo = {
  id: 'mp1', missionId: 'm1', imageUrl: 'https://x/a.jpg', calibration: null,
  createdAt: '2026-07-16T10:00:00Z',
}
const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const pixelSegments = [{ networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 0 } }]

let createdImages: { crossOrigin: string | null }[] = []

function stubDetectionPipeline() {
  vi.mocked(arucoDetector.detectMarkers).mockReturnValue([
    { markerId: 101, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
    { markerId: 102, corners: [{ x: 90, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }, { x: 90, y: 10 }] },
  ])
  vi.mocked(rodMarkersRepo.listRodMarkers).mockResolvedValue([
    { markerId: 101, networkName: 'Hartmann', rodNumber: 1 },
    { markerId: 102, networkName: 'Hartmann', rodNumber: 1 },
  ])
  vi.mocked(rodPhotoCalibration.groupRodsInPixelSpace).mockReturnValue({
    segments: pixelSegments,
    points: [],
  })
}

describe('RodDetectionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createdImages = []
    // jsdom's Image doesn't actually load image bytes — stub it so `new Image()`
    // fires onload on the next tick, simulating a successful load. Also records
    // each instance so tests can assert on properties (like crossOrigin) set on
    // it before `src` triggers the "load".
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        crossOrigin: string | null = null
        naturalWidth = 4000
        naturalHeight = 3000
        constructor() {
          createdImages.push(this)
        }
        set src(_: string) {
          setTimeout(() => this.onload?.(), 0)
        }
      }
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  it('shows the fixed capture-assumption text', async () => {
    stubDetectionPipeline()
    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)
    expect(
      await screen.findByText(/trépied \+ bras télescopique \+ télécommande/i)
    ).toBeInTheDocument()
  })

  it('detects automatically on mount and, once a complete rod on a known network is found, prompts for one map click', async () => {
    stubDetectionPipeline()
    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)

    await waitFor(() => expect(arucoDetector.detectMarkers).toHaveBeenCalled())
    expect(await screen.findByText('simulate-map-click')).toBeInTheDocument()
  })

  it('loads the detection image with crossOrigin="anonymous" (photo.imageUrl is cross-origin Supabase Storage — without this, arucoDetector\'s getImageData throws a canvas-tainted SecurityError)', async () => {
    stubDetectionPipeline()
    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)

    await waitFor(() => expect(arucoDetector.detectMarkers).toHaveBeenCalled())
    expect(createdImages).toHaveLength(1)
    expect(createdImages[0].crossOrigin).toBe('anonymous')
  })

  it('shows a blocking error and no map prompt when no complete rod is detected', async () => {
    vi.mocked(arucoDetector.detectMarkers).mockReturnValue([])
    vi.mocked(rodMarkersRepo.listRodMarkers).mockResolvedValue([])
    vi.mocked(rodPhotoCalibration.groupRodsInPixelSpace).mockReturnValue({ segments: [], points: [] })

    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Aucune tige complète détectée — impossible de calculer l'échelle."
    )
    expect(screen.queryByText('simulate-map-click')).not.toBeInTheDocument()
  })

  it('shows a blocking error and no map prompt when no detected rod belongs to a known network family', async () => {
    vi.mocked(arucoDetector.detectMarkers).mockReturnValue([
      { markerId: 201, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      { markerId: 202, corners: [{ x: 90, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }, { x: 90, y: 10 }] },
    ])
    vi.mocked(rodMarkersRepo.listRodMarkers).mockResolvedValue([
      { markerId: 201, networkName: 'RéseauInconnu', rodNumber: 1 },
      { markerId: 202, networkName: 'RéseauInconnu', rodNumber: 1 },
    ])
    vi.mocked(rodPhotoCalibration.groupRodsInPixelSpace).mockReturnValue({
      segments: [{ networkName: 'RéseauInconnu', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 0 } }],
      points: [],
    })

    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Aucune tige de réseau reconnu détectée — impossible de calculer l'orientation."
    )
    expect(screen.queryByText('simulate-map-click')).not.toBeInTheDocument()
  })

  it('on map click, derives scale/rotation/transform from the pixel-space segments and creates the real FeltSegments/FeltPoints', async () => {
    stubDetectionPipeline()
    vi.mocked(rodPhotoCalibration.deriveScale).mockReturnValue(0.02)
    vi.mocked(rodPhotoCalibration.deriveRotation).mockReturnValue(0)
    vi.mocked(rodPhotoCalibration.buildAffineTransform).mockReturnValue({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 })
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({
      recognized: [
        { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 5, y: 5 },
        { markerId: 102, rodNumber: 1, networkName: 'Hartmann', x: 7, y: 5 },
      ],
      totalDetected: 2,
      totalRecognized: 2,
    })
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [{ networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 } }],
      points: [],
    })
    vi.mocked(feltSegmentsRepo.createFeltSegment).mockResolvedValue({
      id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 }, polarityA: null, polarityB: null, createdAt: '2026-08-10T10:00:00Z',
    })

    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)
    fireEvent.click(await screen.findByText('simulate-map-click'))

    await waitFor(() =>
      expect(rodPhotoCalibration.deriveScale).toHaveBeenCalledWith(pixelSegments)
    )
    expect(rodPhotoCalibration.deriveRotation).toHaveBeenCalledWith(pixelSegments)
    expect(rodPhotoCalibration.buildAffineTransform).toHaveBeenCalledWith(
      0.02, 0, { x: expect.any(Number), y: expect.any(Number) }, { x: 2000, y: 1500 }
    )
    expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledWith({
      planId: 'p1', networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 },
    })
    expect(
      await screen.findByText('2 marqueurs détectés, 2 reconnus (1 tiges complètes, 0 points isolés).')
    ).toBeInTheDocument()
    // Map prompt is gone once calibrated; "Inverser l'orientation" appears instead.
    expect(screen.queryByText('simulate-map-click')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /inverser l'orientation/i })).toBeInTheDocument()
  })

  it('shows a busy state and hides the map prompt / invert button while a commit is in flight (the trigger element is unmounted for the duration, so there is nothing left to double-click in real usage)', async () => {
    stubDetectionPipeline()
    vi.mocked(rodPhotoCalibration.deriveScale).mockReturnValue(0.02)
    vi.mocked(rodPhotoCalibration.deriveRotation).mockReturnValue(0)
    vi.mocked(rodPhotoCalibration.buildAffineTransform).mockReturnValue({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 })
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({ recognized: [], totalDetected: 0, totalRecognized: 0 })
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [{ networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 } }],
      points: [],
    })
    // Left unresolved on purpose, to inspect the UI mid-flight before letting it settle.
    let resolveCreate: (value: FeltSegment) => void = () => {}
    vi.mocked(feltSegmentsRepo.createFeltSegment).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve
      })
    )

    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)
    fireEvent.click(await screen.findByText('simulate-map-click'))

    // Mid-flight: the map prompt that triggered this commit is gone (nothing
    // left to double-click), and "Inverser l'orientation" hasn't appeared yet
    // either (the commit it would act on hasn't resolved) — there is no
    // interactive element left that could re-trigger a second commit.
    expect(screen.queryByText('simulate-map-click')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /inverser l'orientation/i })).not.toBeInTheDocument()
    expect(screen.getByText(/enregistrement en cours/i)).toBeInTheDocument()

    resolveCreate({
      id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 }, polarityA: null, polarityB: null, createdAt: '2026-08-10T10:00:00Z',
    })

    expect(await screen.findByRole('button', { name: /inverser l'orientation/i })).toBeInTheDocument()
    expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledTimes(1)
  })

  it('"Inverser l\'orientation" deletes the created entities and recreates them with the other family member, toggling back on a second click', async () => {
    stubDetectionPipeline()
    vi.mocked(rodPhotoCalibration.deriveScale).mockReturnValue(0.02)
    vi.mocked(rodPhotoCalibration.deriveRotation).mockReturnValue(0)
    vi.mocked(rodPhotoCalibration.buildAffineTransform).mockReturnValue({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 })
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({
      recognized: [], totalDetected: 2, totalRecognized: 2,
    })
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [{ networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 } }],
      points: [],
    })
    // 3 resolved values, not 2: with create-then-delete ordering (this task's
    // fix), the SECOND "Inverser l'orientation" click's delete of 'fs2' only
    // happens after that click's own create call succeeds — so this test
    // must provision a 3rd resolved value itself rather than relying on
    // whatever a neighboring test's mock leftovers happen to be.
    // vi.clearAllMocks() (in beforeEach) clears call history but NOT queued
    // mockResolvedValueOnce/mockReturnValue implementations from other
    // tests in this file (that's mockReset, not mockClear) — verified by
    // running this test in isolation (`vitest -t "Inverser"`): with only 2
    // queued values it fails, because the 3rd call falls through to
    // whatever default implementation an earlier test in the file happened
    // to leave behind, which is not a real assertion, just accidental
    // leakage.
    vi.mocked(feltSegmentsRepo.createFeltSegment)
      .mockResolvedValueOnce({
        id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 }, polarityA: null, polarityB: null, createdAt: '2026-08-10T10:00:00Z',
      })
      .mockResolvedValueOnce({
        id: 'fs2', planId: 'p1', networkName: 'Hartmann', pointA: { x: 5, y: 6 }, pointB: { x: 7, y: 6 }, polarityA: null, polarityB: null, createdAt: '2026-08-10T10:01:00Z',
      })
      .mockResolvedValueOnce({
        id: 'fs3', planId: 'p1', networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 }, polarityA: null, polarityB: null, createdAt: '2026-08-10T10:02:00Z',
      })

    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)
    fireEvent.click(await screen.findByText('simulate-map-click'))
    await waitFor(() => expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /inverser l'orientation/i }))

    // create-then-delete: the 2nd create (-> fs2) must land before 'fs1' is deleted.
    await waitFor(() => expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(feltSegmentsRepo.deleteFeltSegment).toHaveBeenCalledWith('fs1'))
    expect(rodPhotoCalibration.deriveRotation).toHaveBeenNthCalledWith(2, pixelSegments, true)

    fireEvent.click(screen.getByRole('button', { name: /inverser l'orientation/i }))

    // create-then-delete: the 3rd create (-> fs3) must land before 'fs2' is deleted.
    await waitFor(() => expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(feltSegmentsRepo.deleteFeltSegment).toHaveBeenCalledWith('fs2'))
    expect(rodPhotoCalibration.deriveRotation).toHaveBeenNthCalledWith(3, pixelSegments, false)
  })

  it('surfaces a repo error (e.g. offline write failure) via role="alert" without crashing', async () => {
    stubDetectionPipeline()
    vi.mocked(rodPhotoCalibration.deriveScale).mockReturnValue(0.02)
    vi.mocked(rodPhotoCalibration.deriveRotation).mockReturnValue(0)
    vi.mocked(rodPhotoCalibration.buildAffineTransform).mockReturnValue({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 })
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({ recognized: [], totalDetected: 0, totalRecognized: 0 })
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [{ networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 } }],
      points: [],
    })
    vi.mocked(feltSegmentsRepo.createFeltSegment).mockRejectedValue(new Error('Hors ligne'))

    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)
    fireEvent.click(await screen.findByText('simulate-map-click'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Hors ligne')
  })

  it('creates a FeltPoint alongside a FeltSegment when the pairing returns a mix of both', async () => {
    stubDetectionPipeline()
    vi.mocked(rodPhotoCalibration.deriveScale).mockReturnValue(0.02)
    vi.mocked(rodPhotoCalibration.deriveRotation).mockReturnValue(0)
    vi.mocked(rodPhotoCalibration.buildAffineTransform).mockReturnValue({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 })
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({ recognized: [], totalDetected: 3, totalRecognized: 3 })
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [{ networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 } }],
      points: [{ markerId: 103, rodNumber: 2, networkName: 'Curry', x: 9, y: 9 }],
    })
    vi.mocked(feltSegmentsRepo.createFeltSegment).mockResolvedValue({
      id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 }, polarityA: null, polarityB: null, createdAt: '2026-08-10T10:00:00Z',
    })
    vi.mocked(feltPointsRepo.createFeltPoint).mockResolvedValue({
      id: 'fp1', planId: 'p1', networkName: 'Curry', x: 9, y: 9, createdAt: '2026-08-10T10:00:00Z',
    })

    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)
    fireEvent.click(await screen.findByText('simulate-map-click'))

    await waitFor(() =>
      expect(feltPointsRepo.createFeltPoint).toHaveBeenCalledWith({
        planId: 'p1', networkName: 'Curry', x: 9, y: 9,
      })
    )
    expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledWith({
      planId: 'p1', networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 },
    })
  })
})

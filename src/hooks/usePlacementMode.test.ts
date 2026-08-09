import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { usePlacementMode } from './usePlacementMode'
import * as phenomenaRepo from '../data/phenomenaRepo'
import * as contextObjectsRepo from '../data/contextObjectsRepo'
import * as freeformNetworksRepo from '../data/freeformNetworksRepo'
import * as feltSegmentsRepo from '../data/feltSegmentsRepo'

vi.mock('../data/phenomenaRepo')
vi.mock('../data/contextObjectsRepo')
vi.mock('../data/freeformNetworksRepo')
vi.mock('../data/feltSegmentsRepo')

const MISSION_ORIGIN = { lat: 48.8566, lng: 2.3522 }
const MAP_CLICK_LATLNG = { lat: 48.8567, lng: 2.3523 }

function setup() {
  const onPhenomenonCreated = vi.fn()
  const onContextObjectCreated = vi.fn()
  const onFreeformNetworkCreated = vi.fn()
  const onFeltSegmentCreated = vi.fn()
  const onError = vi.fn()
  const rendered = renderHook(() =>
    usePlacementMode({
      planId: 'p1',
      missionOrigin: MISSION_ORIGIN,
      onPhenomenonCreated,
      onContextObjectCreated,
      onFreeformNetworkCreated,
      onFeltSegmentCreated,
      onError,
    })
  )
  return { ...rendered, onPhenomenonCreated, onContextObjectCreated, onFreeformNetworkCreated, onFeltSegmentCreated, onError }
}

describe('usePlacementMode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not let an in-progress guide-line placement leak into a grid-origin click, or vice versa', () => {
    const { result } = setup()

    // Arm the guide-line tool ("Placer ici").
    act(() => {
      result.current.startPlacementMode({ kind: 'guide-line' })
    })
    expect(result.current.placementMode).toEqual({ kind: 'guide-line' })

    // Starting grid-origin placement must cancel the guide-line mode instead
    // of letting both be active at once.
    act(() => {
      result.current.handleGridOriginRequested()
    })
    expect(result.current.placementMode).toEqual({ kind: 'grid-origin' })

    // The click should be consumed as the grid origin, not as a guide-line
    // placement.
    act(() => {
      result.current.handleMapClick(MAP_CLICK_LATLNG)
    })
    expect(result.current.pendingGridOrigin).not.toBeNull()
    expect(result.current.guideLineAnchor).toBeNull()
    expect(result.current.placementMode).toBeNull()

    // Simulate a successful grid generation (handleGenerateGrid, which stays
    // in SiteMapView, calls this on success).
    act(() => {
      result.current.clearGridOriginPlacement()
    })

    // Symmetrically: re-arming the guide-line tool after a grid origin is
    // pending must cancel the grid-origin wait, so a subsequent click is
    // consumed as the guide-line anchor.
    act(() => {
      result.current.startPlacementMode({ kind: 'guide-line' })
    })
    act(() => {
      result.current.handleMapClick(MAP_CLICK_LATLNG)
    })
    expect(result.current.guideLineAnchor).not.toBeNull()
  })

  it('clearing an already-placed guide line does not cancel an unrelated pending grid-origin request', () => {
    const { result } = setup()

    // 1. Place a guide line successfully — guideLineAnchor is now set, no
    // mode pending.
    act(() => {
      result.current.startPlacementMode({ kind: 'guide-line' })
    })
    act(() => {
      result.current.handleMapClick(MAP_CLICK_LATLNG)
    })
    expect(result.current.guideLineAnchor).not.toBeNull()

    // 2. Start a grid-origin request — pending, does NOT touch guideLineAnchor.
    act(() => {
      result.current.handleGridOriginRequested()
    })
    expect(result.current.placementMode).toEqual({ kind: 'grid-origin' })

    // 3. Clear the (old, already-placed) guide line.
    act(() => {
      result.current.handleClearGuideLine()
    })
    expect(result.current.guideLineAnchor).toBeNull()

    // 4. The map click should STILL complete the grid-origin placement that
    // was pending before step 3 — proving Effacer didn't silently cancel it.
    expect(result.current.placementMode).toEqual({ kind: 'grid-origin' })
    act(() => {
      result.current.handleMapClick(MAP_CLICK_LATLNG)
    })
    expect(result.current.pendingGridOrigin).not.toBeNull()
  })

  it('routes a map click to the guide-line tool, not grid-origin placement, when "Placer ici" cancels a pending grid-origin request', () => {
    const { result } = setup()

    // Start grid creation — sets placementMode to grid-origin.
    act(() => {
      result.current.handleGridOriginRequested()
    })
    expect(result.current.placementMode).toEqual({ kind: 'grid-origin' })
    const keyAfterGridOriginRequested = result.current.gridCreationKey

    // Arm the guide-line tool instead ("Placer ici") — this must cancel the
    // pending grid-origin request and bump gridCreationKey so
    // GridCreationPanel doesn't keep showing a stale prompt.
    act(() => {
      result.current.startPlacementMode({ kind: 'guide-line' })
    })
    expect(result.current.placementMode).toEqual({ kind: 'guide-line' })
    expect(result.current.gridCreationKey).toBe(keyAfterGridOriginRequested + 1)

    // The click must land on the guide-line tool, not be silently swallowed
    // as a grid origin.
    act(() => {
      result.current.handleMapClick(MAP_CLICK_LATLNG)
    })
    expect(result.current.guideLineAnchor).not.toBeNull()
    expect(result.current.pendingGridOrigin).toBeNull()
  })

  it('places several phenomena of the same kind in a row without needing to reselect the kind', async () => {
    vi.mocked(phenomenaRepo.createPhenomenon)
      .mockResolvedValueOnce({
        id: 'ph1', planId: 'p1', kind: 'spire-vortex', x: 1, y: 1, createdAt: '2026-07-21T10:00:00Z',
      })
      .mockResolvedValueOnce({
        id: 'ph2', planId: 'p1', kind: 'spire-vortex', x: 2, y: 2, createdAt: '2026-07-21T10:01:00Z',
      })

    const { result, onPhenomenonCreated } = setup()

    act(() => {
      result.current.handleSelectPhenomenonKind('spire-vortex')
    })
    expect(result.current.placementMode).toEqual({ kind: 'phenomenon', phenomenonKind: 'spire-vortex' })

    act(() => {
      result.current.handleMapClick(MAP_CLICK_LATLNG)
    })
    await waitFor(() => expect(phenomenaRepo.createPhenomenon).toHaveBeenCalledTimes(1))

    // The kind must still be armed after the first placement — no
    // reselection — proving placementMode survived the click.
    expect(result.current.placementMode).toEqual({ kind: 'phenomenon', phenomenonKind: 'spire-vortex' })

    act(() => {
      result.current.handleMapClick(MAP_CLICK_LATLNG)
    })
    await waitFor(() => expect(phenomenaRepo.createPhenomenon).toHaveBeenCalledTimes(2))

    expect(onPhenomenonCreated).toHaveBeenCalledTimes(2)
    expect(phenomenaRepo.createPhenomenon).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ planId: 'p1', kind: 'spire-vortex' })
    )
    expect(phenomenaRepo.createPhenomenon).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ planId: 'p1', kind: 'spire-vortex' })
    )
  })

  it('places several context objects of the same kind in a row without needing to reselect the kind', async () => {
    vi.mocked(contextObjectsRepo.createContextObject)
      .mockResolvedValueOnce({
        id: 'co1', planId: 'p1', kind: 'arbre-chene', x: 1, y: 1, createdAt: '2026-07-27T10:00:00Z',
      })
      .mockResolvedValueOnce({
        id: 'co2', planId: 'p1', kind: 'arbre-chene', x: 2, y: 2, createdAt: '2026-07-27T10:01:00Z',
      })

    const { result, onContextObjectCreated } = setup()

    act(() => {
      result.current.handleSelectContextObjectKind('arbre-chene')
    })
    expect(result.current.placementMode).toEqual({ kind: 'context-object', contextObjectKind: 'arbre-chene' })

    act(() => {
      result.current.handleMapClick(MAP_CLICK_LATLNG)
    })
    await waitFor(() => expect(contextObjectsRepo.createContextObject).toHaveBeenCalledTimes(1))

    // The kind must still be armed after the first placement — no
    // reselection — proving placementMode survived the click.
    expect(result.current.placementMode).toEqual({ kind: 'context-object', contextObjectKind: 'arbre-chene' })

    act(() => {
      result.current.handleMapClick(MAP_CLICK_LATLNG)
    })
    await waitFor(() => expect(contextObjectsRepo.createContextObject).toHaveBeenCalledTimes(2))

    expect(onContextObjectCreated).toHaveBeenCalledTimes(2)
  })

  it('deselects context-object placement mode when the active kind is selected again', () => {
    const { result } = setup()

    act(() => {
      result.current.handleSelectContextObjectKind('puits')
    })
    expect(result.current.placementMode).toEqual({ kind: 'context-object', contextObjectKind: 'puits' })

    act(() => {
      result.current.handleSelectContextObjectKind(null)
    })
    expect(result.current.placementMode).toBeNull()
  })

  it('surfaces a failed context-object save via onError', async () => {
    vi.mocked(contextObjectsRepo.createContextObject).mockRejectedValue(new Error('network down'))
    const { result, onError } = setup()

    act(() => {
      result.current.handleSelectContextObjectKind('puits')
    })
    act(() => {
      result.current.handleMapClick(MAP_CLICK_LATLNG)
    })

    await waitFor(() => expect(onError).toHaveBeenCalledWith('network down'))
  })

  it('selecting a phenomenon kind while a grid-origin request is pending does not strand GridCreationPanel', () => {
    const { result } = setup()

    // Start grid creation — placementMode is grid-origin, pendingOrigin null.
    act(() => {
      result.current.handleGridOriginRequested()
    })
    expect(result.current.placementMode).toEqual({ kind: 'grid-origin' })
    const keyBefore = result.current.gridCreationKey

    // Instead of a map click, select a phenomenon kind — this must cancel the
    // pending grid-origin request AND bump gridCreationKey, exactly like the
    // guide-line "Placer ici" button.
    act(() => {
      result.current.handleSelectPhenomenonKind('spire-vortex')
    })

    expect(result.current.placementMode).toEqual({ kind: 'phenomenon', phenomenonKind: 'spire-vortex' })
    expect(result.current.gridCreationKey).toBe(keyBefore + 1)
  })

  it('does not let starting another mode silently discard an in-progress freeform drag', () => {
    const { result } = setup()

    // Start a freeform trace — no drag captured yet (pendingFreeformTrace is
    // null), matching FreeformDrawTool's `active` prop being true.
    act(() => {
      result.current.handleStartFreeformTrace('eau')
    })
    expect(result.current.placementMode).toEqual({ kind: 'freeform', freeformKind: 'eau' })

    // Attempt to start phenomenon-placement mode WITHOUT finishing the drag —
    // this must be refused, not silently switch away and discard the
    // in-progress capture.
    act(() => {
      result.current.handleSelectPhenomenonKind('spire-vortex')
    })

    expect(result.current.placementMode).toEqual({ kind: 'freeform', freeformKind: 'eau' })
  })

  it('cancels an armed (not-yet-dragging) freeform mode by clicking its own button again', () => {
    const { result } = setup()

    // Arm freeform mode — no drag has started yet.
    act(() => {
      result.current.handleStartFreeformTrace('eau')
    })
    expect(result.current.placementMode).toEqual({ kind: 'freeform', freeformKind: 'eau' })

    // Clicking the SAME button again must cancel it directly.
    act(() => {
      result.current.handleStartFreeformTrace('eau')
    })
    expect(result.current.placementMode).toBeNull()

    // And starting a DIFFERENT mode now works normally, proving placementMode
    // is genuinely back to null, not stuck.
    act(() => {
      result.current.handleSelectPhenomenonKind('spire-vortex')
    })
    expect(result.current.placementMode).toEqual({ kind: 'phenomenon', phenomenonKind: 'spire-vortex' })
  })

  it('does not let re-clicking the same freeform kind while its own metadata form is open corrupt the pending trace', async () => {
    // Regression test for the fix landed alongside Task 3 in commit
    // a24e676: handleStartFreeformTrace's self-cancel branch used to fire
    // whenever placementMode still matched the clicked kind — which is ALSO
    // true while the metadata form is showing (placementMode stays
    // 'freeform' until the form is submitted/cancelled). Re-clicking the same
    // freeform button in that state used to null out placementMode while
    // leaving pendingFreeformTrace (and the form) untouched.
    vi.mocked(freeformNetworksRepo.createFreeformNetwork).mockResolvedValue({
      id: 'fn1', planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      currentBearingDeg: null, depthM: null, flowRate: null, createdAt: '2026-07-21T10:00:00Z',
    })

    const { result } = setup()

    act(() => {
      result.current.handleStartFreeformTrace('eau')
    })
    act(() => {
      result.current.handleFreeformTraceComplete([{ x: 0, y: 0 }, { x: 1, y: 1 }])
    })
    expect(result.current.pendingFreeformTrace).toEqual({ kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })

    // Re-clicking "Tracer l'eau" while the form is open must NOT corrupt the
    // pending trace or the placement mode.
    act(() => {
      result.current.handleStartFreeformTrace('eau')
    })
    expect(result.current.pendingFreeformTrace).toEqual({ kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })
    expect(result.current.placementMode).toEqual({ kind: 'freeform', freeformKind: 'eau' })

    // Submitting now must save the ORIGINAL captured kind ('eau'), proving
    // pendingFreeformTrace was never corrupted or cleared by the re-click.
    await act(async () => {
      await result.current.handleSubmitFreeformMetadata({ currentBearingDeg: null, depthM: null, flowRate: null })
    })

    expect(freeformNetworksRepo.createFreeformNetwork).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })
    )
  })

  it('does not strand GridCreationPanel when starting grid-origin placement is refused because freeform is armed', () => {
    // Regression test for the fix landed alongside Task 3 in commit
    // a24e676: startPlacementMode's freeform-drag guard correctly refuses to
    // switch placementMode away from an armed 'freeform' mode, but
    // handleGridOriginRequested must still bump gridCreationKey on that
    // refused path so GridCreationPanel doesn't strand.
    const { result } = setup()

    // Arm freeform (merely being armed, pendingFreeformTrace === null, is
    // enough to trigger the guard).
    act(() => {
      result.current.handleStartFreeformTrace('eau')
    })
    expect(result.current.placementMode).toEqual({ kind: 'freeform', freeformKind: 'eau' })
    const keyBefore = result.current.gridCreationKey

    // Attempt to start grid-origin placement while freeform is armed.
    act(() => {
      result.current.handleGridOriginRequested()
    })

    // The refused switch must not have disturbed the still-armed freeform
    // mode...
    expect(result.current.placementMode).toEqual({ kind: 'freeform', freeformKind: 'eau' })
    // ...but gridCreationKey must still bump so GridCreationPanel resets
    // instead of stranding on "Cliquez l'origine sur la carte".
    expect(result.current.gridCreationKey).toBe(keyBefore + 1)
  })

  it('keeps freeformSaveError and pendingFreeformTrace across a failed save, clearing both on a successful retry', async () => {
    vi.mocked(freeformNetworksRepo.createFreeformNetwork)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        id: 'fn1', planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        currentBearingDeg: null, depthM: null, flowRate: null, createdAt: '2026-07-21T10:00:00Z',
      })

    const { result, onFreeformNetworkCreated } = setup()

    act(() => {
      result.current.handleStartFreeformTrace('eau')
    })
    act(() => {
      result.current.handleFreeformTraceComplete([{ x: 0, y: 0 }, { x: 1, y: 1 }])
    })

    // First submit attempt fails.
    await act(async () => {
      await result.current.handleSubmitFreeformMetadata({ currentBearingDeg: null, depthM: null, flowRate: null })
    })
    expect(freeformNetworksRepo.createFreeformNetwork).toHaveBeenCalledTimes(1)
    expect(result.current.freeformSaveError).toBe('network down')
    // The trace must NOT be discarded on failure — the user can retry.
    expect(result.current.pendingFreeformTrace).toEqual({ kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })

    // Retry, without redrawing.
    await act(async () => {
      await result.current.handleSubmitFreeformMetadata({ currentBearingDeg: null, depthM: null, flowRate: null })
    })
    expect(freeformNetworksRepo.createFreeformNetwork).toHaveBeenCalledTimes(2)
    expect(freeformNetworksRepo.createFreeformNetwork).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ planId: 'p1', kind: 'eau', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })
    )

    // Second attempt succeeds — both clear now.
    expect(result.current.freeformSaveError).toBeNull()
    expect(result.current.pendingFreeformTrace).toBeNull()
    expect(result.current.placementMode).toBeNull()
    expect(onFreeformNetworkCreated).toHaveBeenCalledTimes(1)
  })

  it('arms felt-point mode with a default bearing (first of the network\'s family) when a network is selected', () => {
    const { result } = setup()
    act(() => result.current.handleSelectFeltPointNetwork('Hartmann'))
    expect(result.current.placementMode).toEqual({ kind: 'felt-point', networkName: 'Hartmann', bearingDeg: 0 })
  })

  it('falls back to the default [0, 90] family for a custom (non-family) network name', () => {
    const { result } = setup()
    act(() => result.current.handleSelectFeltPointNetwork('Réseau X'))
    expect(result.current.placementMode).toEqual({ kind: 'felt-point', networkName: 'Réseau X', bearingDeg: 0 })
  })

  it('lets the armed bearing be changed via handleSelectFeltPointBearing', () => {
    const { result } = setup()
    act(() => result.current.handleSelectFeltPointNetwork('Hartmann'))
    act(() => result.current.handleSelectFeltPointBearing(90))
    expect(result.current.placementMode).toEqual({ kind: 'felt-point', networkName: 'Hartmann', bearingDeg: 90 })
  })

  it('selecting the same felt-point network again deselects it', () => {
    const { result } = setup()
    act(() => result.current.handleSelectFeltPointNetwork('Curry'))
    act(() => result.current.handleSelectFeltPointNetwork('Curry'))
    expect(result.current.placementMode).toBeNull()
  })

  it('a map click while felt-point mode is armed saves a 1m segment immediately (centered on the click, along the armed bearing), with no polarity — mirrors auto-detected segments so both render identically', async () => {
    vi.mocked(feltSegmentsRepo.createFeltSegment).mockResolvedValue({
      id: 'fs1', planId: 'p1', networkName: 'Hartmann',
      pointA: { x: 0, y: -0.5 }, pointB: { x: 0, y: 0.5 },
      polarityA: null, polarityB: null, createdAt: '2026-07-22T10:00:00Z',
    })
    const { result, onFeltSegmentCreated } = setup()
    act(() => result.current.handleSelectFeltPointNetwork('Hartmann')) // bearingDeg 0 (N/S)

    act(() => result.current.handleMapClick(MAP_CLICK_LATLNG))
    await waitFor(() => expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledTimes(1))
    const call = vi.mocked(feltSegmentsRepo.createFeltSegment).mock.calls[0][0]
    expect(call.planId).toBe('p1')
    expect(call.networkName).toBe('Hartmann')
    expect(call.polarityA).toBeUndefined()
    expect(call.polarityB).toBeUndefined()
    // Bearing 0 (N/S) — the segment runs along y, centered on the clicked
    // point, 1m total length (0.5m each side); x is unchanged.
    expect(call.pointA.x).toBeCloseTo(call.pointB.x, 6)
    expect(Math.abs(call.pointA.y - call.pointB.y)).toBeCloseTo(1, 6)
    expect(onFeltSegmentCreated).toHaveBeenCalledWith(expect.objectContaining({ networkName: 'Hartmann' }))
    // Placement mode stays armed — mirrors handlePlacePhenomenon/
    // handlePlaceContextObject, so several segments of the same network can
    // be placed in a row without re-selecting.
    expect(result.current.placementMode).toEqual({ kind: 'felt-point', networkName: 'Hartmann', bearingDeg: 0 })
  })

  it('routes a failed segment save through its own dismissible feltSegmentSaveError, not the global onError', async () => {
    vi.mocked(feltSegmentsRepo.createFeltSegment).mockRejectedValue(new Error('network down'))
    const { result, onError } = setup()
    act(() => result.current.handleSelectFeltPointNetwork('Hartmann'))

    act(() => result.current.handleMapClick(MAP_CLICK_LATLNG))
    await waitFor(() => expect(result.current.feltSegmentSaveError).toBe('network down'))

    expect(onError).not.toHaveBeenCalled()
  })
})

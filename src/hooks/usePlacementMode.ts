import { useCallback, useState } from 'react'
import { createPhenomenon } from '../data/phenomenaRepo'
import { createContextObject } from '../data/contextObjectsRepo'
import { createFreeformNetwork } from '../data/freeformNetworksRepo'
import { createFeltSegment } from '../data/feltSegmentsRepo'
import { allowedBearingsForNetwork } from '../domain/networkBearings'
import { computeGuideLineEndpoints } from '../geometry/guideLine'
import type { FreeformMetadata } from '../components/FreeformMetadataForm'
import type {
  Point, PhenomenonKind, Phenomenon, ContextObjectKind, ContextObject,
  FreeformNetworkKind, FreeformNetwork, FeltSegment, GridLinePolarity,
} from '../domain/types'
import { latLngToLocal, type LatLng } from '../geometry/localCoordinates'

// Segment length placed for a network felt point (spec: "une ligne (1M)") —
// half on each side of the clicked center point.
const FELT_SEGMENT_HALF_LENGTH_M = 0.5
// Same fallback family FeltPointPicker uses for a custom ("Autre") network
// with no known bearing family.
const DEFAULT_BEARING_FAMILY: [number, number] = [0, 90]

// Discriminated union for the single map-click "mode" that's currently
// active. Grid-origin placement, guide-line placement, phenomenon placement
// and freeform-trace placement all want MapView's single onMapClick slot, so
// only one can be active at a time; the union makes that structurally true
// instead of manually enforced across independent booleans. See
// startPlacementMode below for the single entry point that enforces this.
export type PlacementMode =
  | { kind: 'grid-origin' }
  | { kind: 'guide-line' }
  | { kind: 'phenomenon'; phenomenonKind: PhenomenonKind }
  | { kind: 'context-object'; contextObjectKind: ContextObjectKind }
  | { kind: 'freeform'; freeformKind: FreeformNetworkKind }
  | { kind: 'felt-point'; networkName: string; bearingDeg: number }
  | null

export interface UsePlacementModeArgs {
  planId: string
  missionOrigin: LatLng
  onPhenomenonCreated: (phenomenon: Phenomenon) => void
  onContextObjectCreated: (contextObject: ContextObject) => void
  onFreeformNetworkCreated: (network: FreeformNetwork) => void
  onFeltSegmentCreated: (feltSegment: FeltSegment) => void
  // Only for handlePlacePhenomenon's failure path (a real load/action failure
  // with no better place to go) — NOT for handleSubmitFreeformMetadata's or
  // handleSubmitFeltSegmentPolarity's failure paths, which use their own
  // internal dismissible error state instead (freeformSaveError /
  // feltSegmentSaveError) so a failed optional/retryable save never blanks
  // the whole map.
  onError: (message: string) => void
}

export function usePlacementMode({
  planId,
  missionOrigin,
  onPhenomenonCreated,
  onContextObjectCreated,
  onFreeformNetworkCreated,
  onFeltSegmentCreated,
  onError,
}: UsePlacementModeArgs) {
  const [placementMode, setPlacementMode] = useState<PlacementMode>(null)
  const [pendingGridOrigin, setPendingGridOrigin] = useState<Point | null>(null)
  const [guideLineAnchor, setGuideLineAnchor] = useState<Point | null>(null)
  const [guideLineBearing, setGuideLineBearing] = useState<number | null>(null)
  const [customBearingInput, setCustomBearingInput] = useState('')
  // Bumped (via the GridCreationPanel `key` prop, in SiteMapView) whenever
  // the panel's own internal step-machine state (expanded/template/polarity)
  // needs to be force-reset from outside: after a successful "Générer" (see
  // clearGridOriginPlacement below), and whenever a mode-start elsewhere
  // cancels a pending grid-origin request or refuses to interrupt an armed
  // freeform mode — otherwise the panel keeps showing a stale "cliquez
  // l'origine" prompt for a click that will never come.
  const [gridCreationKey, setGridCreationKey] = useState(0)
  // Holds the captured (not-yet-saved) points between FreeformDrawTool.onComplete
  // and the metadata form being submitted/cancelled — null means no pending trace.
  const [pendingFreeformTrace, setPendingFreeformTrace] = useState<{ kind: FreeformNetworkKind; points: Point[] } | null>(null)
  // Mirrors SiteMapView's buildingError, same reasoning: a failed
  // freeform-network save is an optional, retryable action, not a fatal load
  // failure, so it must never blank the entire map via the page-blocking
  // `error` state. Dismissible via its own "Fermer" button; also cleared on
  // a successful save or on cancelling the metadata form, so a later new
  // trace doesn't start with a stale error message showing.
  const [freeformSaveError, setFreeformSaveError] = useState<string | null>(null)
  // Holds the computed (not-yet-saved) 1m segment between a felt-point map
  // click and the polarity form being submitted/cancelled — mirrors
  // pendingFreeformTrace's role for the freeform flow exactly.
  const [pendingFeltSegment, setPendingFeltSegment] = useState<{ networkName: string; pointA: Point; pointB: Point } | null>(null)
  // Mirrors freeformSaveError: a failed segment save is optional/retryable
  // (the trace is already computed, only the persistence step failed), so it
  // must never blank the whole map via the page-blocking onError path.
  const [feltSegmentSaveError, setFeltSegmentSaveError] = useState<string | null>(null)

  // Setting placementMode to a new value structurally replaces whatever mode
  // (if any) was previously active — see PlacementMode's doc comment above.
  // Single entry point for "start mode X", used by every "start a mode"
  // control (grid-origin request, guide-line "Placer ici", phenomenon-kind
  // select, freeform trace start). Two things this guarantees that used to be
  // one-off checks copy-pasted per call site (or, for 2 of the 4 call sites,
  // missing entirely):
  //   1. If a freeform drag could currently be in progress (placementMode is
  //      'freeform' AND pendingFreeformTrace is null — i.e. FreeformDrawTool's
  //      `active` prop is currently true), refuse the switch entirely. The
  //      user must finish the gesture (mouseup/touchend, which naturally ends
  //      the drag) before another mode can start — switching away mid-drag
  //      would otherwise silently discard every point captured so far.
  //   2. If a grid-origin request was pending, bump gridCreationKey so
  //      GridCreationPanel doesn't keep showing a stale "cliquez l'origine"
  //      prompt for a click that will now go to the newly-started mode
  //      instead.
  // Returns whether the switch actually happened — callers whose OWN control
  // has independent, uncontrolled internal state that already advanced
  // synchronously before calling in (GridCreationPanel's `template`, set by
  // handleTemplateSelected before onOriginRequested fires — see
  // handleGridOriginRequested below) must check this and reset that state
  // themselves when the switch is refused, since a refusal here means
  // placementMode never actually became the new mode and nothing else will
  // ever satisfy/clear the child's own advanced-but-orphaned step.
  // PhenomenonPicker and the guide-line bearing controls don't need this:
  // PhenomenonPicker is fully controlled (activeKind is derived straight from
  // placementMode, no internal state to strand), and guideLineBearing /
  // customBearingInput are state owned outside placementMode, so a refusal
  // here leaves them unaffected either way.
  function startPlacementMode(mode: PlacementMode): boolean {
    if (placementMode?.kind === 'freeform' && pendingFreeformTrace === null) {
      return false // a freeform drag may be in progress — refuse to interrupt it
    }
    const wasAwaitingGridOrigin = placementMode?.kind === 'grid-origin'
    setPlacementMode(mode)
    if (wasAwaitingGridOrigin) {
      setGridCreationKey((k) => k + 1)
    }
    return true
  }

  function handleGridOriginRequested() {
    const started = startPlacementMode({ kind: 'grid-origin' })
    if (!started) {
      // The freeform-drag guard refused this switch, but GridCreationPanel's
      // own internal step-machine already advanced past "collapsed" (its
      // handleTemplateSelected calls setTemplate before calling this
      // callback) — force it back to collapsed via the same gridCreationKey
      // remount mechanism used elsewhere, so it doesn't strand on "Cliquez
      // l'origine sur la carte" for a mode that was never actually armed.
      setGridCreationKey((k) => k + 1)
      return
    }
    setPendingGridOrigin(null)
  }

  // Arms/disarms phenomenon-placement mode — mirrors handleGridOriginRequested
  // and the guide-line "Placer ici" button's use of startPlacementMode to
  // structurally replace whatever mode was previously active (and refuse to
  // interrupt an in-progress freeform drag). Passing null (PhenomenonPicker's
  // own click-active-kind-again toggle) cancels placement mode entirely —
  // deselecting is NOT routed through startPlacementMode: cancelling out of
  // phenomenon mode can't ever be interrupting a freeform drag (placementMode
  // is 'phenomenon' at that point, not 'freeform'), so there's nothing to
  // guard against — always allow it.
  function handleSelectPhenomenonKind(kind: PhenomenonKind | null) {
    if (kind === null) {
      setPlacementMode(null)
      return
    }
    startPlacementMode({ kind: 'phenomenon', phenomenonKind: kind })
  }

  async function handlePlacePhenomenon(local: Point, kind: PhenomenonKind) {
    try {
      const created = await createPhenomenon({ planId, kind, x: local.x, y: local.y })
      onPhenomenonCreated(created)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    }
  }

  // Mirrors handleSelectPhenomenonKind/handlePlacePhenomenon exactly — a
  // context object has no extra metadata to fill in beyond kind+position, so
  // it saves immediately on click, same as a phenomenon.
  function handleSelectContextObjectKind(kind: ContextObjectKind | null) {
    if (kind === null) {
      setPlacementMode(null)
      return
    }
    startPlacementMode({ kind: 'context-object', contextObjectKind: kind })
  }

  async function handlePlaceContextObject(local: Point, kind: ContextObjectKind) {
    try {
      const created = await createContextObject({ planId, kind, x: local.x, y: local.y })
      onContextObjectCreated(created)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    }
  }

  // Arms/disarms felt-point placement mode — mirrors handleSelectPhenomenonKind:
  // selecting a network arms placement for the next map click; selecting the
  // already-armed network again (or passing null, e.g. FeltPointPicker's own
  // click-active-network-again toggle) cancels it directly. Deselecting is NOT
  // routed through startPlacementMode for the same reason as
  // handleSelectPhenomenonKind: cancelling out of felt-point mode can't ever
  // be interrupting a freeform drag (placementMode is 'felt-point' at that
  // point, not 'freeform'), so there's nothing to guard against.
  //
  // Arms with a default bearing — the first of the network's known angle
  // family (allowedBearingsForNetwork), or [0, 90] for a custom network with
  // no known family — so a map click is always immediately valid; the user
  // can still switch it via handleSelectFeltPointBearing before clicking.
  function handleSelectFeltPointNetwork(networkName: string | null) {
    if (networkName === null) {
      setPlacementMode(null)
      return
    }
    if (placementMode?.kind === 'felt-point' && placementMode.networkName === networkName) {
      setPlacementMode(null)
      return
    }
    const [defaultBearing] = allowedBearingsForNetwork(networkName) ?? DEFAULT_BEARING_FAMILY
    startPlacementMode({ kind: 'felt-point', networkName, bearingDeg: defaultBearing })
  }

  // Switches the orientation of the segment about to be placed, without
  // otherwise disturbing placement mode — only meaningful while 'felt-point'
  // is already armed (FeltPointPicker only renders these buttons then).
  function handleSelectFeltPointBearing(bearingDeg: number) {
    if (placementMode?.kind !== 'felt-point') return
    setPlacementMode({ ...placementMode, bearingDeg })
  }

  async function handleSubmitFeltSegmentPolarity(polarityA: GridLinePolarity, polarityB: GridLinePolarity) {
    if (!pendingFeltSegment) return
    try {
      const created = await createFeltSegment({
        planId,
        networkName: pendingFeltSegment.networkName,
        pointA: pendingFeltSegment.pointA,
        pointB: pendingFeltSegment.pointB,
        polarityA,
        polarityB,
      })
      onFeltSegmentCreated(created)
      // Only clear on SUCCESS — a failed save must leave the pending segment
      // and the polarity form alone so the user can retry without re-clicking
      // the map (same reasoning as handleSubmitFreeformMetadata).
      setPendingFeltSegment(null)
      setPlacementMode(null)
      setFeltSegmentSaveError(null)
    } catch (err) {
      setFeltSegmentSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleCancelFeltSegment() {
    // Nothing was persisted yet at this point (creation only happens on
    // submit), so discarding the pending state is enough — no delete call
    // needed, same as handleCancelFreeformMetadata.
    setPendingFeltSegment(null)
    setPlacementMode(null)
    setFeltSegmentSaveError(null)
  }

  // A toggle, mirroring PhenomenonPicker's own "click the active kind again
  // to deselect" pattern: clicking the kind that's ALREADY armed AND genuinely
  // idle (no drag captured yet, pendingFreeformTrace === null) cancels it
  // directly — a deliberate self-cancel, safe in that specific state since the
  // user is explicitly targeting the freeform tool itself, not switching to
  // something unrelated.
  //
  // The `pendingFreeformTrace === null` check is required, not incidental:
  // placementMode.kind stays 'freeform' (and freeformKind stays the captured
  // kind) for as long as the metadata form is open too — see
  // handleFreeformTraceComplete's comment ("placementMode stays 'freeform' so
  // FreeformDrawTool.active goes false... until the form is
  // submitted/cancelled"). Without this check, re-clicking the SAME trace
  // button while its own metadata form is showing would self-cancel by
  // setting placementMode to null while leaving pendingFreeformTrace (and the
  // form) untouched — silently un-blocking the OTHER freeform button (whose
  // disabled condition only looks at placementMode) to arm a different kind,
  // and a subsequent submit would then save the still-pending trace under the
  // ORIGINAL kind while the UI implied the new one had just been armed. The
  // buttons' own `disabled` props (in SiteMapView) additionally hard-disable
  // BOTH freeform buttons whenever a trace is pending, so in practice this
  // branch only needs to handle the armed-but-not-yet-dragging case — but the
  // guard is kept here too so this function stays correct even if that
  // disabled condition ever changes independently.
  //
  // Clicking a NEW kind (or the same kind while a DIFFERENT mode is active,
  // or while a trace is pending) still goes through startPlacementMode, which
  // correctly refuses to interrupt an in-progress drag when switching AWAY to
  // something else.
  function handleStartFreeformTrace(kind: FreeformNetworkKind) {
    if (placementMode?.kind === 'freeform' && placementMode.freeformKind === kind && pendingFreeformTrace === null) {
      setPlacementMode(null)
      return
    }
    startPlacementMode({ kind: 'freeform', freeformKind: kind })
  }

  // useCallback is required here, not just tidiness: FreeformDrawTool's effect
  // depends on this function reference to know when to rebind its native
  // listeners. An inline/unmemoized function would be a fresh reference on
  // every render, forcing FreeformDrawTool to tear down and rebuild all its
  // DOM listeners on every unrelated re-render, including mid-drag.
  // placementMode is read via its .kind/.freeformKind fields inside the
  // callback, but since placementMode itself can legitimately change between
  // drags (that's the point of the check on the next line), it stays in the
  // dependency array — this callback is only unstable across renders where
  // placementMode changes, which is fine since a drag can't be in progress
  // across a placementMode change anyway.
  const handleFreeformTraceComplete = useCallback(
    (points: Point[]) => {
      if (placementMode?.kind !== 'freeform') return
      // Capture is done — hand off to the metadata form rather than saving
      // immediately. placementMode stays 'freeform' so FreeformDrawTool.active
      // goes false (draw finished) while the map still knows a freeform flow
      // is in progress, until the form is submitted/cancelled.
      setPendingFreeformTrace({ kind: placementMode.freeformKind, points })
    },
    [placementMode]
  )

  async function handleSubmitFreeformMetadata(metadata: FreeformMetadata) {
    if (!pendingFreeformTrace) return
    try {
      const created = await createFreeformNetwork({
        planId,
        kind: pendingFreeformTrace.kind,
        points: pendingFreeformTrace.points,
        ...metadata,
      })
      onFreeformNetworkCreated(created)
      // Only clear the pending trace / exit placement mode / clear any stale
      // error on SUCCESS — a failed save must leave the trace and the form
      // alone so the user can retry without redrawing from scratch.
      setPendingFreeformTrace(null)
      setPlacementMode(null)
      setFreeformSaveError(null)
    } catch (err) {
      // Routed through freeformSaveError, NOT the page-blocking onError —
      // this is an optional, retryable action, not a fatal load failure; the
      // map/form/everything else must stay usable.
      setFreeformSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleCancelFreeformMetadata() {
    // A cancelled trace must leave no orphaned FreeformNetwork — since
    // nothing was persisted yet at this point (creation only happens on
    // submit), simply discarding the pending state is enough, no delete call
    // needed.
    setPendingFreeformTrace(null)
    setPlacementMode(null)
    setFreeformSaveError(null)
  }

  // Single MapView onMapClick dispatcher: dispatches by whichever mode is
  // active. Since placementMode is a single discriminated union,
  // "grid-origin", "guide-line" and "phenomenon" are structurally mutually
  // exclusive at every point in time, not just in the common case.
  function handleMapClick(latlng: { lat: number; lng: number }) {
    if (placementMode?.kind === 'grid-origin') {
      setPendingGridOrigin(latLngToLocal(latlng, missionOrigin))
      setPlacementMode(null)
      return
    }
    if (placementMode?.kind === 'guide-line') {
      setGuideLineAnchor(latLngToLocal(latlng, missionOrigin))
      setPlacementMode(null)
      return
    }
    if (placementMode?.kind === 'phenomenon') {
      const local = latLngToLocal(latlng, missionOrigin)
      handlePlacePhenomenon(local, placementMode.phenomenonKind)
      // Deliberately does NOT clear placementMode — placing several phenomena
      // of the same kind in a row (e.g. multiple telluric chimneys along a
      // wall) shouldn't require re-selecting the kind after every single
      // click. Laurent explicitly deselects via PhenomenonPicker (clicking
      // the active kind again) or by selecting a different kind.
    }
    if (placementMode?.kind === 'context-object') {
      const local = latLngToLocal(latlng, missionOrigin)
      handlePlaceContextObject(local, placementMode.contextObjectKind)
      // Same reasoning as phenomenon above: placing several trees/fence
      // posts in a row along a boundary shouldn't require re-selecting.
    }
    if (placementMode?.kind === 'felt-point') {
      // Hand off to the polarity form rather than saving immediately —
      // mirrors handleFreeformTraceComplete. placementMode deliberately
      // stays 'felt-point' so FeltPointPicker keeps showing the armed
      // network/bearing while the form is open, until it's
      // submitted/cancelled.
      const local = latLngToLocal(latlng, missionOrigin)
      const [pointA, pointB] = computeGuideLineEndpoints(local, placementMode.bearingDeg, FELT_SEGMENT_HALF_LENGTH_M)
      setPendingFeltSegment({ networkName: placementMode.networkName, pointA, pointB })
    }
  }

  function handleClearGuideLine() {
    // Reset the placed guide line and its bearing, so the practitioner starts
    // clean rather than keeping a stale bearing selected with no line shown.
    // Deliberately does NOT unconditionally clear placementMode: an unrelated
    // PENDING grid-origin request started after this guide line was placed
    // must survive "Effacer" — only cancel placementMode if it's currently
    // the guide-line mode itself (e.g. a re-armed "Placer ici" that hasn't
    // yet received its map click).
    setGuideLineAnchor(null)
    setGuideLineBearing(null)
    if (placementMode?.kind === 'guide-line') {
      setPlacementMode(null)
    }
    setCustomBearingInput('')
  }

  function handleValidateCustomBearing() {
    const parsed = Number(customBearingInput)
    if (customBearingInput.trim() !== '' && !Number.isNaN(parsed)) {
      setGuideLineBearing(parsed)
    }
  }

  // Called by SiteMapView's handleGenerateGrid after a successful grid
  // creation — grid CREATION itself isn't moved here (createGridForPlan and
  // the instances/lines state it produces are data-fetching/display
  // concerns, not placement-mode concerns), but its placement-mode cleanup
  // is exposed here for SiteMapView to call.
  function clearGridOriginPlacement() {
    setPlacementMode(null)
    setPendingGridOrigin(null)
    // Force-remount GridCreationPanel so its own expanded/template state
    // resets to "collapsed" — otherwise the panel's derived step would fall
    // back to "awaiting-origin" and permanently show a stale prompt (see
    // gridCreationKey's doc comment above).
    setGridCreationKey((k) => k + 1)
  }

  return {
    placementMode,
    pendingGridOrigin,
    guideLineAnchor,
    guideLineBearing,
    customBearingInput,
    gridCreationKey,
    pendingFreeformTrace,
    freeformSaveError,
    pendingFeltSegment,
    feltSegmentSaveError,
    setFreeformSaveError,
    setFeltSegmentSaveError,
    setCustomBearingInput,
    setGuideLineBearing,
    startPlacementMode,
    handleGridOriginRequested,
    handleMapClick,
    handleClearGuideLine,
    handleValidateCustomBearing,
    handleSelectPhenomenonKind,
    handleSelectContextObjectKind,
    handleSelectFeltPointNetwork,
    handleSelectFeltPointBearing,
    handleSubmitFeltSegmentPolarity,
    handleCancelFeltSegment,
    handleStartFreeformTrace,
    handleFreeformTraceComplete,
    handleSubmitFreeformMetadata,
    handleCancelFreeformMetadata,
    clearGridOriginPlacement,
  }
}

import { Fragment, useEffect, useMemo, useState } from 'react'
import type { LatLngBoundsExpression } from 'leaflet'
import { MapView } from './MapView'
import { NetworkLinesLayer } from './NetworkLinesLayer'
import { EditableNetworkLine } from './EditableNetworkLine'
import { FeltPointsLayer } from './FeltPointsLayer'
import { FeltSegmentsLayer } from './FeltSegmentsLayer'
import { CalibratedPlanOverlay } from './CalibratedPlanOverlay'
import { GuideLineLayer } from './GuideLineLayer'
import { OrthogonalitySuggestion } from './OrthogonalitySuggestion'
import {
  LayerPanel,
  FELT_POINTS_LAYER_ID,
  FELT_SEGMENTS_LAYER_ID,
  BAGUA_LAYER_ID,
  PATHOGENIC_CROSSINGS_LAYER_ID,
  PHENOMENA_LAYER_ID,
  FREEFORM_NETWORK_LAYER_ID,
  INTERIOR_PLAN_LAYER_ID,
  CONTEXT_OBJECTS_LAYER_ID,
  DEFAULT_VISIBLE_LAYER_IDS,
  type LayerEntry,
} from './LayerPanel'
import { GridCreationPanel } from './GridCreationPanel'
import { OverlayPanel } from './OverlayPanel'
import { Sidebar } from './Sidebar'
import { CompassIndicator } from './CompassIndicator'
import { BuildingFootprintPicker } from './BuildingFootprintPicker'
import { BaguaLayer } from './BaguaLayer'
import { PathogenicCrossingsLayer } from './PathogenicCrossingsLayer'
import { PhenomenonPicker } from './PhenomenonPicker'
import { ContextObjectPicker } from './ContextObjectPicker'
import { ContextObjectsLayer } from './ContextObjectsLayer'
import { FeltPointPicker } from './FeltPointPicker'
import { FeltSegmentPolarityForm } from './FeltSegmentPolarityForm'
import { PhenomenaLayer } from './PhenomenaLayer'
import { FreeformDrawTool } from './FreeformDrawTool'
import { FreeformNetworkLayer } from './FreeformNetworkLayer'
import { FreeformMetadataForm } from './FreeformMetadataForm'
import { usePlacementMode } from '../hooks/usePlacementMode'
import { computeHartmannCurryCrossings } from '../geometry/pathogenicCrossings'
import { listGridInstancesForPlan, updateGridInstanceOrigin } from '../data/gridInstancesRepo'
import { listGridLinesForInstance, updateAdjustedPoints, updateLinePoints } from '../data/gridLinesRepo'
import { listFeltPointsForPlan } from '../data/feltPointsRepo'
import { listFeltSegmentsForPlan } from '../data/feltSegmentsRepo'
import { listPlansForMission } from '../data/plansRepo'
import { listGridTemplates } from '../data/gridTemplatesRepo'
import { createGridForPlan } from '../domain/createGridForPlan'
import { fetchBuildingsInBounds, type BuildingFootprint } from '../data/buildingFootprintService'
import { setBuildingFootprint } from '../data/missionsRepo'
import { listPhenomenaForPlan } from '../data/phenomenaRepo'
import { listContextObjectsForPlan } from '../data/contextObjectsRepo'
import { listFreeformNetworksForPlan } from '../data/freeformNetworksRepo'
import { baguaCorrespondences } from '../domain/baguaCorrespondences'
import { resolveNetworkColor } from '../domain/networkColors'
import { allowedBearingsForNetwork } from '../domain/networkBearings'
import { COMPASS_ORDER } from '../geometry/bagua'
import type {
  GridInstance,
  GridLine,
  FeltPoint,
  FeltSegment,
  Point,
  GridTemplate,
  GridLinePolarity,
  Phenomenon,
  ContextObject,
  FreeformNetwork,
  Plan,
} from '../domain/types'
import { latLngToLocal, type LatLng } from '../geometry/localCoordinates'
import { boundsAround } from '../geometry/boundsAround'
import { resetToTheoretical, translateGridLine } from '../geometry/lineEditing'
import { getOrthogonalitySuggestion } from '../geometry/orthogonality'
import { intersectSegmentLines } from '../geometry/segmentIntersection'

// Collapsed-by-default legend (spec §6: "repliée par défaut") for the Bagua
// layer's static object-correspondence table. Kept minimal/local to this file
// since nothing else reuses it.
function BaguaLegendCollapsed() {
  const [expanded, setExpanded] = useState(false)
  return (
    <div>
      <p>Bagua : 8 secteurs — voir détails</p>
      <button onClick={() => setExpanded((v) => !v)}>Détails</button>
      {expanded && (
        <table>
          <tbody>
            {COMPASS_ORDER.map((direction) => {
              const correspondence = baguaCorrespondences[direction]
              return (
                <tr key={direction}>
                  <td>{direction}</td>
                  <td>{correspondence.label}</td>
                  <td>{correspondence.element}</td>
                  <td>{correspondence.correctiveObjects.join(', ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export interface SiteMapViewProps {
  planId: string
  missionId: string
  missionOrigin: LatLng
  initialBuildingFootprint: Point[] | null
  /** When set, the map fits to these bounds once on mount (e.g. right after parcel selection) instead of just centering on missionOrigin. */
  fitBounds?: LatLngBoundsExpression
  /** Bumped by MissionWorkspace (as UndoRedoControls's onChanged, since that
   * component now lives in Toolbar, outside this component) to re-trigger the
   * mount effect's loadAll() without needing planId itself to change. */
  reloadKey?: number
}

// Fixed search radius around the mission origin, mirroring
// DEFAULT_GRID_RADIUS_M's role in createGridForPlan.ts. Now that a
// parcel-selection step exists (MissionWorkspace's 'selecting-parcels'
// phase), building-footprint search still centers on the origin rather than
// the selected parcels — the building lookup runs independently and earlier
// in the flow conceptually, and widening its scope to "search within the
// selected parcels" is a separate enhancement, not needed for parcel
// selection itself to work.
const BUILDING_SEARCH_RADIUS_M = 100
const BUILDING_SEARCH_WIDENED_RADIUS_M = 300

// GridCreationPanel (unlike LayerPanel) renders bare buttons/paragraphs with
// no chrome of its own, since GridCreationPanel.tsx is shared with its own
// unit tests that don't care about styling. This wrapper gives it the same
// white-card look as every other overlay panel in this file.
const GRID_CREATION_WRAPPER_STYLE = {
  background: 'white',
  padding: 8,
  borderRadius: 4,
}

// OverlayPanel (see OverlayPanel.tsx) only positions/stacks a corner — it
// doesn't give its children a white-card look, matching LayerPanel's own
// PANEL_STYLE and GRID_CREATION_WRAPPER_STYLE above, both of which supply
// their own chrome. The guide-line controls, edit-mode controls, and
// orthogonality-review panel below have no chrome of their own (they used to
// get it "for free" from the *_STYLE constants this task removed), so each
// needs this same wrapper.
const CARD_CHROME_STYLE = {
  background: 'white',
  padding: 8,
  borderRadius: 4,
}

export function SiteMapView({ planId, missionId, missionOrigin, initialBuildingFootprint, fitBounds, reloadKey }: SiteMapViewProps) {
  const [instances, setInstances] = useState<GridInstance[]>([])
  const [linesByInstance, setLinesByInstance] = useState<Record<string, GridLine[]>>({})
  const [feltPoints, setFeltPoints] = useState<FeltPoint[]>([])
  const [feltSegments, setFeltSegments] = useState<FeltSegment[]>([])
  const [phenomena, setPhenomena] = useState<Phenomenon[]>([])
  const [contextObjects, setContextObjects] = useState<ContextObject[]>([])
  const [freeformNetworks, setFreeformNetworks] = useState<FreeformNetwork[]>([])
  const [templates, setTemplates] = useState<GridTemplate[]>([])
  const [interiorPlan, setInteriorPlan] = useState<Plan | null>(null)
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  // Single global edit-mode toggle (not per-layer) — Laurent works on one
  // network at a time in the field, so whichever grid layer is currently
  // visible becomes editable; see the bottom-left OverlayPanel usage below.
  const [editMode, setEditMode] = useState(false)
  // Grid recalibration ("caler sur un croisement de 2 tiges"): armed like
  // editMode (one global toggle, acts on whichever grid layer is currently
  // visible — same "one network at a time in the field" convention).
  // Clicking 2 already-placed FeltSegments on the map computes their
  // theoretical crossing and rigidly translates the whole grid instance onto
  // it, keeping the template's spacing/angle unchanged.
  const [calibrating, setCalibrating] = useState(false)
  const [calibrationPicks, setCalibrationPicks] = useState<FeltSegment[]>([])
  const [calibrationError, setCalibrationError] = useState<string | null>(null)
  // Tracks the line most recently touched by a drag/reset, so the
  // "Réinitialiser" button knows which instance/line to act on without a
  // per-line picker UI (not specified by the plan; kept minimal). Undo is
  // now handled globally by UndoRedoControls, not by this local tracking.
  const [lastChangedLine, setLastChangedLine] = useState<{ instanceId: string; lineId: string } | null>(null)
  // Set to a GridLine id right after it's adjusted (drag or reset), so the
  // orthogonality-assist panel (bottom-right OverlayPanel, below)
  // knows which line to preview/offer straightening for. Cleared on accept
  // or dismiss.
  const [awaitingOrthogonalityReview, setAwaitingOrthogonalityReview] = useState<string | null>(null)
  const [buildingFootprint, setBuildingFootprintState] = useState<Point[] | null>(initialBuildingFootprint)
  const [buildingCandidates, setBuildingCandidates] = useState<BuildingFootprint[]>([])
  const [buildingSearchExhausted, setBuildingSearchExhausted] = useState(false)
  // Building/Bagua errors are deliberately NOT routed into `error` above:
  // that state replaces the ENTIRE map with a paragraph, while the building
  // footprint flow is optional by spec — "le Bagua reste simplement
  // indisponible pour cette mission, pas de blocage du reste du relevé"
  // (Bagua design spec §7). An IGN outage or a failed setBuildingFootprint
  // save must leave grids, felt points and editing fully usable, so these
  // errors render as a dismissible card in the top-left stack instead.
  const [buildingError, setBuildingError] = useState<string | null>(null)
  // Bumped by the error card's "Réessayer" button to re-fire the fetch effect
  // below — after a failed fetch its other deps are unchanged (origin same,
  // footprint still null), so without this there'd be no way to retry short
  // of reloading the page (field networks are flaky; spec §7 makes the flow
  // optional, not unrecoverable).
  const [buildingFetchNonce, setBuildingFetchNonce] = useState(0)

  const {
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
    handleStartFreeformTrace,
    handleFreeformTraceComplete,
    handleSubmitFreeformMetadata,
    handleCancelFreeformMetadata,
    clearGridOriginPlacement,
    handleSelectFeltPointNetwork,
    handleSelectFeltPointBearing,
    handleSubmitFeltSegmentPolarity,
    handleCancelFeltSegment,
  } = usePlacementMode({
    planId,
    missionOrigin,
    onPhenomenonCreated: (created) => setPhenomena((prev) => [...prev, created]),
    onContextObjectCreated: (created) => setContextObjects((prev) => [...prev, created]),
    onFreeformNetworkCreated: (created) => setFreeformNetworks((prev) => [...prev, created]),
    onFeltSegmentCreated: (created) => setFeltSegments((prev) => [...prev, created]),
    onError: (message) => setError(message),
  })

  const armedFeltPointNetwork = placementMode?.kind === 'felt-point' ? placementMode.networkName : null
  const allowedBearings = allowedBearingsForNetwork(armedFeltPointNetwork)

  async function loadAll() {
    try {
      const [loadedInstances, loadedPoints, loadedTemplates, loadedSegments, loadedPhenomena, loadedContextObjects, loadedFreeform, loadedPlans] = await Promise.all([
        listGridInstancesForPlan(planId),
        listFeltPointsForPlan(planId),
        listGridTemplates(),
        listFeltSegmentsForPlan(planId),
        listPhenomenaForPlan(planId),
        listContextObjectsForPlan(planId),
        listFreeformNetworksForPlan(planId),
        listPlansForMission(missionId),
      ])
      setInstances(loadedInstances)
      setFeltPoints(loadedPoints)
      setTemplates(loadedTemplates)
      setFeltSegments(loadedSegments)
      setPhenomena(loadedPhenomena)
      setContextObjects(loadedContextObjects)
      setFreeformNetworks(loadedFreeform)
      // Only one interior Plan is ever created per mission in the current
      // flow (MissionWorkspace's handleInteriorCalibrated); imageUrl/
      // calibration are both required for anything to actually render.
      setInteriorPlan(
        loadedPlans.find((p) => p.kind === 'interieur' && p.imageUrl !== null && p.calibration !== null) ?? null
      )
      const entries = await Promise.all(
        loadedInstances.map(
          async (instance) => [instance.id, await listGridLinesForInstance(instance.id)] as const
        )
      )
      setLinesByInstance(Object.fromEntries(entries))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAll closes
    // over missionId too, but only planId is meant to re-trigger this effect
    // (matches the pre-existing behavior of the inline `load()` this replaces).
    // reloadKey is a deliberate external re-trigger (bumped by
    // MissionWorkspace after an undo/redo, since UndoRedoControls now lives
    // in Toolbar, outside this component); missionId is intentionally
    // excluded, same reasoning as before.
  }, [planId, reloadKey])

  // Depend on missionOrigin.lat/lng (primitives), NOT the missionOrigin object
  // itself. MissionWorkspace.tsx's ready-no-interior case constructs
  // `missionOrigin={{ lat: originLat!, lng: originLng! }}` as a fresh object
  // literal on every render (confirmed: no memoization) — SiteMapView
  // re-renders whenever its parent does, so a `[missionOrigin, ...]`
  // dependency would re-fire this effect (and re-hit the IGN WFS endpoint,
  // twice per widen-once pass) on every unrelated parent re-render for as
  // long as buildingFootprint stays null, not just when the origin actually
  // changes.
  useEffect(() => {
    if (buildingFootprint !== null) return // already confirmed, nothing to fetch
    // Cancel/staleness guard: without this, a slower fetch from a previous
    // effect run (older missionOrigin) could resolve AFTER a newer run's
    // fetch and overwrite buildingCandidates with stale results — same class
    // of bug as the missionOrigin-identity one documented below. Both WFS
    // services already accept an AbortSignal; the cleanup aborts the in-flight
    // request, and the aborted checks below drop any result/error from a
    // superseded run instead of applying it.
    const controller = new AbortController()
    async function loadBuildings() {
      try {
        let found = await fetchBuildingsInBounds(
          boundsAround(missionOrigin, BUILDING_SEARCH_RADIUS_M),
          controller.signal
        )
        if (found.length === 0 && !controller.signal.aborted) {
          found = await fetchBuildingsInBounds(
            boundsAround(missionOrigin, BUILDING_SEARCH_WIDENED_RADIUS_M),
            controller.signal
          )
        }
        if (controller.signal.aborted) return // superseded — a newer run owns the state
        setBuildingCandidates(found)
        setBuildingSearchExhausted(found.length === 0)
        setBuildingError(null)
      } catch (err) {
        if (controller.signal.aborted) return // AbortError from our own cleanup, not a real failure
        setBuildingError(err instanceof Error ? err.message : String(err))
      }
    }
    loadBuildings()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- missionOrigin.lat/lng
    // are the real dependency; the missionOrigin object itself is deliberately
    // excluded (see comment above) since it's a fresh reference every render.
  }, [missionOrigin.lat, missionOrigin.lng, buildingFootprint, buildingFetchNonce])

  async function handleChooseBuilding(index: number) {
    try {
      const footprint = buildingCandidates[index].ringsLatLng[0].map((latlng) => latLngToLocal(latlng, missionOrigin))
      const updated = await setBuildingFootprint(missionId, footprint)
      setBuildingFootprintState(updated.buildingFootprint)
      setBuildingError(null)
    } catch (err) {
      setBuildingError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleChangeBuilding() {
    setBuildingFootprintState(null)
    setBuildingCandidates([])
    setBuildingSearchExhausted(false)
    setBuildingError(null)
    // The useEffect above re-fires automatically once buildingFootprint becomes
    // null again (it's in the dependency array), re-running the fetch.
  }

  // Grid CREATION itself (not a placement-mode "start X" handler — fires once
  // pendingOrigin and a polarity are both chosen). See usePlacementMode's
  // clearGridOriginPlacement for the placement-mode cleanup this delegates to
  // on success.
  async function handleGenerateGrid(template: GridTemplate, origin: Point, polarity: GridLinePolarity) {
    try {
      const { instance, lines } = await createGridForPlan(planId, template, origin, polarity)
      setInstances((prev) => [...prev, instance])
      setLinesByInstance((prev) => ({ ...prev, [instance.id]: lines }))
      clearGridOriginPlacement()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function handleLineChanged(instanceId: string, updated: GridLine, changeKind: 'drag' | 'vertex-added') {
    setLinesByInstance((prev) => ({
      ...prev,
      [instanceId]: prev[instanceId].map((l) => (l.id === updated.id ? updated : l)),
    }))
    updateAdjustedPoints(updated.id, updated.adjustedPoints, planId).catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    )
    setLastChangedLine({ instanceId, lineId: updated.id })
    if (changeKind === 'drag') {
      setAwaitingOrthogonalityReview(updated.id)
    }
    // changeKind === 'vertex-added': deliberately does NOT set
    // awaitingOrthogonalityReview — see design spec §3: offering to straighten a
    // line the practitioner just deliberately bent to capture a real deviation
    // would be actively confusing.
  }

  function handleResetLine(instanceId: string, lineId: string) {
    const line = linesByInstance[instanceId]?.find((l) => l.id === lineId)
    if (!line) return
    handleLineChanged(instanceId, resetToTheoretical(line), 'drag')
  }

  function handleToggleCalibrating() {
    setCalibrating((v) => !v)
    setCalibrationPicks([])
    setCalibrationError(null)
  }

  // Functional updater (not "[...calibrationPicks, segment]" off the render-scope
  // value) so two picks fired in the same synchronous tick — e.g. two
  // eventHandlers.click callbacks from a single batched dispatch — can't both
  // close over the same stale empty array and silently overwrite each other
  // instead of accumulating.
  function handlePickCalibrationSegment(segment: FeltSegment) {
    setCalibrationPicks((prev) => (prev.some((p) => p.id === segment.id) ? prev : [...prev, segment]))
  }

  // Runs the actual recalibration once 2 picks have landed — split out from
  // handlePickCalibrationSegment above specifically so the accumulation
  // itself never races (see that function's comment); this effect always
  // sees the fully-committed calibrationPicks state, never a stale snapshot.
  useEffect(() => {
    if (calibrationPicks.length < 2) return

    const [a, b] = calibrationPicks
    const instance = instances.find((i) => visibility[i.id])
    if (!instance) {
      setCalibrationError('Aucune grille visible à recaler.')
      setCalibrationPicks([])
      return
    }

    const crossing = intersectSegmentLines(a, b)
    if (!crossing) {
      setCalibrationError('Ces deux tiges sont trop proches d’être parallèles pour déterminer un croisement fiable.')
      setCalibrationPicks([])
      return
    }

    const delta = { x: crossing.x - instance.originX, y: crossing.y - instance.originY }
    const translatedLines = (linesByInstance[instance.id] ?? []).map((line) => translateGridLine(line, delta))

    // Must be `const runRecalibration = async () => {...}` (a function
    // EXPRESSION), not `async function runRecalibration() {...}` (a function
    // DECLARATION) — a function declaration invoked as a separate later
    // statement does NOT inherit the outer `const` narrowing of
    // `instance`/`crossing` from the two guards above (TS treats it as a
    // possibly-hoisted, independently-callable declaration, unlike an arrow
    // function/function expression in the same position, which does inherit
    // the narrowing). Using the declaration form here would reintroduce
    // "possibly undefined" compile errors on instance/crossing. This has
    // been empirically verified against the real TypeScript compiler — use
    // the arrow-function-expression form exactly as written below, do not
    // "simplify" it to a function declaration.
    const runRecalibration = async () => {
      const batchId = crypto.randomUUID()
      await updateGridInstanceOrigin(instance.id, crossing.x, crossing.y, { batchId })
      // Sequential, not Promise.all: each write triggers action_history's
      // purge/FIFO-eviction logic, which reads then writes the plan's entry
      // count — concurrent calls on the same plan could race on that
      // read-then-write. A recalibration is an occasional action, not a hot
      // path, so the sequential cost is negligible.
      for (const line of translatedLines) {
        await updateLinePoints(line.id, line.theoreticalPoints, line.adjustedPoints, instance.planId, { batchId })
      }
    }

    runRecalibration()
      .then(() => {
        setInstances((prev) =>
          prev.map((i) => (i.id === instance.id ? { ...i, originX: crossing.x, originY: crossing.y } : i))
        )
        setLinesByInstance((prev) => ({ ...prev, [instance.id]: translatedLines }))
        setCalibrating(false)
        setCalibrationError(null)
      })
      .catch((err) => {
        setCalibrationError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setCalibrationPicks([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately only
    // triggered by calibrationPicks changing; instances/visibility/linesByInstance
    // are read fresh from render scope, not tracked as re-trigger deps.
  }, [calibrationPicks])

  function toggleLayer(id: string) {
    const currentlyVisible = visibility[id] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(id)
    setVisibility((prev) => ({ ...prev, [id]: !currentlyVisible }))
  }

  function colorForNetwork(networkName: string): string {
    return resolveNetworkColor(networkName, instances, templates)
  }

  // The GridLine + owning GridInstance currently up for orthogonality review
  // (set by handleLineChanged after every drag/reset), found by scanning
  // linesByInstance since awaitingOrthogonalityReview only tracks the line id.
  function findAwaitingOrthogonalityReview(): { instance: GridInstance; line: GridLine } | null {
    if (awaitingOrthogonalityReview === null) return null
    for (const instance of instances) {
      const line = linesByInstance[instance.id]?.find((l) => l.id === awaitingOrthogonalityReview)
      if (line) return { instance, line }
    }
    return null
  }

  // Unlike gridLayers/reviewTarget/reviewSuggestion below (O(1) or
  // O(instances) — cheap enough to recompute on every render, matching this
  // file's own inline-derivation style), this one is genuinely expensive:
  // computeHartmannCurryCrossings is O(instances × lines × segments²) — a
  // nested loop over every consecutive segment pair of every Hartmann line
  // against every consecutive segment pair of every Curry line. Since lines
  // are arbitrary-length polylines that grow with field edits (drags and,
  // per the vertex-insertion feature, new vertices), an unmemoized derivation
  // here would redo that quadratic work on every unrelated render — every
  // keystroke in the "Angle personnalisé" input, every guide-line preset
  // click — a real typing-lag risk, not a hypothetical one. This also
  // resolves a deliberate deviation from the original spec (§4/§5 called for
  // useMemo here; the plan inlined it instead to match the file's style,
  // flagged as a tradeoff) by following the spec after all.
  //
  // Placed ABOVE the `if (error) return ...` below (unlike every other
  // derived value in this function, which are plain calculations computed
  // after it): useMemo is a hook, and hooks must run unconditionally on
  // every render — a hook called only on the non-error branch would throw
  // "Rendered fewer hooks than expected" the moment `error` becomes set.
  const pathogenicCrossings = useMemo(() => {
    const hartmannLines = instances
      .filter((i) => i.templateSnapshot.name === 'Hartmann')
      .flatMap((i) => linesByInstance[i.id] ?? [])
    const curryLines = instances
      .filter((i) => i.templateSnapshot.name === 'Curry')
      .flatMap((i) => linesByInstance[i.id] ?? [])
    return computeHartmannCurryCrossings(hartmannLines, curryLines)
  }, [instances, linesByInstance])

  if (error) return <p role="alert">{error}</p>

  const reviewTarget = findAwaitingOrthogonalityReview()
  // Computed once here (rather than inside OrthogonalitySuggestion) so both
  // the map-layer preview and this bottom-right panel's text/buttons use the
  // same deviationDeg/suggestedPoints — see OrthogonalitySuggestion.tsx's
  // doc comment for why the two are split apart.
  const reviewSuggestion = reviewTarget
    ? getOrthogonalitySuggestion(reviewTarget.line.adjustedPoints, reviewTarget.line.family, {
        angleTrueNorthDeg: reviewTarget.instance.templateSnapshot.angleTrueNorthDeg,
      })
    : null

  const gridLayers: LayerEntry[] = instances.map((instance) => ({
    id: instance.id,
    label: instance.templateSnapshot.name,
    color: instance.templateSnapshot.color,
  }))

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapView
        center={[missionOrigin.lat, missionOrigin.lng]}
        fitBounds={fitBounds}
        onMapClick={placementMode !== null ? handleMapClick : undefined}
      >
        {interiorPlan?.imageUrl && interiorPlan.calibration && (
          <CalibratedPlanOverlay
            imageUrl={interiorPlan.imageUrl}
            calibration={interiorPlan.calibration}
            missionOrigin={missionOrigin}
            visible={visibility[INTERIOR_PLAN_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(INTERIOR_PLAN_LAYER_ID)}
          />
        )}
        <FeltPointsLayer
          points={feltPoints}
          colorForNetwork={colorForNetwork}
          missionOrigin={missionOrigin}
          visible={visibility[FELT_POINTS_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(FELT_POINTS_LAYER_ID)}
        />
        <FeltSegmentsLayer
          segments={feltSegments}
          colorForNetwork={colorForNetwork}
          missionOrigin={missionOrigin}
          visible={visibility[FELT_SEGMENTS_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(FELT_SEGMENTS_LAYER_ID)}
          onSegmentClick={calibrating ? handlePickCalibrationSegment : undefined}
          selectedSegmentIds={calibrating ? calibrationPicks.map((p) => p.id) : undefined}
        />
        {instances.map((instance) =>
          editMode && (visibility[instance.id] ?? false) ? (
            <Fragment key={instance.id}>
              {(linesByInstance[instance.id] ?? []).map((line) => (
                <EditableNetworkLine
                  key={line.id}
                  line={line}
                  color={instance.templateSnapshot.color}
                  networkName={instance.templateSnapshot.name}
                  missionOrigin={missionOrigin}
                  editable
                  onChanged={(updated, changeKind) => handleLineChanged(instance.id, updated, changeKind)}
                />
              ))}
            </Fragment>
          ) : (
            <NetworkLinesLayer
              key={instance.id}
              lines={linesByInstance[instance.id] ?? []}
              templateSnapshot={instance.templateSnapshot}
              missionOrigin={missionOrigin}
              visible={visibility[instance.id] ?? false}
            />
          )
        )}
        <GuideLineLayer anchor={guideLineAnchor} bearingDeg={guideLineBearing} missionOrigin={missionOrigin} />
        {reviewTarget && (
          <OrthogonalitySuggestion
            linePoints={reviewTarget.line.adjustedPoints}
            family={reviewTarget.line.family}
            template={{ angleTrueNorthDeg: reviewTarget.instance.templateSnapshot.angleTrueNorthDeg }}
            missionOrigin={missionOrigin}
          />
        )}
        {buildingFootprint === null && (
          <BuildingFootprintPicker
            candidates={buildingCandidates}
            confirmedIndex={null}
            missionOrigin={missionOrigin}
            onChoose={handleChooseBuilding}
          />
        )}
        <BaguaLayer
          footprint={buildingFootprint}
          missionOrigin={missionOrigin}
          visible={visibility[BAGUA_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(BAGUA_LAYER_ID)}
        />
        <PathogenicCrossingsLayer
          crossings={pathogenicCrossings}
          missionOrigin={missionOrigin}
          visible={visibility[PATHOGENIC_CROSSINGS_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(PATHOGENIC_CROSSINGS_LAYER_ID)}
        />
        <PhenomenaLayer
          phenomena={phenomena}
          missionOrigin={missionOrigin}
          visible={visibility[PHENOMENA_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(PHENOMENA_LAYER_ID)}
        />
        <ContextObjectsLayer
          objects={contextObjects}
          missionOrigin={missionOrigin}
          visible={visibility[CONTEXT_OBJECTS_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(CONTEXT_OBJECTS_LAYER_ID)}
        />
        <FreeformDrawTool
          active={placementMode?.kind === 'freeform' && pendingFreeformTrace === null}
          missionOrigin={missionOrigin}
          onComplete={handleFreeformTraceComplete}
        />
        <FreeformNetworkLayer
          networks={freeformNetworks}
          missionOrigin={missionOrigin}
          visible={visibility[FREEFORM_NETWORK_LAYER_ID] ?? DEFAULT_VISIBLE_LAYER_IDS.includes(FREEFORM_NETWORK_LAYER_ID)}
        />
      </MapView>
      {/* Full-height left sidebar (spec §3) — replaces the former 4 floating
          OverlayPanel corners (top-right, top-left, bottom-left) with one
          pinned band + collapsible accordion. Pure relocation: every section
          below holds the exact same JSX that used to live in one of those
          corners, unchanged. Only the orthogonality-review card and the
          permanent CompassIndicator (both below) stay outside the sidebar. */}
      <Sidebar
        pinned={
          <>
            <FeltPointPicker
              activeNetworkName={placementMode?.kind === 'felt-point' ? placementMode.networkName : null}
              onSelectNetwork={handleSelectFeltPointNetwork}
              selectedBearing={placementMode?.kind === 'felt-point' ? placementMode.bearingDeg : null}
              onSelectBearing={handleSelectFeltPointBearing}
              bearingLocked={pendingFeltSegment !== null}
            />
            {pendingFeltSegment && (
              <div style={CARD_CHROME_STYLE}>
                {feltSegmentSaveError !== null && (
                  <>
                    <p role="alert">{feltSegmentSaveError}</p>
                    <button onClick={() => setFeltSegmentSaveError(null)}>Fermer</button>
                  </>
                )}
                <FeltSegmentPolarityForm
                  onSubmit={({ polarityA, polarityB }) => handleSubmitFeltSegmentPolarity(polarityA, polarityB)}
                  onCancel={handleCancelFeltSegment}
                />
              </div>
            )}
          </>
        }
        sections={[
          {
            id: 'grille',
            title: 'Grille / Réseaux',
            defaultOpen: true,
            content: (
              <>
                <div style={GRID_CREATION_WRAPPER_STYLE}>
                  <GridCreationPanel
                    key={gridCreationKey}
                    pendingOrigin={pendingGridOrigin}
                    onOriginRequested={handleGridOriginRequested}
                    onGenerate={handleGenerateGrid}
                  />
                </div>
                {/* Edit-mode card, moved verbatim from the former bottom-left
                    corner. A single global "Mode édition" toggle, not a
                    per-layer one: Laurent edits one visible network at a time
                    in the field, so whichever grid layer is currently toggled
                    visible becomes draggable while this is on.
                    "Réinitialiser" acts on the line most recently dragged or
                    reset (lastChangedLine) rather than through a per-line
                    picker, since that line is always the one Laurent just
                    touched. (Undo is now handled globally by
                    UndoRedoControls in the sidebar's pinned block, not by a
                    per-line button here.) */}
                <div style={CARD_CHROME_STYLE}>
                  <label>
                    <input type="checkbox" checked={editMode} onChange={() => setEditMode((v) => !v)} />
                    Mode édition (caler sur le ressenti)
                  </label>
                  {editMode && (
                    <p>Glissez un point pour l'ajuster, cliquez le point central entre deux points pour ajouter un coude.</p>
                  )}
                  <button
                    onClick={() => lastChangedLine && handleResetLine(lastChangedLine.instanceId, lastChangedLine.lineId)}
                    disabled={!editMode || !lastChangedLine || !(visibility[lastChangedLine.instanceId] ?? false)}
                  >
                    Réinitialiser
                  </button>
                </div>
                {/* Grid recalibration: same single-global-toggle convention as
                    edit-mode above, acting on whichever grid layer is
                    currently visible. Picking 2 already-recorded felt
                    segments (tiges) computes their theoretical crossing and
                    rigidly shifts the whole grid onto it — spec: "aligner sur
                    l'axe théorique... à un croisement de 2 tiges (axe
                    vertical et horizontal) pour caler proprement le
                    cadrillage". */}
                <div style={CARD_CHROME_STYLE}>
                  <label>
                    <input type="checkbox" checked={calibrating} onChange={handleToggleCalibrating} />
                    Recaler la grille sur un croisement de 2 tiges
                  </label>
                  {calibrating && (
                    <p>
                      Cliquez 2 tiges déjà relevées, une sur chaque axe, à l'endroit où vous avez ressenti leur
                      croisement ({calibrationPicks.length}/2 sélectionnée{calibrationPicks.length > 1 ? 's' : ''}).
                    </p>
                  )}
                  {calibrationError !== null && (
                    <>
                      <p role="alert">{calibrationError}</p>
                      <button onClick={() => setCalibrationError(null)}>Fermer</button>
                    </>
                  )}
                </div>
              </>
            ),
          },
          {
            id: 'calques',
            title: 'Calques',
            defaultOpen: false,
            content: <LayerPanel gridLayers={gridLayers} visibility={visibility} onToggle={toggleLayer} />,
          },
          {
            id: 'phenomenes',
            title: 'Phénomènes',
            defaultOpen: false,
            content: (
              <PhenomenonPicker
                activeKind={placementMode?.kind === 'phenomenon' ? placementMode.phenomenonKind : null}
                onSelectKind={handleSelectPhenomenonKind}
              />
            ),
          },
          {
            id: 'objets-contexte',
            title: 'Objets de contexte',
            defaultOpen: false,
            content: (
              <ContextObjectPicker
                activeKind={placementMode?.kind === 'context-object' ? placementMode.contextObjectKind : null}
                onSelectKind={handleSelectContextObjectKind}
              />
            ),
          },
          {
            id: 'freeform',
            title: 'Tracés eau/faille',
            defaultOpen: false,
            content: (
              <>
                {/* Starts a freeform eau/faille trace (FreeformDrawTool,
                    rendered inside <MapView> above). Each button is only
                    disabled while a DIFFERENT mode (including the OTHER
                    freeform kind) is active — not while its OWN kind is
                    armed, so it can be clicked again to self-cancel (see
                    handleStartFreeformTrace's toggle logic above). This is
                    the only way to back out of an armed-but-not-yet-dragging
                    freeform mode now that startPlacementMode's freeform guard
                    blocks every OTHER mode-start control from interrupting
                    it. Also hard-disabled whenever pendingFreeformTrace !==
                    null — once a trace is captured, the metadata form
                    (below) is the only valid way to resolve it (submit or
                    cancel); re-clicking the trace-start button while the form
                    is open must not be able to touch placementMode out from
                    under it (see handleStartFreeformTrace's doc comment for
                    the bug this prevents). aria-pressed mirrors
                    PhenomenonPicker's own toggle-button convention. */}
                <div style={CARD_CHROME_STYLE}>
                  <button
                    onClick={() => handleStartFreeformTrace('eau')}
                    aria-pressed={placementMode?.kind === 'freeform' && placementMode.freeformKind === 'eau'}
                    disabled={
                      pendingFreeformTrace !== null ||
                      (placementMode !== null && !(placementMode.kind === 'freeform' && placementMode.freeformKind === 'eau'))
                    }
                  >
                    Tracer l'eau
                  </button>
                  <button
                    onClick={() => handleStartFreeformTrace('faille')}
                    aria-pressed={placementMode?.kind === 'freeform' && placementMode.freeformKind === 'faille'}
                    disabled={
                      pendingFreeformTrace !== null ||
                      (placementMode !== null && !(placementMode.kind === 'freeform' && placementMode.freeformKind === 'faille'))
                    }
                  >
                    Tracer une faille
                  </button>
                </div>
                {pendingFreeformTrace && (
                  <div style={CARD_CHROME_STYLE}>
                    {freeformSaveError !== null && (
                      <>
                        <p role="alert">{freeformSaveError}</p>
                        <button onClick={() => setFreeformSaveError(null)}>Fermer</button>
                      </>
                    )}
                    <FreeformMetadataForm onSubmit={handleSubmitFreeformMetadata} onCancel={handleCancelFreeformMetadata} />
                  </div>
                )}
              </>
            ),
          },
          {
            id: 'ligne-guide',
            title: 'Ligne guide',
            defaultOpen: false,
            content: (
              <div style={CARD_CHROME_STYLE}>
                {(allowedBearings === null || allowedBearings.includes(0)) && (
                  <button
                    onClick={() => {
                      setGuideLineBearing(0)
                      setCustomBearingInput('')
                    }}
                  >
                    N/S
                  </button>
                )}
                {(allowedBearings === null || allowedBearings.includes(90)) && (
                  <button
                    onClick={() => {
                      setGuideLineBearing(90)
                      setCustomBearingInput('')
                    }}
                  >
                    E/O
                  </button>
                )}
                {(allowedBearings === null || allowedBearings.includes(45)) && (
                  <button
                    onClick={() => {
                      setGuideLineBearing(45)
                      setCustomBearingInput('')
                    }}
                  >
                    45°
                  </button>
                )}
                {(allowedBearings === null || allowedBearings.includes(135)) && (
                  <button
                    onClick={() => {
                      setGuideLineBearing(135)
                      setCustomBearingInput('')
                    }}
                  >
                    135°
                  </button>
                )}
                <input
                  type="number"
                  step="1"
                  aria-label="Angle personnalisé"
                  value={customBearingInput}
                  onChange={(e) => setCustomBearingInput(e.target.value)}
                />
                <button onClick={handleValidateCustomBearing}>Valider</button>
                <button
                  onClick={() => startPlacementMode({ kind: 'guide-line' })}
                  disabled={guideLineBearing === null}
                >
                  Placer ici
                </button>
                <button onClick={handleClearGuideLine} disabled={guideLineAnchor === null}>
                  Effacer
                </button>
              </div>
            ),
          },
          ...(buildingFootprint !== null || buildingSearchExhausted || buildingError !== null
            ? [
                {
                  id: 'batiment',
                  title: 'Bâtiment',
                  defaultOpen: false,
                  content: (
                    <div style={CARD_CHROME_STYLE}>
                      {buildingError !== null && (
                        <>
                          <p role="alert">{buildingError}</p>
                          <button
                            onClick={() => {
                              setBuildingError(null)
                              setBuildingFetchNonce((n) => n + 1)
                            }}
                          >
                            Réessayer
                          </button>
                          <button onClick={() => setBuildingError(null)}>Fermer</button>
                        </>
                      )}
                      {buildingFootprint !== null && (
                        <button onClick={handleChangeBuilding}>Changer de bâtiment</button>
                      )}
                      {buildingSearchExhausted && buildingFootprint === null && (
                        <p>Aucun bâtiment détecté à proximité de l'origine.</p>
                      )}
                    </div>
                  ),
                },
              ]
            : []),
          ...((visibility[BAGUA_LAYER_ID] ?? false)
            ? [
                {
                  id: 'bagua',
                  title: 'Bagua',
                  defaultOpen: false,
                  content: (
                    <div style={CARD_CHROME_STYLE}>
                      <BaguaLegendCollapsed />
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
      {/* Bottom-right — the orthogonality-review card is transient/contextual
          (appears right after a line drag/reset), unlike the sidebar's
          browsable tools, so it stays a small floating OverlayPanel directly
          on the map rather than moving into the accordion (spec §3/§12). The
          Bagua legend that used to share this corner now lives in the
          sidebar's "Bagua" section above, so this panel's visibility no
          longer needs to account for the Bagua layer at all. */}
      {reviewTarget !== null && reviewSuggestion !== null && (
        <OverlayPanel corner="bottom-right">
          {reviewTarget && reviewSuggestion && (
            <div style={CARD_CHROME_STYLE}>
              <p>Écart à l'orthogonal théorique : {reviewSuggestion.deviationDeg.toFixed(1)}°</p>
              <button
                onClick={() => {
                  handleLineChanged(reviewTarget.instance.id, {
                    ...reviewTarget.line,
                    adjustedPoints: reviewSuggestion.suggestedPoints,
                  }, 'drag')
                  setAwaitingOrthogonalityReview(null)
                }}
              >
                Redresser
              </button>
              <button onClick={() => setAwaitingOrthogonalityReview(null)}>Ignorer</button>
            </div>
          )}
        </OverlayPanel>
      )}
      {/* Fixed, non-interactive overlay, top-right of the map — distinct from
          the Sidebar (now full-height left) and from the bottom-right
          orthogonality OverlayPanel above. Not wrapped in <OverlayPanel>; it
          needs no stacking/scroll behavior, just a fixed corner position
          (spec §6). */}
      <div data-testid="compass-indicator" style={{ position: 'absolute', top: 8, right: 8, zIndex: 1000 }}>
        <CompassIndicator />
      </div>
    </div>
  )
}

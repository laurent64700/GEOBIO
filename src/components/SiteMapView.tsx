import { Fragment, useEffect, useState } from 'react'
import { MapView } from './MapView'
import { NetworkLinesLayer } from './NetworkLinesLayer'
import { EditableNetworkLine } from './EditableNetworkLine'
import { FeltPointsLayer } from './FeltPointsLayer'
import { FeltSegmentsLayer } from './FeltSegmentsLayer'
import { GuideLineLayer } from './GuideLineLayer'
import { OrthogonalitySuggestion } from './OrthogonalitySuggestion'
import {
  LayerPanel,
  FELT_POINTS_LAYER_ID,
  FELT_SEGMENTS_LAYER_ID,
  BAGUA_LAYER_ID,
  DEFAULT_VISIBLE_LAYER_IDS,
  type LayerEntry,
} from './LayerPanel'
import { GridCreationPanel } from './GridCreationPanel'
import { OverlayPanel } from './OverlayPanel'
import { BuildingFootprintPicker } from './BuildingFootprintPicker'
import { BaguaLayer } from './BaguaLayer'
import { listGridInstancesForPlan } from '../data/gridInstancesRepo'
import { listGridLinesForInstance, updateAdjustedPoints } from '../data/gridLinesRepo'
import { listFeltPointsForPlan } from '../data/feltPointsRepo'
import { listFeltSegmentsForPlan } from '../data/feltSegmentsRepo'
import { listGridTemplates } from '../data/gridTemplatesRepo'
import { createGridForPlan } from '../domain/createGridForPlan'
import { fetchBuildingsInBounds, type BuildingFootprint } from '../data/buildingFootprintService'
import { setBuildingFootprint } from '../data/missionsRepo'
import { baguaCorrespondences } from '../domain/baguaCorrespondences'
import { resolveNetworkColor } from '../domain/networkColors'
import type { CompassDirection } from '../geometry/bagua'
import type { GridInstance, GridLine, FeltPoint, FeltSegment, Point, GridTemplate, GridLinePolarity } from '../domain/types'
import { latLngToLocal, type LatLng } from '../geometry/localCoordinates'
import { resetToTheoretical } from '../geometry/lineEditing'
import { getOrthogonalitySuggestion } from '../geometry/orthogonality'

// Same order as bagua.ts's own (module-private) COMPASS_ORDER — kept in sync
// manually since that constant isn't exported; only used here to iterate the
// legend table in a sensible compass order rather than object-key order.
const COMPASS_DIRECTIONS: CompassDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

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
            {COMPASS_DIRECTIONS.map((direction) => {
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
}

// Fixed search radius around the mission origin, mirroring
// DEFAULT_GRID_RADIUS_M's role in createGridForPlan.ts — see spec §4/§7 for
// why bounds come from the origin rather than "selected parcels" (no
// parcel-picker UI exists).
const BUILDING_SEARCH_RADIUS_M = 100
const BUILDING_SEARCH_WIDENED_RADIUS_M = 300
const METERS_PER_DEG_LAT = 111_320

function boundsAround(origin: LatLng, radiusM: number) {
  const degLat = radiusM / METERS_PER_DEG_LAT
  const degLng = radiusM / (METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180))
  return {
    minLat: origin.lat - degLat,
    maxLat: origin.lat + degLat,
    minLng: origin.lng - degLng,
    maxLng: origin.lng + degLng,
  }
}

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

export function SiteMapView({ planId, missionId, missionOrigin, initialBuildingFootprint }: SiteMapViewProps) {
  const [instances, setInstances] = useState<GridInstance[]>([])
  const [linesByInstance, setLinesByInstance] = useState<Record<string, GridLine[]>>({})
  const [feltPoints, setFeltPoints] = useState<FeltPoint[]>([])
  const [feltSegments, setFeltSegments] = useState<FeltSegment[]>([])
  const [templates, setTemplates] = useState<GridTemplate[]>([])
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [guideLineBearing, setGuideLineBearing] = useState<number | null>(null)
  const [guideLineAnchor, setGuideLineAnchor] = useState<Point | null>(null)
  const [placingGuideLine, setPlacingGuideLine] = useState(false)
  const [customBearingInput, setCustomBearingInput] = useState('')
  // Single global edit-mode toggle (not per-layer) — Laurent works on one
  // network at a time in the field, so whichever grid layer is currently
  // visible becomes editable; see the bottom-left OverlayPanel usage below.
  const [editMode, setEditMode] = useState(false)
  const [undoStack, setUndoStack] = useState<Record<string, GridLine[]>>({}) // per gridInstanceId
  // Tracks the line most recently touched by a drag/reset, so the single
  // "Annuler"/"Réinitialiser" panel knows which instance/line to act on
  // without a per-line picker UI (not specified by the plan; kept minimal).
  const [lastChangedLine, setLastChangedLine] = useState<{ instanceId: string; lineId: string } | null>(null)
  // Set to a GridLine id right after it's adjusted (drag or reset), so the
  // orthogonality-assist panel (bottom-right OverlayPanel, below)
  // knows which line to preview/offer straightening for. Cleared on accept
  // or dismiss.
  const [awaitingOrthogonalityReview, setAwaitingOrthogonalityReview] = useState<string | null>(null)
  // Grid-origin placement (Task 33): mutually exclusive with placingGuideLine
  // below, since both modes want MapView's single onMapClick slot. See
  // handleGridOriginRequested, the "Placer ici" button, and handleMapClick
  // for how that exclusivity is actively enforced rather than assumed.
  const [pendingGridOrigin, setPendingGridOrigin] = useState<Point | null>(null)
  const [awaitingGridOrigin, setAwaitingGridOrigin] = useState(false)
  // Bumped (via the GridCreationPanel `key` prop below) whenever the panel's
  // own internal step-machine state (expanded/template/polarity) needs to be
  // force-reset from outside: after a successful "Générer" (so a second grid
  // can be created — otherwise the panel's derived step falls back to
  // "awaiting-origin" forever, since pendingGridOrigin/awaitingGridOrigin are
  // reset but the panel's own `expanded`/`template` aren't), and when
  // "Placer ici" cancels a pending grid-origin request (otherwise the panel
  // keeps showing a stale "cliquez l'origine" prompt for a click that will
  // actually place a guide-line anchor instead).
  const [gridCreationKey, setGridCreationKey] = useState(0)
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

  useEffect(() => {
    async function load() {
      try {
        const [loadedInstances, loadedPoints, loadedTemplates, loadedSegments] = await Promise.all([
          listGridInstancesForPlan(planId),
          listFeltPointsForPlan(planId),
          listGridTemplates(),
          listFeltSegmentsForPlan(planId),
        ])
        setInstances(loadedInstances)
        setFeltPoints(loadedPoints)
        setTemplates(loadedTemplates)
        setFeltSegments(loadedSegments)
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
    load()
  }, [planId])

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

  function handleGuideLineMapClick(latlng: { lat: number; lng: number }) {
    setGuideLineAnchor(latLngToLocal(latlng, missionOrigin))
    setPlacingGuideLine(false)
  }

  // Starting one map-click mode must actively cancel the other — leaving the
  // opposite flag untouched would let both end up true at once, and a stale
  // flag could silently consume a later, unrelated click. Both directions are
  // explicit: this cancels placingGuideLine, and the "Placer ici" button
  // below cancels awaitingGridOrigin.
  function handleGridOriginRequested() {
    setAwaitingGridOrigin(true)
    setPendingGridOrigin(null)
    setPlacingGuideLine(false)
  }

  async function handleGenerateGrid(template: GridTemplate, origin: Point, polarity: GridLinePolarity) {
    try {
      const { instance, lines } = await createGridForPlan(planId, template, origin, polarity)
      setInstances((prev) => [...prev, instance])
      setLinesByInstance((prev) => ({ ...prev, [instance.id]: lines }))
      setAwaitingGridOrigin(false)
      setPendingGridOrigin(null)
      // Force-remount GridCreationPanel so its own expanded/template state
      // resets to "collapsed" — otherwise the panel's derived step would fall
      // back to "awaiting-origin" and permanently show a stale prompt (see
      // gridCreationKey's doc comment above).
      setGridCreationKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Single MapView onMapClick dispatcher: dispatches by whichever mode is
  // active. Because both "start" handlers (handleGridOriginRequested above,
  // and the "Placer ici" button below) clear the other flag,
  // awaitingGridOrigin and placingGuideLine are genuinely mutually exclusive
  // at every point in time, not just in the common case.
  function handleMapClick(latlng: { lat: number; lng: number }) {
    if (awaitingGridOrigin) {
      setPendingGridOrigin(latLngToLocal(latlng, missionOrigin))
      setAwaitingGridOrigin(false)
      return
    }
    if (placingGuideLine) {
      handleGuideLineMapClick(latlng)
    }
  }

  function handleClearGuideLine() {
    // Reset the whole tool, not just the placed anchor, so the practitioner
    // starts clean rather than keeping a stale bearing selected with no line shown.
    setGuideLineAnchor(null)
    setGuideLineBearing(null)
    setPlacingGuideLine(false)
    setCustomBearingInput('')
  }

  function handleValidateCustomBearing() {
    const parsed = Number(customBearingInput)
    if (customBearingInput.trim() !== '' && !Number.isNaN(parsed)) {
      setGuideLineBearing(parsed)
    }
  }

  function handleLineChanged(instanceId: string, updated: GridLine, changeKind: 'drag' | 'vertex-added') {
    setUndoStack((prev) => ({
      ...prev,
      [instanceId]: [...(prev[instanceId] ?? []), linesByInstance[instanceId].find((l) => l.id === updated.id)!],
    }))
    setLinesByInstance((prev) => ({
      ...prev,
      [instanceId]: prev[instanceId].map((l) => (l.id === updated.id ? updated : l)),
    }))
    updateAdjustedPoints(updated.id, updated.adjustedPoints).catch((err) =>
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

  function handleUndo(instanceId: string) {
    const stack = undoStack[instanceId]
    if (!stack || stack.length === 0) return
    const previous = stack[stack.length - 1]
    setUndoStack((prev) => ({ ...prev, [instanceId]: prev[instanceId].slice(0, -1) }))
    setLinesByInstance((prev) => ({
      ...prev,
      [instanceId]: prev[instanceId].map((l) => (l.id === previous.id ? previous : l)),
    }))
    updateAdjustedPoints(previous.id, previous.adjustedPoints).catch((err) =>
      setError(err instanceof Error ? err.message : String(err))
    )
  }

  function handleResetLine(instanceId: string, lineId: string) {
    const line = linesByInstance[instanceId]?.find((l) => l.id === lineId)
    if (!line) return
    handleLineChanged(instanceId, resetToTheoretical(line), 'drag')
  }

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
        onMapClick={awaitingGridOrigin || placingGuideLine ? handleMapClick : undefined}
      >
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
        />
        {instances.map((instance) =>
          editMode && (visibility[instance.id] ?? false) ? (
            <Fragment key={instance.id}>
              {(linesByInstance[instance.id] ?? []).map((line) => (
                <EditableNetworkLine
                  key={line.id}
                  line={line}
                  color={instance.templateSnapshot.color}
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
          visible={visibility[BAGUA_LAYER_ID] ?? false}
        />
      </MapView>
      {/* Top-right — LayerPanel and GridCreationPanel share this corner
          instead of each claiming one of their own; see OverlayPanel.tsx for
          why the stacking/overflow treatment is needed. */}
      <OverlayPanel corner="top-right">
        <LayerPanel gridLayers={gridLayers} visibility={visibility} onToggle={toggleLayer} />
        <div style={GRID_CREATION_WRAPPER_STYLE}>
          <GridCreationPanel
            key={gridCreationKey}
            pendingOrigin={pendingGridOrigin}
            onOriginRequested={handleGridOriginRequested}
            onGenerate={handleGenerateGrid}
          />
        </div>
      </OverlayPanel>
      {/* Top-left — kept clear of LayerPanel's top-right checkboxes. */}
      <OverlayPanel corner="top-left">
        <div style={CARD_CHROME_STYLE}>
          <button
            onClick={() => {
              setGuideLineBearing(0)
              setCustomBearingInput('')
            }}
          >
            N/S
          </button>
          <button
            onClick={() => {
              setGuideLineBearing(90)
              setCustomBearingInput('')
            }}
          >
            E/O
          </button>
          <button
            onClick={() => {
              setGuideLineBearing(45)
              setCustomBearingInput('')
            }}
          >
            45°
          </button>
          <button
            onClick={() => {
              setGuideLineBearing(135)
              setCustomBearingInput('')
            }}
          >
            135°
          </button>
          <input
            type="number"
            step="1"
            aria-label="Angle personnalisé"
            value={customBearingInput}
            onChange={(e) => setCustomBearingInput(e.target.value)}
          />
          <button onClick={handleValidateCustomBearing}>Valider</button>
          <button
            onClick={() => {
              setPlacingGuideLine(true)
              if (awaitingGridOrigin) {
                setAwaitingGridOrigin(false)
                // GridCreationPanel was mid-flow (showing "cliquez l'origine")
                // when this cancelled its pending request out from under it —
                // force-remount it back to collapsed so it doesn't keep
                // showing a stale prompt for a click that will now go to the
                // guide-line tool instead.
                setGridCreationKey((k) => k + 1)
              }
            }}
            disabled={guideLineBearing === null}
          >
            Placer ici
          </button>
          <button onClick={handleClearGuideLine} disabled={guideLineAnchor === null}>
            Effacer
          </button>
        </div>
        {/* Stacked as a second card in the same top-left corner (see
            OverlayPanel.tsx for why a corner can hold more than one item) —
            only shown once there's something to say about the building
            footprint: it's confirmed (offer "Changer de bâtiment"), the
            search came up empty even after widening, or the optional
            building/Bagua flow failed (dismissible, never replacing the map —
            spec §7's "pas de blocage du reste du relevé"; see buildingError's
            declaration comment). */}
        {(buildingFootprint !== null || buildingSearchExhausted || buildingError !== null) && (
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
        )}
      </OverlayPanel>
      {/* Bottom-left, the third corner — clear of LayerPanel top-right and
          the guide-line controls top-left. A single global "Mode édition"
          toggle, not a per-layer one: Laurent edits one visible network at a
          time in the field, so whichever grid layer is currently toggled
          visible becomes draggable while this is on. "Annuler"/"Réinitialiser"
          act on the line most recently dragged or reset (lastChangedLine)
          rather than through a per-line picker, since that line is always
          the one Laurent just touched. */}
      <OverlayPanel corner="bottom-left">
        <div style={CARD_CHROME_STYLE}>
          <label>
            <input type="checkbox" checked={editMode} onChange={() => setEditMode((v) => !v)} />
            Mode édition (caler sur le ressenti)
          </label>
          {editMode && (
            <p>Glissez un point pour l'ajuster, cliquez le point central entre deux points pour ajouter un coude.</p>
          )}
          <button
            onClick={() => lastChangedLine && handleUndo(lastChangedLine.instanceId)}
            disabled={
              !editMode ||
              !lastChangedLine ||
              !(visibility[lastChangedLine.instanceId] ?? false) ||
              (undoStack[lastChangedLine.instanceId]?.length ?? 0) === 0
            }
          >
            Annuler
          </button>
          <button
            onClick={() => lastChangedLine && handleResetLine(lastChangedLine.instanceId, lastChangedLine.lineId)}
            disabled={!editMode || !lastChangedLine || !(visibility[lastChangedLine.instanceId] ?? false)}
          >
            Réinitialiser
          </button>
        </div>
      </OverlayPanel>
      {/* Bottom-right, the fourth and last free corner — ONE OverlayPanel
          shared by the orthogonality-review card and the Bagua legend,
          mirroring how top-right stacks LayerPanel + GridCreationPanel in a
          single panel. Two sibling <OverlayPanel corner="bottom-right">
          instances would each sit at bottom:8/right:8 independently and
          overlap whenever both were visible at once (Bagua layer toggled on
          + a line just adjusted); only children of the SAME panel get
          flex-column stacking (see OverlayPanel.tsx).

          Orthogonality card: see OrthogonalitySuggestion.tsx's doc comment
          for why the text and buttons are rendered here rather than
          alongside the <Polyline> preview (OrthogonalitySuggestion, rendered
          inside <MapView> above). Shown after every line adjustment
          (handleLineChanged sets awaitingOrthogonalityReview); "Redresser"
          replaces the line's adjustedPoints with the suggested straightened
          points (going through handleLineChanged itself, so it's
          undoable/persisted the same way a drag or reset is); "Ignorer"
          just dismisses the card.

          Bagua legend card: bottom-right is the safest pairing — the
          orthogonality review only appears transiently right after a drag,
          while the Bagua legend is viewed at leisure once the layer is
          toggled on. */}
      {(reviewTarget !== null || (visibility[BAGUA_LAYER_ID] ?? false)) && (
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
          {(visibility[BAGUA_LAYER_ID] ?? false) && (
            <div style={CARD_CHROME_STYLE}>
              <BaguaLegendCollapsed />
            </div>
          )}
        </OverlayPanel>
      )}
    </div>
  )
}

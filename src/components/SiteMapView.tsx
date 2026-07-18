import { Fragment, useEffect, useState } from 'react'
import { MapView } from './MapView'
import { NetworkLinesLayer } from './NetworkLinesLayer'
import { EditableNetworkLine } from './EditableNetworkLine'
import { FeltPointsLayer } from './FeltPointsLayer'
import { GuideLineLayer } from './GuideLineLayer'
import { OrthogonalitySuggestion } from './OrthogonalitySuggestion'
import { LayerPanel, FELT_POINTS_LAYER_ID, type LayerEntry } from './LayerPanel'
import { listGridInstancesForPlan } from '../data/gridInstancesRepo'
import { listGridLinesForInstance, updateAdjustedPoints } from '../data/gridLinesRepo'
import { listFeltPointsForPlan } from '../data/feltPointsRepo'
import type { GridInstance, GridLine, FeltPoint, Point } from '../domain/types'
import { latLngToLocal, type LatLng } from '../geometry/localCoordinates'
import { resetToTheoretical } from '../geometry/lineEditing'
import { getOrthogonalitySuggestion } from '../geometry/orthogonality'

export interface SiteMapViewProps {
  planId: string
  missionOrigin: LatLng
}

// Mirrors LayerPanel's PANEL_STYLE (top-right) but anchored top-left, so the
// two absolutely positioned overlays don't collide. See the usage site below
// for why this needs position: absolute at all.
const GUIDE_LINE_CONTROLS_STYLE = {
  position: 'absolute' as const,
  top: 8,
  left: 8,
  zIndex: 1000,
  background: 'white',
  padding: 8,
  borderRadius: 4,
}

// Third corner (bottom-left), same absolute-overlay treatment as LayerPanel
// (top-right) and the guide-line controls (top-left) — see those for why
// position: absolute + zIndex: 1000 is required here at all. Bottom-left
// keeps this clear of both existing panels.
const EDIT_CONTROLS_STYLE = {
  position: 'absolute' as const,
  bottom: 8,
  left: 8,
  zIndex: 1000,
  background: 'white',
  padding: 8,
  borderRadius: 4,
}

// Fourth and last free corner (bottom-right) — LayerPanel has top-right,
// the guide-line controls top-left, the edit-mode controls bottom-left. See
// OrthogonalitySuggestion.tsx's doc comment for why the deviation
// text/buttons live here instead of inside the Leaflet tree alongside the
// Polyline preview it renders.
const ORTHOGONALITY_PANEL_STYLE = {
  position: 'absolute' as const,
  bottom: 8,
  right: 8,
  zIndex: 1000,
  background: 'white',
  padding: 8,
  borderRadius: 4,
}

export function SiteMapView({ planId, missionOrigin }: SiteMapViewProps) {
  const [instances, setInstances] = useState<GridInstance[]>([])
  const [linesByInstance, setLinesByInstance] = useState<Record<string, GridLine[]>>({})
  const [feltPoints, setFeltPoints] = useState<FeltPoint[]>([])
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [guideLineBearing, setGuideLineBearing] = useState<number | null>(null)
  const [guideLineAnchor, setGuideLineAnchor] = useState<Point | null>(null)
  const [placingGuideLine, setPlacingGuideLine] = useState(false)
  const [customBearingInput, setCustomBearingInput] = useState('')
  // Single global edit-mode toggle (not per-layer) — Laurent works on one
  // network at a time in the field, so whichever grid layer is currently
  // visible becomes editable; see EDIT_CONTROLS_STYLE usage below.
  const [editMode, setEditMode] = useState(false)
  const [undoStack, setUndoStack] = useState<Record<string, GridLine[]>>({}) // per gridInstanceId
  // Tracks the line most recently touched by a drag/reset, so the single
  // "Annuler"/"Réinitialiser" panel knows which instance/line to act on
  // without a per-line picker UI (not specified by the plan; kept minimal).
  const [lastChangedLine, setLastChangedLine] = useState<{ instanceId: string; lineId: string } | null>(null)
  // Set to a GridLine id right after it's adjusted (drag or reset), so the
  // orthogonality-assist panel (bottom-right, see ORTHOGONALITY_PANEL_STYLE)
  // knows which line to preview/offer straightening for. Cleared on accept
  // or dismiss.
  const [awaitingOrthogonalityReview, setAwaitingOrthogonalityReview] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [loadedInstances, loadedPoints] = await Promise.all([
          listGridInstancesForPlan(planId),
          listFeltPointsForPlan(planId),
        ])
        setInstances(loadedInstances)
        setFeltPoints(loadedPoints)
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

  function handleGuideLineMapClick(latlng: { lat: number; lng: number }) {
    setGuideLineAnchor(latLngToLocal(latlng, missionOrigin))
    setPlacingGuideLine(false)
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

  function handleLineChanged(instanceId: string, updated: GridLine) {
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
    setAwaitingOrthogonalityReview(updated.id)
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
    handleLineChanged(instanceId, resetToTheoretical(line))
  }

  function toggleLayer(id: string) {
    const currentlyVisible = visibility[id] ?? id === FELT_POINTS_LAYER_ID
    setVisibility((prev) => ({ ...prev, [id]: !currentlyVisible }))
  }

  function colorForNetwork(networkName: string): string {
    const match = instances.find((i) => i.templateSnapshot.name === networkName)
    return match?.templateSnapshot.color ?? '#888888'
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
        onMapClick={placingGuideLine ? handleGuideLineMapClick : undefined}
      >
        <FeltPointsLayer
          points={feltPoints}
          colorForNetwork={colorForNetwork}
          missionOrigin={missionOrigin}
          visible={visibility[FELT_POINTS_LAYER_ID] ?? true}
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
                  onChanged={(updated) => handleLineChanged(instance.id, updated)}
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
      </MapView>
      <LayerPanel gridLayers={gridLayers} visibility={visibility} onToggle={toggleLayer} />
      {/* Positioned top-left (absolute), mirroring LayerPanel's top-right
          treatment, for the same reason documented on LayerPanel's
          PANEL_STYLE: SiteMapView's wrapping div is position: relative with a
          fixed-height parent (MissionWorkspace's MAP_WRAPPER_STYLE), so an
          unpositioned sibling would flow below the map box and spill outside
          the visible area instead of overlaying it. Top-left keeps it clear
          of LayerPanel's top-right checkboxes. */}
      <div style={GUIDE_LINE_CONTROLS_STYLE}>
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
        <button onClick={() => setPlacingGuideLine(true)} disabled={guideLineBearing === null}>
          Placer ici
        </button>
        <button onClick={handleClearGuideLine} disabled={guideLineAnchor === null}>
          Effacer
        </button>
      </div>
      {/* Bottom-left (absolute), the third corner — see EDIT_CONTROLS_STYLE
          above for why this needs position: absolute at all, and why this
          corner was chosen (clear of LayerPanel top-right and the guide-line
          controls top-left). A single global "Mode édition" toggle, not a
          per-layer one: Laurent edits one visible network at a time in the
          field, so whichever grid layer is currently toggled visible becomes
          draggable while this is on. "Annuler"/"Réinitialiser" act on the
          line most recently dragged or reset (lastChangedLine) rather than
          through a per-line picker, since that line is always the one
          Laurent just touched. */}
      <div style={EDIT_CONTROLS_STYLE}>
        <label>
          <input type="checkbox" checked={editMode} onChange={() => setEditMode((v) => !v)} />
          Mode édition (caler sur le ressenti)
        </label>
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
      {/* Bottom-right (absolute), the fourth and last free corner — see
          ORTHOGONALITY_PANEL_STYLE above for why this needs position:
          absolute at all, why this corner was chosen, and why the text and
          buttons are rendered here rather than alongside the <Polyline>
          preview (OrthogonalitySuggestion, rendered inside <MapView> above).
          Shown after every line adjustment (handleLineChanged sets
          awaitingOrthogonalityReview); "Redresser" replaces the line's
          adjustedPoints with the suggested straightened points (going
          through handleLineChanged itself, so it's undoable/persisted the
          same way a drag or reset is); "Ignorer" just dismisses the panel. */}
      {reviewTarget && reviewSuggestion && (
        <div style={ORTHOGONALITY_PANEL_STYLE}>
          <p>Écart à l'orthogonal théorique : {reviewSuggestion.deviationDeg.toFixed(1)}°</p>
          <button
            onClick={() => {
              handleLineChanged(reviewTarget.instance.id, {
                ...reviewTarget.line,
                adjustedPoints: reviewSuggestion.suggestedPoints,
              })
              setAwaitingOrthogonalityReview(null)
            }}
          >
            Redresser
          </button>
          <button onClick={() => setAwaitingOrthogonalityReview(null)}>Ignorer</button>
        </div>
      )}
    </div>
  )
}

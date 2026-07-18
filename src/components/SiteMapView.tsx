import { useEffect, useState } from 'react'
import { MapView } from './MapView'
import { NetworkLinesLayer } from './NetworkLinesLayer'
import { FeltPointsLayer } from './FeltPointsLayer'
import { GuideLineLayer } from './GuideLineLayer'
import { LayerPanel, FELT_POINTS_LAYER_ID, type LayerEntry } from './LayerPanel'
import { listGridInstancesForPlan } from '../data/gridInstancesRepo'
import { listGridLinesForInstance } from '../data/gridLinesRepo'
import { listFeltPointsForPlan } from '../data/feltPointsRepo'
import type { GridInstance, GridLine, FeltPoint, Point } from '../domain/types'
import { latLngToLocal, type LatLng } from '../geometry/localCoordinates'

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
    // Reset the whole tool, not just the placed anchor, so Laurent starts
    // clean rather than keeping a stale bearing selected with no line shown.
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

  function toggleLayer(id: string) {
    const currentlyVisible = visibility[id] ?? id === FELT_POINTS_LAYER_ID
    setVisibility((prev) => ({ ...prev, [id]: !currentlyVisible }))
  }

  function colorForNetwork(networkName: string): string {
    const match = instances.find((i) => i.templateSnapshot.name === networkName)
    return match?.templateSnapshot.color ?? '#888888'
  }

  if (error) return <p role="alert">{error}</p>

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
        {instances.map((instance) => (
          <NetworkLinesLayer
            key={instance.id}
            lines={linesByInstance[instance.id] ?? []}
            templateSnapshot={instance.templateSnapshot}
            missionOrigin={missionOrigin}
            visible={visibility[instance.id] ?? false}
          />
        ))}
        <GuideLineLayer anchor={guideLineAnchor} bearingDeg={guideLineBearing} missionOrigin={missionOrigin} />
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
        <button onClick={() => setGuideLineBearing(0)}>N/S</button>
        <button onClick={() => setGuideLineBearing(90)}>E/O</button>
        <button onClick={() => setGuideLineBearing(45)}>45°</button>
        <button onClick={() => setGuideLineBearing(135)}>135°</button>
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
    </div>
  )
}

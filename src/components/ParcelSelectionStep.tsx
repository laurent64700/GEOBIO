import { useEffect, useState } from 'react'
import { MapView } from './MapView'
import { ParcelPicker } from './ParcelPicker'
import { fetchParcelsInBounds, type CadastralParcel } from '../data/cadastreService'
import { boundsAround } from '../geometry/boundsAround'
import type { LatLng } from '../geometry/localCoordinates'

// Wide enough to comfortably cover a handful of adjacent rural parcels
// around a mission's origin point without pulling in unrelated ones.
const SEARCH_RADIUS_M = 150

const FLEX_COLUMN_FULL_HEIGHT_STYLE = { display: 'flex', flexDirection: 'column' as const, height: '100%' }
const MAP_WRAPPER_STYLE = { flex: 1, minHeight: 0 }

export interface ParcelSelectionStepProps {
  missionOrigin: LatLng
  onConfirm: (selectedParcels: CadastralParcel[]) => void
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function ParcelSelectionStep({ missionOrigin, onConfirm }: ParcelSelectionStepProps) {
  const [parcels, setParcels] = useState<CadastralParcel[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    fetchParcelsInBounds(boundsAround(missionOrigin, SEARCH_RADIUS_M))
      .then((result) => {
        if (!cancelled) setParcels(result)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(messageOf(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionOrigin.lat, missionOrigin.lng])

  function toggle(parcelId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(parcelId)) next.delete(parcelId)
      else next.add(parcelId)
      return next
    })
  }

  return (
    <div style={FLEX_COLUMN_FULL_HEIGHT_STYLE}>
      <p>
        Sélectionnez les parcelles cadastrales qui constituent votre terrain de mission (cliquez sur une
        parcelle pour la cocher/décocher).
      </p>
      {loading && <p>Chargement des parcelles…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      <div style={MAP_WRAPPER_STYLE}>
        <MapView center={[missionOrigin.lat, missionOrigin.lng]} zoom={18}>
          <ParcelPicker parcels={parcels} selectedIds={selectedIds} onToggle={toggle} />
        </MapView>
      </div>
      <button
        type="button"
        disabled={selectedIds.size === 0}
        onClick={() => onConfirm(parcels.filter((p) => selectedIds.has(p.id)))}
      >
        Valider la sélection ({selectedIds.size})
      </button>
    </div>
  )
}

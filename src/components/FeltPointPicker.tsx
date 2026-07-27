import { useState } from 'react'
import { allowedBearingsForNetwork } from '../domain/networkBearings'

export interface FeltPointPickerProps {
  activeNetworkName: string | null
  onSelectNetwork: (networkName: string | null) => void
  /** Orientation of the 1m segment about to be placed — only meaningful
   * while a network is armed. */
  selectedBearing: number | null
  onSelectBearing: (bearingDeg: number) => void
  /**
   * True once a map click has already staged a pendingFeltSegment: the
   * orientation was baked into that segment's geometry at click time, so an
   * orientation button pressed now would silently do nothing (it only ever
   * affects the NEXT click). Hiding the buttons here avoids that trap —
   * found live 2026-07-23 while testing grid recalibration.
   */
  bearingLocked?: boolean
}

// Same labels as the guide-line preset buttons (Chunk 3) — 0°/90° for the
// 0°-family networks, 45°/135° for the 45°-family ones. A custom ("Autre")
// network has no known family (allowedBearingsForNetwork returns null), so
// it falls back to the same [0, 90] pair as a sensible default rather than
// offering no orientation choice at all.
const DEFAULT_BEARING_FAMILY: [number, number] = [0, 90]

function bearingLabel(deg: number): string {
  if (deg === 0) return 'N/S'
  if (deg === 90) return 'E/O'
  return `${deg}°`
}

// The 5 confirmed telluric networks (spec §2/§4 — same table as the guide-line
// constraint in Chunk 3). Free text ("Autre") covers any networkName not in
// this fixed list — FeltPoint.networkName is free text in the domain model,
// not a closed enum (see domain/types.ts's comment on FeltPoint).
const KNOWN_NETWORKS = ['Hartmann', 'Curry', 'Palm', 'Peyré', 'Wissmann']

// Same select/toggle-off pattern as PhenomenonPicker: clicking a network arms
// placement mode for the next map click; clicking the already-active network
// again deselects it (aria-pressed mirrors PhenomenonPicker's convention).
// activeNetworkName is fully controlled by the parent (mirrors placementMode
// in usePlacementMode) — any value not in KNOWN_NETWORKS is treated as an
// armed custom ("Autre") network, so "Autre" can be deselected the same way
// a known network can, not just closed back to an empty text field.
export function FeltPointPicker({
  activeNetworkName,
  onSelectNetwork,
  selectedBearing,
  onSelectBearing,
  bearingLocked = false,
}: FeltPointPickerProps) {
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customName, setCustomName] = useState('')

  const isCustomActive = activeNetworkName !== null && !KNOWN_NETWORKS.includes(activeNetworkName)
  const bearingFamily = allowedBearingsForNetwork(activeNetworkName) ?? DEFAULT_BEARING_FAMILY

  function handleSelect(name: string) {
    onSelectNetwork(activeNetworkName === name ? null : name)
  }

  function handleToggleCustom() {
    if (isCustomActive) {
      onSelectNetwork(null)
      return
    }
    setShowCustomInput((v) => !v)
  }

  function handleSubmitCustom() {
    const trimmed = customName.trim()
    if (trimmed === '') return
    onSelectNetwork(trimmed)
    setCustomName('')
    setShowCustomInput(false)
  }

  return (
    <div>
      <p>Placer un point ressenti</p>
      {KNOWN_NETWORKS.map((name) => (
        <button key={name} aria-pressed={activeNetworkName === name} onClick={() => handleSelect(name)}>
          {name}
        </button>
      ))}
      <button aria-pressed={isCustomActive || showCustomInput} onClick={handleToggleCustom}>
        Autre
      </button>
      {showCustomInput && !isCustomActive && (
        <>
          <input
            aria-label="Nom du réseau"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
          <button onClick={handleSubmitCustom}>Valider</button>
        </>
      )}
      {activeNetworkName !== null && !bearingLocked && (
        <>
          {bearingFamily.map((deg) => (
            <button key={deg} aria-pressed={selectedBearing === deg} onClick={() => onSelectBearing(deg)}>
              {bearingLabel(deg)}
            </button>
          ))}
        </>
      )}
    </div>
  )
}

import { useState } from 'react'

export interface FeltPointPickerProps {
  activeNetworkName: string | null
  onSelectNetwork: (networkName: string | null) => void
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
export function FeltPointPicker({ activeNetworkName, onSelectNetwork }: FeltPointPickerProps) {
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customName, setCustomName] = useState('')

  const isCustomActive = activeNetworkName !== null && !KNOWN_NETWORKS.includes(activeNetworkName)

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
    </div>
  )
}

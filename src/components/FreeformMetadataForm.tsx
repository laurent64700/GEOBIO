// src/components/FreeformMetadataForm.tsx
import { useState } from 'react'

export interface FreeformMetadata {
  currentBearingDeg: number | null
  depthM: number | null
  flowRate: string | null
}

export interface FreeformMetadataFormProps {
  onSubmit: (metadata: FreeformMetadata) => void
  onCancel: () => void
}

export function FreeformMetadataForm({ onSubmit, onCancel }: FreeformMetadataFormProps) {
  const [bearingInput, setBearingInput] = useState('')
  const [depthInput, setDepthInput] = useState('')
  const [flowRate, setFlowRate] = useState('')

  function handleSubmit() {
    onSubmit({
      currentBearingDeg: bearingInput.trim() === '' ? null : Number(bearingInput),
      depthM: depthInput.trim() === '' ? null : Number(depthInput),
      flowRate: flowRate.trim() === '' ? null : flowRate,
    })
  }

  return (
    <div>
      <label>
        Sens du courant (degrés)
        <input type="number" value={bearingInput} onChange={(e) => setBearingInput(e.target.value)} />
      </label>
      <label>
        Profondeur (m)
        <input type="number" step="0.1" value={depthInput} onChange={(e) => setDepthInput(e.target.value)} />
      </label>
      <label>
        Débit
        <input type="text" value={flowRate} onChange={(e) => setFlowRate(e.target.value)} />
      </label>
      <button onClick={handleSubmit} aria-label="Valider le tracé">Valider</button>
      <button onClick={onCancel}>Annuler</button>
    </div>
  )
}

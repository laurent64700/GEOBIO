// src/components/FeltSegmentPolarityForm.tsx
import { useState } from 'react'
import type { GridLinePolarity } from '../domain/types'

export interface FeltSegmentPolarity {
  polarityA: GridLinePolarity
  polarityB: GridLinePolarity
}

export interface FeltSegmentPolarityFormProps {
  onSubmit: (polarity: FeltSegmentPolarity) => void
  onCancel: () => void
}

function opposite(polarity: GridLinePolarity): GridLinePolarity {
  return polarity === '+' ? '-' : '+'
}

// Shown once a 1m segment has been placed for a network felt point (spec:
// Laurent chooses polarity manually at each end, every time — no inferred
// default beyond the initial A='+'/B='-' starting point). Each button shows
// its END's CURRENT value; clicking flips just that end.
export function FeltSegmentPolarityForm({ onSubmit, onCancel }: FeltSegmentPolarityFormProps) {
  const [polarityA, setPolarityA] = useState<GridLinePolarity>('+')
  const [polarityB, setPolarityB] = useState<GridLinePolarity>('-')

  return (
    <div>
      <p>Polarité de chaque extrémité</p>
      <button onClick={() => setPolarityA(opposite(polarityA))}>Extrémité A : {polarityA}</button>
      <button onClick={() => setPolarityB(opposite(polarityB))}>Extrémité B : {polarityB}</button>
      <button onClick={() => onSubmit({ polarityA, polarityB })}>Valider le segment</button>
      <button onClick={onCancel}>Annuler</button>
    </div>
  )
}

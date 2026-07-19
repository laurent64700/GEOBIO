// src/domain/baguaCorrespondences.ts
import type { CompassDirection } from '../geometry/bagua'

export interface BaguaCorrespondence {
  label: string
  element: string
  correctiveObjects: string[]
}

// Placeholder values for N/NE/SE/SW/W/NW — cross-reference against the full
// "6 - La grille Pakua" chapter (Polizzi, GQH) before relying on these for a
// real mission report. N/E/S entries below match examples already confirmed
// from that chapter during this feature's design (spec §1/§6).
export const baguaCorrespondences: Record<CompassDirection, BaguaCorrespondence> = {
  N: { label: 'Carrière', element: 'Eau', correctiveObjects: ['fontaine'] },
  NE: { label: 'Connaissance', element: 'Terre', correctiveObjects: ['composition dans un bac à fleurs'] },
  E: { label: 'Famille', element: 'Bois', correctiveObjects: ['plante en pot'] },
  SE: { label: 'Prospérité', element: 'Bois', correctiveObjects: ['plante en pot'] },
  S: { label: 'Renommée', element: 'Feu', correctiveObjects: ['bougie', 'éclairage'] },
  SW: { label: 'Relations', element: 'Terre', correctiveObjects: ['composition dans un bac à fleurs'] },
  W: { label: 'Créativité', element: 'Métal', correctiveObjects: ['objet métallique'] },
  NW: { label: 'Amis utiles', element: 'Métal', correctiveObjects: ['objet métallique'] },
}

// src/domain/baguaCorrespondences.ts
import type { CompassDirection } from '../geometry/bagua'

export interface BaguaCorrespondence {
  label: string
  element: string
  correctiveObjects: string[]
}

// Confirmation status per sector (the plan's original comment contradicted
// itself, listing N both as a placeholder and as confirmed — resolved here
// against the design sources):
// - N is the only fully-confirmed entry: the design spec fixes "Carrière" at
//   north (spec §3, compass method) and the book examples it quotes confirm
//   Eau → fontaine (spec §2).
// - NE/E/SE/S/SW/W/NW are PLACEHOLDERS — nothing in the spec or plan sources
//   their labels/elements/objects; cross-reference all seven against the full
//   "6 - La grille Pakua" chapter (Polizzi, GQH) before relying on this table
//   for a real mission report. Note in particular that the book example
//   "Montagne → bloc de minéral" (spec §2) appears nowhere below — NE (trigram
//   Gen = Montagne in the classical Pakua) is currently guessed as
//   Terre/bac à fleurs and may well be wrong.
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

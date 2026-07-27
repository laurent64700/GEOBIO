import type { ContextObjectKind } from './types'
import sofaSvg from '../assets/icons/context/sofa.svg?raw'
import tableSvg from '../assets/icons/context/table.svg?raw'
import roundTableSvg from '../assets/icons/context/round-table.svg?raw'
import bedSvg from '../assets/icons/context/bed.svg?raw'
import oakSvg from '../assets/icons/context/oak.svg?raw'
import pineTreeSvg from '../assets/icons/context/pine-tree.svg?raw'
import berryBushSvg from '../assets/icons/context/berry-bush.svg?raw'
import wellSvg from '../assets/icons/context/well.svg?raw'
import brickWallSvg from '../assets/icons/context/brick-wall.svg?raw'
import stoneWallSvg from '../assets/icons/context/stone-wall.svg?raw'
import roadSvg from '../assets/icons/context/road.svg?raw'
import stakesFenceSvg from '../assets/icons/context/stakes-fence.svg?raw'

export type ContextObjectCategory = 'interieur' | 'exterieur'

export interface ContextObjectKindInfo {
  kind: ContextObjectKind
  label: string
  category: ContextObjectCategory
  svg: string
}

// Icon sources: game-icons.net (CC BY 3.0) — see src/assets/icons/context/ATTRIBUTION.md.
// Color mirrors NON_GRID_NETWORK_COLORS' plain-code-owned-constant pattern
// (networkColors.ts) rather than anything network-specific — context
// objects aren't tied to a telluric network.
export const CONTEXT_OBJECT_COLOR = '#5d4037'

export const CONTEXT_OBJECT_KINDS: ContextObjectKindInfo[] = [
  { kind: 'canape', label: 'Canapé', category: 'interieur', svg: sofaSvg },
  { kind: 'table', label: 'Table', category: 'interieur', svg: tableSvg },
  { kind: 'table-ronde', label: 'Table ronde', category: 'interieur', svg: roundTableSvg },
  { kind: 'lit', label: 'Lit', category: 'interieur', svg: bedSvg },
  { kind: 'arbre-chene', label: 'Arbre (chêne)', category: 'exterieur', svg: oakSvg },
  { kind: 'arbre-pin', label: 'Arbre (pin)', category: 'exterieur', svg: pineTreeSvg },
  { kind: 'haie', label: 'Haie', category: 'exterieur', svg: berryBushSvg },
  { kind: 'puits', label: 'Puits', category: 'exterieur', svg: wellSvg },
  { kind: 'mur-briques', label: 'Mur (briques)', category: 'exterieur', svg: brickWallSvg },
  { kind: 'mur-pierre', label: 'Mur (pierre)', category: 'exterieur', svg: stoneWallSvg },
  { kind: 'route', label: 'Route', category: 'exterieur', svg: roadSvg },
  { kind: 'cloture', label: 'Clôture', category: 'exterieur', svg: stakesFenceSvg },
]

export function contextObjectKindInfo(kind: ContextObjectKind): ContextObjectKindInfo {
  const info = CONTEXT_OBJECT_KINDS.find((k) => k.kind === kind)
  if (!info) throw new Error(`Type d'objet de contexte inconnu : ${kind}`)
  return info
}

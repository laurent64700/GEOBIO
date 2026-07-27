import type { PhenomenonKind } from './types'
import chimneySvg from '../assets/icons/phenomena/chimney.svg?raw'
import spiralArrowSvg from '../assets/icons/phenomena/spiral-arrow.svg?raw'
import starFormationSvg from '../assets/icons/phenomena/star-formation.svg?raw'
import ticTacToeSvg from '../assets/icons/phenomena/tic-tac-toe.svg?raw'
import obeliskSvg from '../assets/icons/phenomena/obelisk.svg?raw'

export interface PhenomenonIconInfo {
  svg: string
  /** Small corner badge distinguishing the 4 "cheminée" kinds, which all
   * share one icon (no exact 1/2/3/4-branch icon exists in a generic set —
   * see src/assets/icons/phenomena/ATTRIBUTION.md). */
  badge?: string
}

// No exact icon exists for these esoteric/geobiology-specific concepts in a
// generic icon set — these are the closest reasonable visual stand-ins
// (game-icons.net, CC BY 3.0), not literal illustrations. Chosen over
// PhenomenaLayer's previous plain text-code circles ("Ch1", "Vx"...) to
// harmonize with the context-object markers (spec: "harmoniser pour être
// UX friendly").
export const PHENOMENON_ICONS: Record<PhenomenonKind, PhenomenonIconInfo> = {
  'cheminee-1': { svg: chimneySvg, badge: '1' },
  'cheminee-2': { svg: chimneySvg, badge: '2' },
  'cheminee-3': { svg: chimneySvg, badge: '3' },
  'cheminee-4': { svg: chimneySvg, badge: '4' },
  'spire-vortex': { svg: spiralArrowSvg },
  'point-cosmique': { svg: starFormationSvg },
  'carre-magique': { svg: ticTacToeSvg },
  'tube-magique': { svg: obeliskSvg },
}

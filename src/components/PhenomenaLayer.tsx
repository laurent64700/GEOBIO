import { IconMarker } from './IconMarker'
import { PHENOMENON_ICONS } from '../domain/phenomenonIcons'
import type { Phenomenon } from '../domain/types'
import type { LatLng } from '../geometry/localCoordinates'

export interface PhenomenaLayerProps {
  phenomena: Phenomenon[]
  missionOrigin: LatLng
  visible: boolean
}

const PHENOMENON_COLOR = '#6a1b9a'

// Upgraded from plain text-code circles ("Ch1", "Vx"...) to real icons
// (game-icons.net stand-ins — see phenomenonIcons.ts) to harmonize with the
// context-object markers (spec: "harmoniser pour être UX friendly").
export function PhenomenaLayer({ phenomena, missionOrigin, visible }: PhenomenaLayerProps) {
  if (!visible) return null

  return (
    <>
      {phenomena.map((phenomenon) => {
        const { svg, badge } = PHENOMENON_ICONS[phenomenon.kind]
        return (
          <IconMarker
            key={phenomenon.id}
            position={phenomenon}
            missionOrigin={missionOrigin}
            svg={svg}
            color={PHENOMENON_COLOR}
            badge={badge}
          />
        )
      })}
    </>
  )
}

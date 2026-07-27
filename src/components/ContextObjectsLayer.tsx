import { IconMarker } from './IconMarker'
import { CONTEXT_OBJECT_COLOR, contextObjectKindInfo } from '../domain/contextObjectKinds'
import type { ContextObject } from '../domain/types'
import type { LatLng } from '../geometry/localCoordinates'

export interface ContextObjectsLayerProps {
  objects: ContextObject[]
  missionOrigin: LatLng
  visible: boolean
}

export function ContextObjectsLayer({ objects, missionOrigin, visible }: ContextObjectsLayerProps) {
  if (!visible) return null

  return (
    <>
      {objects.map((object) => (
        <IconMarker
          key={object.id}
          position={object}
          missionOrigin={missionOrigin}
          svg={contextObjectKindInfo(object.kind).svg}
          color={CONTEXT_OBJECT_COLOR}
        />
      ))}
    </>
  )
}

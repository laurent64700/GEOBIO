import { useState } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'

// Live current zoom level, re-rendering the caller on every zoom change —
// used by network-line layers to keep their real-world width (see
// lineWeightForZoom.ts) accurate as the user zooms in/out. zoomAnimation is
// disabled app-wide (MapView.tsx), so 'zoomend' fires immediately, with no
// separate 'zoom' events to also listen for.
export function useMapZoom(): number {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({
    zoomend() {
      setZoom(map.getZoom())
    },
  })
  return zoom
}

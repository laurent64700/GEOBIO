import type { ReactNode } from 'react'
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// IGN Géoplateforme WMTS endpoint (data.geopf.fr) — free, keyless access to
// the standard orthophoto layer as of this plan's writing (spec §3.1/§4).
// ⚠️ VERIFY against https://geoservices.ign.fr/documentation before relying
// on it: IGN has changed this endpoint's domain and auth scheme before, and
// may again — this constant is the single place to update if so.
const IGN_ORTHOPHOTO_WMTS_URL =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile' +
  '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg'

function ClickHandler({ onMapClick }: { onMapClick: (latlng: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

export interface MapViewProps {
  /** [latitude, longitude] */
  center: [number, number]
  zoom?: number
  onMapClick?: (latlng: { lat: number; lng: number }) => void
  children?: ReactNode
}

export function MapView({ center, zoom = 18, onMapClick, children }: MapViewProps) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      maxZoom={20}
      // Leaflet's animated zoom (the default) hands control of finishing the
      // zoom to a requestAnimationFrame callback plus a CSS transitionend
      // listener, with only a 250ms setTimeout as a last-resort fallback
      // (see leaflet's Map._tryAnimatedZoom/_animateZoom/_onZoomTransitionEnd).
      // Root-caused a real bug where zoom got permanently stuck (every
      // zoom-in control, scroll, dblclick, and keyboard +/- silently did
      // nothing) back to this: setZoom() had already returned assuming the
      // animation would finish the job, but the animation's completion never
      // ran. For a field tool where placing a point to within ~10cm requires
      // reliably zooming in close (spec: parcel-level precision), a disabled
      // animation is strictly better than an occasionally-stuck one — this
      // makes every zoom change immediate and synchronous, removing the
      // entire class of bug rather than chasing why the animation callback
      // doesn't fire in some environments.
      zoomAnimation={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer url={IGN_ORTHOPHOTO_WMTS_URL} attribution="&copy; IGN-F/Géoportail" maxZoom={20} />
      {onMapClick && <ClickHandler onMapClick={onMapClick} />}
      {children}
    </MapContainer>
  )
}

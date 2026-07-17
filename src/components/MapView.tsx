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
}

export function MapView({ center, zoom = 18, onMapClick }: MapViewProps) {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      <TileLayer url={IGN_ORTHOPHOTO_WMTS_URL} attribution="&copy; IGN-F/Géoportail" maxZoom={20} />
      {onMapClick && <ClickHandler onMapClick={onMapClick} />}
    </MapContainer>
  )
}

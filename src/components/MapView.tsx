import type { CSSProperties, ReactNode } from 'react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { useMapZoom } from '../hooks/useMapZoom'
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

// Fits the view to `bounds` exactly once, on mount — e.g. after a parcel
// selection is confirmed, so the map recenters/zooms to that selection
// without fighting the `center`/`zoom` props that every other caller relies
// on for their initial view. Also sets that same bounds' own zoom level as
// the map's minZoom floor: without it, nothing stops zooming out to see all
// of France, which is never useful once a specific site's parcels are known
// (Laurent, field testing 08/2026). getBoundsZoom computes the zoom level
// fitBounds itself would use at the CURRENT container size — reusing it
// keeps "as far out as the initial fit" and "as far out as you can manually
// scroll" the exact same value, not two independently-tuned constants.
// Only missions that went through a fresh parcel confirmation THIS session
// carry `fitBounds` (see MissionWorkspace.tsx) — a resumed mission has none
// tracked, and keeps the default unbounded range; not fixed here, a known,
// narrower gap than the unconstrained-everywhere behavior before this.
function FitBoundsOnce({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    map.fitBounds(bounds)
    map.setMinZoom(map.getBoundsZoom(bounds))
  }, [])
  return null
}

// Past the real orthophoto imagery's native resolution (MAX_NATIVE_TILE_ZOOM),
// Leaflet just upscales the last real tile — a blurry, uninformative image
// that's actively distracting once placing points at cm-level precision
// (Laurent, field testing 08/2026: "zoom max au cm en passant de l'image IGN
// à un aplat sans image"). This backdrop replaces it with a plain pale-green
// + light grid surface once zoomed past that point, so there's a clean,
// neutral canvas to draw on rather than a smeared photo. Portaled directly
// into the map's own container (not a Leaflet Pane) at a z-index between
// Leaflet's tilePane (200) and overlayPane (400) — covers the (still-loaded,
// just visually hidden-behind-this) tile imagery without covering anything
// drawn on top of it (network grid lines, felt points/segments, markers...).
const HIGH_ZOOM_BACKDROP_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 350,
  background:
    'linear-gradient(#c8e6c9 1px, transparent 1px), ' +
    'linear-gradient(90deg, #c8e6c9 1px, transparent 1px), ' +
    '#e8f5e9',
  backgroundSize: '20px 20px, 20px 20px, 100% 100%',
  pointerEvents: 'none',
}

function HighZoomBackdrop() {
  const map = useMap()
  const zoom = useMapZoom()
  if (zoom <= MAX_NATIVE_TILE_ZOOM) return null
  return createPortal(<div data-testid="high-zoom-backdrop" style={HIGH_ZOOM_BACKDROP_STYLE} />, map.getContainer())
}

export interface MapViewProps {
  /** [latitude, longitude] */
  center: [number, number]
  zoom?: number
  onMapClick?: (latlng: { lat: number; lng: number }) => void
  /** When provided, the view fits to these bounds once on mount instead of using center/zoom directly. */
  fitBounds?: LatLngBoundsExpression
  children?: ReactNode
}

// IGN's real orthophoto tile coverage varies by region — rural/less-populated
// communes are frequently only flown/published up to native zoom 19, while
// dense urban areas often go to 20-21. Confirmed directly against the WMTS
// endpoint for a real rural test address (30130 Saint Alexandre): z19
// returns a real JPEG tile, z20 returns an HTTP 404 (XML error body) for the
// exact same ground location. maxNativeZoom=19 tells Leaflet "don't request
// tiles past z19, upscale the last real tile instead" — allowing the UI to
// keep zooming past the native imagery resolution (for finer click/placement
// precision, which only depends on the lat/lng math, not image sharpness)
// without ever hitting a blank/404 tile. maxZoom stays higher than
// maxNativeZoom specifically so this UI zoom headroom exists.
const MAX_UI_ZOOM = 21
const MAX_NATIVE_TILE_ZOOM = 19

export function MapView({ center, zoom = 18, onMapClick, fitBounds, children }: MapViewProps) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      maxZoom={MAX_UI_ZOOM}
      // Leaflet's own default zoom +/- buttons are large and, per Laurent's
      // field-testing feedback (08/2026), unnecessary — scroll/pinch/keyboard
      // zoom already work without them, and the guide-line/network buttons
      // are the actual primary controls on this screen.
      zoomControl={false}
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
      <TileLayer
        url={IGN_ORTHOPHOTO_WMTS_URL}
        attribution="&copy; IGN-F/Géoportail"
        maxZoom={MAX_UI_ZOOM}
        maxNativeZoom={MAX_NATIVE_TILE_ZOOM}
      />
      <HighZoomBackdrop />
      {onMapClick && <ClickHandler onMapClick={onMapClick} />}
      {fitBounds && <FitBoundsOnce bounds={fitBounds} />}
      {children}
    </MapContainer>
  )
}

// src/data/cadastreService.ts
import type { LatLng } from '../geometry/localCoordinates'
import { polygonPartsToLatLng, type WfsGeometry } from './wfsGeometry'

export interface CadastralParcel {
  id: string
  section: string
  ringsLatLng: LatLng[][]
}

export interface LatLngBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

// Verified 2026-07-19 against IGN Géoplateforme docs: TYPENAME and the numero/section
// property names are confirmed correct; no API key/auth required for this WFS endpoint
// (rate-limited to 30 req/s per IP). Still worth confirming once against a live
// GetCapabilities/DescribeFeatureType call before relying on this in production:
// https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=DescribeFeatureType&TYPENAME=CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle
const CADASTRE_WFS_URL = 'https://data.geopf.fr/wfs/ows'
const PARCEL_TYPE_NAME = 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle'

// A MultiPolygon parcel (several disjoint parts) yields one CadastralParcel
// per part, all sharing the same id/section — see polygonPartsToLatLng's doc
// comment for why parts become separate entries rather than being flattened
// into one ringsLatLng (that shape only holds ONE polygon's rings).
// Non-polygonal geometries are skipped instead of silently parsing into NaN
// coordinates.
function parseParcelFeature(feature: {
  properties?: Record<string, unknown>
  geometry: WfsGeometry
}): CadastralParcel[] {
  const props = feature.properties ?? {}
  return polygonPartsToLatLng(feature.geometry).map((ringsLatLng) => ({
    id: String(props.numero ?? 'inconnu'),
    section: String(props.section ?? ''),
    ringsLatLng,
  }))
}

export async function fetchParcelsInBounds(
  bounds: LatLngBounds,
  signal?: AbortSignal
): Promise<CadastralParcel[]> {
  // WFS 2.0.0 with EPSG:4326 uses the CRS authority's defined axis order (lat, lng
  // for EPSG:4326), not the lng/lat convention common in WFS 1.x — confirmed against
  // this endpoint's documented usage 2026-07-19, previously an unverified guess.
  const bbox = `${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng},EPSG:4326`
  const url =
    `${CADASTRE_WFS_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAME=${PARCEL_TYPE_NAME}&OUTPUTFORMAT=application/json&BBOX=${bbox}`

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Impossible de charger les parcelles cadastrales : ${response.status}`)
  }
  const geojson = (await response.json()) as {
    features: Array<{ properties?: Record<string, unknown>; geometry: WfsGeometry }>
  }
  return geojson.features.flatMap(parseParcelFeature)
}

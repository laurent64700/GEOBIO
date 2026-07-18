// src/data/cadastreService.ts
import type { LatLng } from '../geometry/localCoordinates'

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

// ⚠️ VERIFY against https://geoservices.ign.fr/documentation/donnees/vecteur/cadastre
// before relying on this — endpoint, TYPENAME, and property names are a best-effort
// guess, not confirmed against live IGN Géoplateforme docs.
const CADASTRE_WFS_URL = 'https://data.geopf.fr/wfs/ows'
const PARCEL_TYPE_NAME = 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle'

function parseParcelFeature(feature: {
  properties?: Record<string, unknown>
  geometry: { coordinates: number[][][] }
}): CadastralParcel {
  const props = feature.properties ?? {}
  const ringsLatLng: LatLng[][] = feature.geometry.coordinates.map((ring) =>
    ring.map(([lng, lat]) => ({ lat, lng }))
  )
  return {
    id: String(props.numero ?? 'inconnu'),
    section: String(props.section ?? ''),
    ringsLatLng,
  }
}

export async function fetchParcelsInBounds(
  bounds: LatLngBounds,
  signal?: AbortSignal
): Promise<CadastralParcel[]> {
  const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat},EPSG:4326`
  const url =
    `${CADASTRE_WFS_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAME=${PARCEL_TYPE_NAME}&OUTPUTFORMAT=application/json&BBOX=${bbox}`

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Impossible de charger les parcelles cadastrales : ${response.status}`)
  }
  const geojson = (await response.json()) as {
    features: Array<{ properties?: Record<string, unknown>; geometry: { coordinates: number[][][] } }>
  }
  return geojson.features.map(parseParcelFeature)
}

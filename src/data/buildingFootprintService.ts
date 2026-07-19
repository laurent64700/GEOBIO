// src/data/buildingFootprintService.ts
import type { LatLng } from '../geometry/localCoordinates'

export interface BuildingFootprint {
  ringsLatLng: LatLng[][]
}

export interface LatLngBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

// Verified 2026-07-19 against IGN Géoplateforme docs (BDTOPO catalogue): BDTOPO_V3:batiment
// is a real WFS layer on the same endpoint as the cadastral parcels layer used in
// cadastreService.ts, separate from CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle. Not yet
// confirmed via a live GetCapabilities/DescribeFeatureType call — do that once before
// relying on this in production, same caveat as cadastreService.ts.
const CADASTRE_WFS_URL = 'https://data.geopf.fr/wfs/ows'
const BUILDING_TYPE_NAME = 'BDTOPO_V3:batiment'

function parseBuildingFeature(feature: { geometry: { coordinates: number[][][] } }): BuildingFootprint {
  const ringsLatLng: LatLng[][] = feature.geometry.coordinates.map((ring) =>
    ring.map(([lng, lat]) => ({ lat, lng }))
  )
  return { ringsLatLng }
}

export async function fetchBuildingsInBounds(
  bounds: LatLngBounds,
  signal?: AbortSignal
): Promise<BuildingFootprint[]> {
  // WFS 2.0.0 with EPSG:4326 uses the CRS authority's defined axis order (lat, lng) —
  // same convention already verified and fixed in cadastreService.ts 2026-07-19.
  const bbox = `${bounds.minLat},${bounds.minLng},${bounds.maxLat},${bounds.maxLng},EPSG:4326`
  const url =
    `${CADASTRE_WFS_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAME=${BUILDING_TYPE_NAME}&OUTPUTFORMAT=application/json&BBOX=${bbox}`

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Impossible de charger les bâtiments : ${response.status}`)
  }
  const geojson = (await response.json()) as {
    features: Array<{ geometry: { coordinates: number[][][] } }>
  }
  return geojson.features.map(parseBuildingFeature)
}

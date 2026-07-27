// src/data/buildingFootprintService.ts
import type { LatLng } from '../geometry/localCoordinates'
import { polygonPartsToLatLng, type WfsGeometry } from './wfsGeometry'

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

// A MultiPolygon building (several disjoint parts) yields one BuildingFootprint
// per part — see polygonPartsToLatLng's doc comment for why parts become
// separate entries rather than being flattened into one ringsLatLng (that
// shape only holds ONE polygon's rings). Each part is then separately
// clickable in BuildingFootprintPicker, and non-polygonal geometries are
// skipped instead of silently parsing into NaN coordinates.
function parseBuildingFeature(feature: { geometry: WfsGeometry }): BuildingFootprint[] {
  return polygonPartsToLatLng(feature.geometry).map((ringsLatLng) => ({ ringsLatLng }))
}

export async function fetchBuildingsInBounds(
  bounds: LatLngBounds,
  signal?: AbortSignal
): Promise<BuildingFootprint[]> {
  // Same endpoint/bug as cadastreService.ts's fetchParcelsInBounds — see its comment.
  // Verified live 2026-07-23: standard lng,lat (x,y) order, not lat,lng.
  const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat},EPSG:4326`
  const url =
    `${CADASTRE_WFS_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAME=${BUILDING_TYPE_NAME}&OUTPUTFORMAT=application/json&BBOX=${bbox}`

  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Impossible de charger les bâtiments : ${response.status}`)
  }
  const geojson = (await response.json()) as {
    features: Array<{ geometry: WfsGeometry }>
  }
  return geojson.features.flatMap(parseBuildingFeature)
}

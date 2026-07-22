// src/data/geocodingService.ts
import type { LatLng } from '../geometry/localCoordinates'

// Free French address geocoding (BAN — Base Adresse Nationale), no API key
// needed, same family of call as cadastreService.ts's IGN WFS requests
// (spec §8). Centers the map only — never sets the mission origin itself
// (that stays a deliberate click on the exact terrain point, per spec §8).
// Returns null on no-match or any failure — the caller falls back to
// DEFAULT_CENTER, this must never throw or block the flow.
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  try {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`
    const response = await fetch(url)
    if (!response.ok) return null
    const data = await response.json()
    const feature = data.features?.[0]
    if (!feature) return null
    const [lng, lat] = feature.geometry.coordinates
    return { lat, lng }
  } catch {
    return null
  }
}

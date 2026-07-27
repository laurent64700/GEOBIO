// Web Mercator ground resolution at a given latitude/zoom (same formula used
// throughout this project's zoom/precision analysis) — meters represented by
// one screen pixel at Leaflet's standard 256px tile size.
export function metersPerPixel(latDeg: number, zoom: number): number {
  return (156543.03392 * Math.cos((latDeg * Math.PI) / 180)) / 2 ** zoom
}

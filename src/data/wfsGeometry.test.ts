// src/data/wfsGeometry.test.ts
import { describe, it, expect } from 'vitest'
import { polygonPartsToLatLng } from './wfsGeometry'

describe('polygonPartsToLatLng', () => {
  it('normalizes a Polygon into a single part with [lng, lat] converted to {lat, lng}', () => {
    const parts = polygonPartsToLatLng({
      type: 'Polygon',
      coordinates: [
        [
          [2.35, 48.85],
          [2.351, 48.85],
          [2.351, 48.851],
          [2.35, 48.85],
        ],
      ],
    })

    expect(parts).toHaveLength(1)
    expect(parts[0]).toHaveLength(1) // one ring
    expect(parts[0][0][0]).toEqual({ lat: 48.85, lng: 2.35 })
    expect(parts[0][0][2]).toEqual({ lat: 48.851, lng: 2.351 })
  })

  it('preserves a Polygon hole as a second ring of the same part', () => {
    const parts = polygonPartsToLatLng({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 0],
        ],
        [
          [4, 4],
          [6, 4],
          [6, 6],
          [4, 4],
        ],
      ],
    })

    expect(parts).toHaveLength(1)
    expect(parts[0]).toHaveLength(2) // outer ring + hole, GeoJSON order preserved
    expect(parts[0][1][0]).toEqual({ lat: 4, lng: 4 })
  })

  it('normalizes a MultiPolygon into one part per member polygon, each with finite numeric coordinates', () => {
    const parts = polygonPartsToLatLng({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [2.35, 48.85],
            [2.351, 48.85],
            [2.351, 48.851],
            [2.35, 48.85],
          ],
        ],
        [
          [
            [2.36, 48.86],
            [2.361, 48.86],
            [2.361, 48.861],
            [2.36, 48.86],
          ],
        ],
      ],
    })

    expect(parts).toHaveLength(2)
    expect(parts[0][0][0]).toEqual({ lat: 48.85, lng: 2.35 })
    expect(parts[1][0][0]).toEqual({ lat: 48.86, lng: 2.36 })
    // Regression guard for the silent-NaN bug: the old Polygon-only
    // destructuring applied to MultiPolygon input yielded {lat: number[],
    // lng: number[]} — every coordinate must be a plain finite number.
    for (const part of parts) {
      for (const ring of part) {
        for (const { lat, lng } of ring) {
          expect(Number.isFinite(lat)).toBe(true)
          expect(Number.isFinite(lng)).toBe(true)
        }
      }
    }
  })

  it('returns no parts for non-polygonal geometry types instead of producing garbage', () => {
    expect(polygonPartsToLatLng({ type: 'Point', coordinates: [2.35, 48.85] })).toEqual([])
    expect(
      polygonPartsToLatLng({
        type: 'LineString',
        coordinates: [
          [2.35, 48.85],
          [2.36, 48.86],
        ],
      })
    ).toEqual([])
  })
})

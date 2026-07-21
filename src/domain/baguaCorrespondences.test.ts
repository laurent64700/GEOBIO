// src/domain/baguaCorrespondences.test.ts
import { describe, it, expect } from 'vitest'
import { baguaCorrespondences } from './baguaCorrespondences'
import type { CompassDirection } from '../geometry/bagua'

describe('baguaCorrespondences', () => {
  it('has an entry for every compass direction, each with a non-empty label and object list', () => {
    const directions: CompassDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    for (const direction of directions) {
      const entry = baguaCorrespondences[direction]
      expect(entry).toBeDefined()
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.correctiveObjects.length).toBeGreaterThan(0)
    }
  })
})

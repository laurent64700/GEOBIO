import { describe, it, expect } from 'vitest'
import { applyVertexDrag, applyAllVertices, resetToTheoretical, translateGridLine } from './lineEditing'
import type { GridLine } from '../domain/types'

const baseLine: GridLine = {
  id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
  theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
  adjustedPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
}

describe('applyVertexDrag', () => {
  it('replaces only the dragged point, leaving other points and all other fields untouched', () => {
    const updated = applyVertexDrag(baseLine, 0, { x: 0.4, y: -3 })
    expect(updated.adjustedPoints).toEqual([{ x: 0.4, y: -3 }, { x: 0, y: 3 }])
    expect(updated.theoreticalPoints).toBe(baseLine.theoreticalPoints) // untouched reference
    expect(updated.id).toBe(baseLine.id)
  })
})

describe('applyAllVertices', () => {
  it('replaces the whole adjustedPoints array in one update, leaving other fields untouched', () => {
    const updated = applyAllVertices(baseLine, [{ x: 0.4, y: -3 }, { x: 0.1, y: 3 }])
    expect(updated.adjustedPoints).toEqual([{ x: 0.4, y: -3 }, { x: 0.1, y: 3 }])
    expect(updated.theoreticalPoints).toBe(baseLine.theoreticalPoints) // untouched reference
    expect(updated.id).toBe(baseLine.id)
  })
})

describe('resetToTheoretical', () => {
  it('overwrites adjustedPoints with a copy of theoreticalPoints', () => {
    const dragged = applyVertexDrag(baseLine, 0, { x: 0.4, y: -3 })
    const reset = resetToTheoretical(dragged)
    expect(reset.adjustedPoints).toEqual(dragged.theoreticalPoints)
    expect(reset.adjustedPoints).not.toBe(reset.theoreticalPoints) // a copy, not the same array reference
  })
})

describe('translateGridLine', () => {
  it('shifts every theoretical and adjusted point by the same delta, leaving other fields untouched', () => {
    const dragged = applyVertexDrag(baseLine, 0, { x: 0.4, y: -3 }) // an existing manual felt-adjustment
    const translated = translateGridLine(dragged, { x: 2, y: -1 })

    expect(translated.theoreticalPoints).toEqual([{ x: 2, y: -4 }, { x: 2, y: 2 }])
    // the prior manual adjustment on point 0 moves along with the rigid shift, not discarded:
    expect(translated.adjustedPoints).toEqual([{ x: 2.4, y: -4 }, { x: 2, y: 2 }])
    expect(translated.id).toBe(baseLine.id)
    expect(translated.family).toBe(baseLine.family)
  })
})

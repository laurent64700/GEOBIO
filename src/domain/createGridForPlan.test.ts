import { describe, it, expect, vi } from 'vitest'
import { createGridForPlan, DEFAULT_GRID_RADIUS_M } from './createGridForPlan'
import * as gridInstancesRepo from '../data/gridInstancesRepo'
import * as gridLinesRepo from '../data/gridLinesRepo'
import type { GridLine } from './types'

vi.mock('../data/gridInstancesRepo')
vi.mock('../data/gridLinesRepo')

const hartmann = {
  id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5,
  angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f',
  vibratoryBase: 7,
}

describe('createGridForPlan', () => {
  it('generates theoretical lines around the origin and persists the instance + lines', async () => {
    vi.mocked(gridInstancesRepo.createGridInstance).mockResolvedValue({
      id: 'gi1', planId: 'p1', templateSnapshot: hartmann, originX: 0, originY: 0,
    })
    vi.mocked(gridLinesRepo.createGridLines).mockImplementation(async (inputs) =>
      inputs.map(
        (i, idx): GridLine => ({
          id: `gl${idx}`,
          gridInstanceId: i.gridInstanceId,
          family: i.family,
          polarity: i.polarity,
          reinforced: i.reinforced,
          theoreticalPoints: i.theoreticalPoints,
          adjustedPoints: i.theoreticalPoints,
        })
      )
    )

    const result = await createGridForPlan('p1', hartmann, { x: 0, y: 0 }, '+')

    expect(gridInstancesRepo.createGridInstance).toHaveBeenCalledWith({
      planId: 'p1', templateSnapshot: hartmann, originX: 0, originY: 0,
    })
    const [linesArg] = vi.mocked(gridLinesRepo.createGridLines).mock.calls[0]
    expect(linesArg.length).toBeGreaterThan(0)
    expect(linesArg.every((l) => l.gridInstanceId === 'gi1')).toBe(true)

    // Exact grid math is already verified in Chunk 2 — this only sanity-checks
    // that a plausible number of lines was generated for the default radius,
    // to catch wiring mistakes (e.g. swapped spacing/radius arguments).
    const axisACount = linesArg.filter((l) => l.family === 'axis-a').length
    expect(axisACount).toBeGreaterThan((2 * DEFAULT_GRID_RADIUS_M) / hartmann.spacingYM - 5)

    // Sanity-check that '-' polarity actually reaches the persisted lines
    // array, not just '+' — catches a generator/mapping bug that always
    // stamps the default polarity.
    expect(linesArg.some((l) => l.polarity === '-')).toBe(true)

    expect(result.instance.id).toBe('gi1')
    expect(result.lines).toHaveLength(linesArg.length)
  })

  it('composes the template origin offset into the clicked point before generating', async () => {
    const offsetTemplate = { ...hartmann, originOffsetX: 5, originOffsetY: -3 }
    vi.mocked(gridInstancesRepo.createGridInstance).mockResolvedValue({
      id: 'gi2', planId: 'p1', templateSnapshot: offsetTemplate, originX: 5, originY: -3,
    })
    vi.mocked(gridLinesRepo.createGridLines).mockResolvedValue([])

    await createGridForPlan('p1', offsetTemplate, { x: 0, y: 0 }, '+')

    // Clicked (0,0) + offset (5,-3) = final origin (5,-3) — this is what must
    // reach createGridInstance, per generateTheoreticalLines' documented
    // contract (Chunk 2) that origin composition is this function's job.
    expect(gridInstancesRepo.createGridInstance).toHaveBeenCalledWith({
      planId: 'p1', templateSnapshot: offsetTemplate, originX: 5, originY: -3,
    })
  })
})

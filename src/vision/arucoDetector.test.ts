// src/vision/arucoDetector.test.ts
/**
 * @vitest-environment jsdom
 * @vitest-environment-options {"resources": "usable"}
 *
 * jsdom's default resource loader never loads <img> bytes at all (onload/onerror
 * simply never fire — observed as a test timeout on 2026-07-20, not the
 * getImageData failure the plan predicted first). "usable" + the `canvas`
 * dev-dependency give jsdom real image decoding and a real 2D canvas. Scoped to
 * this file only: enabling it globally would make every component test that
 * renders an <img src="https://…"> attempt a real network fetch.
 */
import { describe, it, expect } from 'vitest'
import { detectMarkers } from './arucoDetector'
// @ts-expect-error — js-aruco2 ships no TypeScript types (see arucoDetector.ts).
import { AR } from 'js-aruco2'

// A real, minimal 2x2 white PNG (base64) — small enough to inline, but with
// genuine non-zero pixel dimensions once decoded, unlike a bare `new Image()`.
// Regenerated 2026-07-20 via the `canvas` package (createCanvas(2,2).toDataURL())
// and round-trip-verified with loadImage: the plan's original inline base64
// was itself an invalid PNG (libpng rejected it).
const TINY_WHITE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAABmJLR0QA/wD/AP+gvaeTAAAAFUlEQVQImWP8////fwYGBgYmBigAAD34BADZfIBGAAAAAElFTkSuQmCC'

describe('detectMarkers', () => {
  it('returns an empty array for a blank white image, without throwing', async () => {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("échec du chargement de l'image de test"))
      image.src = TINY_WHITE_PNG
    })

    const result = detectMarkers(image)
    expect(result).toEqual([])
  })

  // Spec §5's "tests avec de vraies images de marqueurs générées": renders a
  // genuine dictionary marker (same cell layout as AR.Dictionary.generateSVG —
  // 1-cell white quiet zone, 1-cell black border, 5x5 code cells) and expects
  // the full pipeline to find it. This validates the real js-aruco2 calling
  // convention, not just crash-freedom — but still not real-photo accuracy
  // (lighting/print quality), which needs a physical field test per spec §8.
  it('detects a synthetically rendered ARUCO dictionary marker with its exact ID', async () => {
    const MARKER_ID = 101
    const CELL = 20
    const dictionary = new AR.Dictionary('ARUCO')
    const code: string = dictionary.codeList[MARKER_ID]
    const size = dictionary.markSize - 2 // 5x5 code cells
    const total = (size + 4) * CELL

    const canvas = document.createElement('canvas')
    canvas.width = total
    canvas.height = total
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, total, total)
    ctx.fillStyle = '#000'
    ctx.fillRect(CELL, CELL, (size + 2) * CELL, (size + 2) * CELL)
    ctx.fillStyle = '#fff'
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (code[y * size + x] === '1')
          ctx.fillRect((x + 2) * CELL, (y + 2) * CELL, CELL, CELL)

    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("échec du chargement de l'image de marqueur"))
      image.src = canvas.toDataURL('image/png')
    })

    const result = detectMarkers(image)
    expect(result).toHaveLength(1)
    expect(result[0].markerId).toBe(MARKER_ID)
    expect(result[0].corners).toHaveLength(4)
    // The marker's black border spans cells 1..8 of 9 → its centroid is the
    // image center; allow a couple of pixels of corner-refinement tolerance.
    const cx = result[0].corners.reduce((s, c) => s + c.x, 0) / 4
    const cy = result[0].corners.reduce((s, c) => s + c.y, 0) / 4
    expect(cx).toBeCloseTo(total / 2, -1)
    expect(cy).toBeCloseTo(total / 2, -1)
  })
})

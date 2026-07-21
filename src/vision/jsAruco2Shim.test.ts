// src/vision/jsAruco2Shim.test.ts
import { describe, it, expect } from 'vitest'
import { AR } from './jsAruco2Shim'

describe('jsAruco2Shim', () => {
  it('loads a working AR.Detector from js-aruco2, matching the real library API', () => {
    expect(AR).toBeDefined()
    expect(typeof AR.Detector).toBe('function')
    const detector = new AR.Detector({ dictionaryName: 'ARUCO' })
    expect(typeof detector.detect).toBe('function')
  })
})

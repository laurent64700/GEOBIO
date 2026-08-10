# Calage à 1 point pour les photos de tiges — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual 2-4 point photo calibration for rod-detection photos with an automatic 1-click calibration — scale from the known 1m distance between a rod's ArUco markers, rotation from the detected network's known angle family, translation from a single click placing the photo's center on the plan.

**Architecture:** A new pure-function module (`src/vision/rodPhotoCalibration.ts`) derives the `AffineTransform` from raw ArUco detections — no DB/network access, fully unit-testable. `RodDetectionPanel.tsx` is rewritten to call it: detect automatically on mount, prompt for one map click, create `FeltPoint`/`FeltSegment` directly, and offer a 90° orientation-flip correction button. `PlanCalibrationTool.tsx` itself is untouched — it keeps serving interior-plan calibration (`MissionWorkspace.tsx`) unchanged.

**Tech Stack:** TypeScript, React, react-leaflet (`MapView`), Vitest, existing `arucoMapping.ts`/`arucoDetector.ts`/repos (`feltPointsRepo`, `feltSegmentsRepo`, `rodMarkersRepo`).

**Spec:** `docs/superpowers/specs/2026-08-10-rod-photo-1-point-calibration-design.md` — read it before starting; this plan implements it task by task and cross-references its sections by name.

---

## Chunk 1: `rodPhotoCalibration.ts` — pure derivation module

No component wiring in this chunk — every function here is pure (no DB/network access) and independently testable. This chunk alone should compile, pass tests, and produce no visible app behavior change (nothing calls these functions yet).

### Task 1: `groupRodsInPixelSpace` — the identity-transform trick

**Files:**
- Create: `src/vision/rodPhotoCalibration.ts`
- Test: `src/vision/rodPhotoCalibration.test.ts`

This implements spec §"Dérivation de la transformation → Flux de données": `mapDetectionsToPoints` needs an `AffineTransform` to produce real-space points, but pairing rods into segments needs pixel-space grouping first. Solved by calling it with an identity transform (a no-op) so the "real" coordinates it returns are actually still pixel coordinates — letting `pairIntoSegmentsAndPoints` be reused unchanged for pixel-space grouping.

- [ ] **Step 1: Write the failing test**

```typescript
// src/vision/rodPhotoCalibration.test.ts
import { describe, it, expect } from 'vitest'
import { groupRodsInPixelSpace } from './rodPhotoCalibration'
import type { RawMarkerDetection } from './arucoMapping'
import type { RodMarker } from '../domain/types'

describe('groupRodsInPixelSpace', () => {
  it('groups markers into pixel-space segments — the identity transform means x,y stay the raw pixel centroids', () => {
    const detections: RawMarkerDetection[] = [
      { markerId: 101, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      { markerId: 102, corners: [{ x: 40, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 10 }, { x: 40, y: 10 }] },
    ]
    const rodMarkers: RodMarker[] = [
      { markerId: 101, networkName: 'Hartmann', rodNumber: 1 },
      { markerId: 102, networkName: 'Hartmann', rodNumber: 1 },
    ]

    const result = groupRodsInPixelSpace(detections, rodMarkers)

    expect(result.segments).toHaveLength(1)
    // Marker 101's corners average to (5, 5); marker 102's to (45, 5) —
    // the identity transform must leave these exactly as-is (pixel space,
    // not "real" coordinates).
    expect(result.segments[0]).toEqual({
      networkName: 'Hartmann',
      pointA: { x: 5, y: 5 },
      pointB: { x: 45, y: 5 },
    })
    expect(result.points).toHaveLength(0)
  })

  it('returns an isolated marker as a point when its rod pair is not detected', () => {
    const detections: RawMarkerDetection[] = [
      { markerId: 101, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
    ]
    const rodMarkers: RodMarker[] = [{ markerId: 101, networkName: 'Hartmann', rodNumber: 1 }]

    const result = groupRodsInPixelSpace(detections, rodMarkers)

    expect(result.segments).toHaveLength(0)
    expect(result.points).toEqual([{ markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 5, y: 5 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/vision/rodPhotoCalibration.test.ts`
Expected: FAIL — `rodPhotoCalibration.ts` doesn't exist yet (`Cannot find module './rodPhotoCalibration'`).

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/vision/rodPhotoCalibration.ts
import { mapDetectionsToPoints, pairIntoSegmentsAndPoints, type RawMarkerDetection, type PairingResult } from './arucoMapping'
import type { AffineTransform, RodMarker } from '../domain/types'

// A no-op transform — applying it to a pixel coordinate returns that exact
// coordinate unchanged (see applyAffineTransform.ts: x' = a·x + b·y + e =
// 1·x + 0·y + 0 = x). Used to reuse mapDetectionsToPoints/
// pairIntoSegmentsAndPoints for grouping markers into rods IN PIXEL SPACE,
// before any real AffineTransform exists (see design spec §"Flux de
// données" for why this two-call approach is needed).
const IDENTITY_TRANSFORM: AffineTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export function groupRodsInPixelSpace(
  detections: RawMarkerDetection[],
  rodMarkers: RodMarker[]
): PairingResult {
  const { recognized } = mapDetectionsToPoints(detections, IDENTITY_TRANSFORM, rodMarkers)
  return pairIntoSegmentsAndPoints(recognized)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/vision/rodPhotoCalibration.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/vision/rodPhotoCalibration.ts src/vision/rodPhotoCalibration.test.ts
git commit -m "feat: groupRodsInPixelSpace for 1-point rod-photo calibration"
```

### Task 2: `deriveScale` — and the direction bug the spec review caught

**Files:**
- Modify: `src/vision/rodPhotoCalibration.ts`
- Test: `src/vision/rodPhotoCalibration.test.ts`

Implements spec §"Échelle `s`". **The scale formula's direction matters and was wrong in an earlier draft of the spec itself** (`s = D_px ÷ 1m` instead of the correct `s = 1m ÷ D_px`) — write the test FIRST and make sure it actually pins the direction, not just "some plausible-looking number."

- [ ] **Step 1: Write the failing test**

Add to `src/vision/rodPhotoCalibration.test.ts`:

```typescript
import { deriveScale, NoCompleteRodError } from './rodPhotoCalibration'
import type { FeltSegmentCandidate } from './arucoMapping'

describe('deriveScale', () => {
  it('converts a pixel distance to meters-per-pixel — NOT pixels-per-meter (the inverse)', () => {
    // A rod measured at 50px between its 2 markers, representing a real 1m —
    // scale must be 1/50 = 0.02 (m/px), not 50 (px/m). This is the exact
    // direction bug caught in spec review — pin it explicitly.
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 50, y: 0 } },
    ]
    expect(deriveScale(segments)).toBeCloseTo(0.02, 10)
  })

  it('averages the scale estimate across multiple complete rods', () => {
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 50, y: 0 } }, // 1/50 = 0.02
      { networkName: 'Curry', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 0 } }, // 1/100 = 0.01
    ]
    expect(deriveScale(segments)).toBeCloseTo(0.015, 10) // (0.02 + 0.01) / 2
  })

  it('throws NoCompleteRodError when no complete rod is given', () => {
    expect(() => deriveScale([])).toThrow(NoCompleteRodError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/vision/rodPhotoCalibration.test.ts`
Expected: FAIL — `deriveScale`/`NoCompleteRodError` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/vision/rodPhotoCalibration.ts`:

```typescript
import type { FeltSegmentCandidate } from './arucoMapping'

// The fixed real-world distance between a rod's 2 ArUco markers — same
// convention as manual felt-segment placement (FELT_SEGMENT_HALF_LENGTH_M
// = 0.5 in usePlacementMode.ts, i.e. a 1m segment), confirmed with Laurent.
const ROD_MARKER_DISTANCE_M = 1

export class NoCompleteRodError extends Error {}

export function deriveScale(segments: FeltSegmentCandidate[]): number {
  if (segments.length === 0) {
    throw new NoCompleteRodError("Aucune tige complète détectée — impossible de calculer l'échelle.")
  }
  const estimates = segments.map((segment) => {
    const distancePx = Math.hypot(
      segment.pointB.x - segment.pointA.x,
      segment.pointB.y - segment.pointA.y
    )
    // Real units per pixel — NOT pixels per real unit. The transform this
    // feeds (buildAffineTransform, Task 4) does x' = a·x + ... with x in
    // pixels and x' in meters, so `s` must already be in m/px.
    return ROD_MARKER_DISTANCE_M / distancePx
  })
  return estimates.reduce((sum, v) => sum + v, 0) / estimates.length
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/vision/rodPhotoCalibration.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/vision/rodPhotoCalibration.ts src/vision/rodPhotoCalibration.test.ts
git commit -m "feat: deriveScale for 1-point rod-photo calibration"
```

### Task 3: `deriveRotation` — and the accepted 90° ambiguity

**Files:**
- Modify: `src/vision/rodPhotoCalibration.ts`
- Test: `src/vision/rodPhotoCalibration.test.ts`

Implements spec §"Rotation `θ`". Deliberately simple (no cross-network scoring — spec §"Limite connue, acceptée" proves that can't resolve the 90° ambiguity anyway, since the 2 known angle families are both 90°-periodic). The `useSecondFamilyMember` parameter is what "Inverser l'orientation" (Chunk 2, Task 8) uses to flip to the other candidate.

- [ ] **Step 1: Write the failing test**

Add to `src/vision/rodPhotoCalibration.test.ts`:

```typescript
import { deriveRotation, NoKnownNetworkFamilyError } from './rodPhotoCalibration'

describe('deriveRotation', () => {
  it('aligns the first known-family rod to the FIRST member of its family', () => {
    // Hartmann family is [0, 90] (networkBearings.ts). A rod measured at
    // 10° in pixel space (pointA→pointB) should produce θ = 0 − 10 = −10.
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: Math.tan((10 * Math.PI) / 180) * 100 } },
    ]
    expect(deriveRotation(segments)).toBeCloseTo(-10, 6)
  })

  it('uses the SECOND family member when useSecondFamilyMember is true (the "Inverser l\'orientation" case)', () => {
    // Same rod as above (measured at 10°), but this time aligned to
    // Hartmann's 2nd family member (90°): θ = 90 − 10 = 80.
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: Math.tan((10 * Math.PI) / 180) * 100 } },
    ]
    expect(deriveRotation(segments, true)).toBeCloseTo(80, 6)
  })

  it('skips a rod with no known network family and uses the next one that has one', () => {
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Autre', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 100 } }, // no known family
      { networkName: 'Curry', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 0 } }, // measured at 0°, family [45,135]
    ]
    // Curry's first member is 45°, measured at 0° → θ = 45 − 0 = 45.
    expect(deriveRotation(segments)).toBeCloseTo(45, 6)
  })

  it('throws NoKnownNetworkFamilyError when no detected rod has a known network family', () => {
    const segments: FeltSegmentCandidate[] = [
      { networkName: 'Autre', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 100 } },
    ]
    expect(() => deriveRotation(segments)).toThrow(NoKnownNetworkFamilyError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/vision/rodPhotoCalibration.test.ts`
Expected: FAIL — `deriveRotation`/`NoKnownNetworkFamilyError` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/vision/rodPhotoCalibration.ts`:

```typescript
import { allowedBearingsForNetwork } from '../domain/networkBearings'
import type { Point } from '../domain/types'

export class NoKnownNetworkFamilyError extends Error {}

function pixelAngleDeg(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

// Deliberately simple — see design spec §"Limite connue, acceptée": the
// only 2 known angle families (0°/90° and 45°/135°) are both invariant
// under a 90° rotation, so no amount of cross-referencing additional
// rods/networks can resolve which of a family's 2 members is correct.
// Laurent accepted this residual ambiguity; `useSecondFamilyMember` is the
// escape hatch ("Inverser l'orientation", Chunk 2 Task 8).
export function deriveRotation(
  segments: FeltSegmentCandidate[],
  useSecondFamilyMember = false
): number {
  for (const segment of segments) {
    const family = allowedBearingsForNetwork(segment.networkName)
    if (family === null) continue
    const measuredAngleDeg = pixelAngleDeg(segment.pointA, segment.pointB)
    const targetMember = family[useSecondFamilyMember ? 1 : 0]
    return targetMember - measuredAngleDeg
  }
  throw new NoKnownNetworkFamilyError(
    "Aucune tige de réseau reconnu détectée — impossible de calculer l'orientation."
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/vision/rodPhotoCalibration.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/vision/rodPhotoCalibration.ts src/vision/rodPhotoCalibration.test.ts
git commit -m "feat: deriveRotation for 1-point rod-photo calibration"
```

### Task 4: `buildAffineTransform`

**Files:**
- Modify: `src/vision/rodPhotoCalibration.ts`
- Test: `src/vision/rodPhotoCalibration.test.ts`

Implements spec §"Translation `(e, f)`" and the `a,b,c,d` formulas from §"Dérivation de la transformation". ⚠️ Per the spec's flagged point technique, the SIGN of θ (image Y-down vs. local Y-north) is not guaranteed correct here — Task 9 (Chunk 2) validates it against a real photo. This task only needs the algebra to be internally consistent (i.e. the round-trip test below passes), not the real-world sign to be proven right yet.

- [ ] **Step 1: Write the failing test**

Add to `src/vision/rodPhotoCalibration.test.ts`:

```typescript
import { buildAffineTransform } from './rodPhotoCalibration'
import { applyAffineTransform } from '../geometry/affineTransform'

describe('buildAffineTransform', () => {
  it('maps the photo center exactly onto realCenter, regardless of scale/rotation', () => {
    const transform = buildAffineTransform(0.02, 37, { x: 12.5, y: -4.3 }, { x: 800, y: 600 })
    const mapped = applyAffineTransform({ x: 800, y: 600 }, transform)
    expect(mapped.x).toBeCloseTo(12.5, 9)
    expect(mapped.y).toBeCloseTo(-4.3, 9)
  })

  it('scales a 1-pixel offset from center by the given scale, in the rotated direction', () => {
    // No rotation (θ=0): a +1px offset in x should map to +scale in real x.
    const transform = buildAffineTransform(0.02, 0, { x: 0, y: 0 }, { x: 0, y: 0 })
    const mapped = applyAffineTransform({ x: 1, y: 0 }, transform)
    expect(mapped.x).toBeCloseTo(0.02, 9)
    expect(mapped.y).toBeCloseTo(0, 9)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/vision/rodPhotoCalibration.test.ts`
Expected: FAIL — `buildAffineTransform` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/vision/rodPhotoCalibration.ts`:

```typescript
import type { AffineTransform, Point } from '../domain/types'

export function buildAffineTransform(
  scale: number,
  rotationDeg: number,
  realCenter: Point,
  photoCenter: Point
): AffineTransform {
  const theta = (rotationDeg * Math.PI) / 180
  const a = scale * Math.cos(theta)
  const b = -scale * Math.sin(theta)
  const c = scale * Math.sin(theta)
  const d = scale * Math.cos(theta)
  // Solve e, f so that applying this transform to photoCenter gives exactly
  // realCenter (see design spec §"Translation").
  const e = realCenter.x - (a * photoCenter.x + b * photoCenter.y)
  const f = realCenter.y - (c * photoCenter.x + d * photoCenter.y)
  return { a, b, c, d, e, f }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/vision/rodPhotoCalibration.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/vision/rodPhotoCalibration.ts src/vision/rodPhotoCalibration.test.ts
git commit -m "feat: buildAffineTransform for 1-point rod-photo calibration"
```

### Task 5: Synthetic end-to-end round-trip test

**Files:**
- Modify: `src/vision/rodPhotoCalibration.test.ts`

Implements the spec's "Bout en bout (synthétique)" test bullet — proves the 4 functions compose correctly (pixel detections → real `FeltPoint`/`FeltSegment` positions), independent of the real-photo validation in Chunk 2 Task 9.

- [ ] **Step 1: Write the test**

Add to `src/vision/rodPhotoCalibration.test.ts`:

```typescript
import { mapDetectionsToPoints, pairIntoSegmentsAndPoints } from './arucoMapping'

describe('end-to-end (synthetic)', () => {
  it('composes groupRodsInPixelSpace → deriveScale/deriveRotation → buildAffineTransform → mapDetectionsToPoints to recover known real positions', () => {
    // A single Hartmann rod, 50px apart in pixel space, running due "east"
    // in pixel space (0° measured angle) — Hartmann's family is [0, 90], so
    // this aligns with NO rotation needed (θ = 0 − 0 = 0).
    const detections: RawMarkerDetection[] = [
      { markerId: 101, corners: [{ x: 95, y: 95 }, { x: 105, y: 95 }, { x: 105, y: 105 }, { x: 95, y: 105 }] }, // centroid (100,100)
      { markerId: 102, corners: [{ x: 145, y: 95 }, { x: 155, y: 95 }, { x: 155, y: 105 }, { x: 145, y: 105 }] }, // centroid (150,100)
    ]
    const rodMarkers: RodMarker[] = [
      { markerId: 101, networkName: 'Hartmann', rodNumber: 1 },
      { markerId: 102, networkName: 'Hartmann', rodNumber: 1 },
    ]
    const photoCenter = { x: 100, y: 100 } // deliberately == marker 101's position
    const realCenter = { x: 5, y: 5 } // where Laurent clicked

    const pixelGroup = groupRodsInPixelSpace(detections, rodMarkers)
    const s = deriveScale(pixelGroup.segments) // 1 / 50 = 0.02
    const theta = deriveRotation(pixelGroup.segments) // 0
    const transform = buildAffineTransform(s, theta, realCenter, photoCenter)

    const { recognized } = mapDetectionsToPoints(detections, transform, rodMarkers)
    const { segments } = pairIntoSegmentsAndPoints(recognized)

    expect(segments).toHaveLength(1)
    // marker 101 IS the photo center → maps exactly to realCenter.
    expect(segments[0].pointA.x).toBeCloseTo(5, 9)
    expect(segments[0].pointA.y).toBeCloseTo(5, 9)
    // marker 102 is 50px east of center → 50 * 0.02 = 1m east of realCenter.
    expect(segments[0].pointB.x).toBeCloseTo(6, 9)
    expect(segments[0].pointB.y).toBeCloseTo(5, 9)
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- --run src/vision/rodPhotoCalibration.test.ts`
Expected: PASS (12 tests). If it fails, the bug is almost certainly in the `θ` sign convention (⚠️ flagged in Task 4) — trace through `buildAffineTransform`'s `a,b,c,d` by hand against this test's numbers before changing anything else.

- [ ] **Step 3: Commit**

```bash
git add src/vision/rodPhotoCalibration.test.ts
git commit -m "test: end-to-end synthetic round-trip for rod-photo calibration"
```

---

## Chunk 1 — Full file for reference

After Task 5, `src/vision/rodPhotoCalibration.ts` should look like this in full (consolidate the incremental `import`s from Tasks 1-4 into one block at the top — the tasks above added them piecemeal for TDD narrative purposes):

```typescript
// src/vision/rodPhotoCalibration.ts
import { mapDetectionsToPoints, pairIntoSegmentsAndPoints, type RawMarkerDetection, type PairingResult, type FeltSegmentCandidate } from './arucoMapping'
import { allowedBearingsForNetwork } from '../domain/networkBearings'
import type { AffineTransform, Point, RodMarker } from '../domain/types'

const IDENTITY_TRANSFORM: AffineTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export function groupRodsInPixelSpace(
  detections: RawMarkerDetection[],
  rodMarkers: RodMarker[]
): PairingResult {
  const { recognized } = mapDetectionsToPoints(detections, IDENTITY_TRANSFORM, rodMarkers)
  return pairIntoSegmentsAndPoints(recognized)
}

const ROD_MARKER_DISTANCE_M = 1

export class NoCompleteRodError extends Error {}

export function deriveScale(segments: FeltSegmentCandidate[]): number {
  if (segments.length === 0) {
    throw new NoCompleteRodError("Aucune tige complète détectée — impossible de calculer l'échelle.")
  }
  const estimates = segments.map((segment) => {
    const distancePx = Math.hypot(
      segment.pointB.x - segment.pointA.x,
      segment.pointB.y - segment.pointA.y
    )
    return ROD_MARKER_DISTANCE_M / distancePx
  })
  return estimates.reduce((sum, v) => sum + v, 0) / estimates.length
}

export class NoKnownNetworkFamilyError extends Error {}

function pixelAngleDeg(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

export function deriveRotation(
  segments: FeltSegmentCandidate[],
  useSecondFamilyMember = false
): number {
  for (const segment of segments) {
    const family = allowedBearingsForNetwork(segment.networkName)
    if (family === null) continue
    const measuredAngleDeg = pixelAngleDeg(segment.pointA, segment.pointB)
    const targetMember = family[useSecondFamilyMember ? 1 : 0]
    return targetMember - measuredAngleDeg
  }
  throw new NoKnownNetworkFamilyError(
    "Aucune tige de réseau reconnu détectée — impossible de calculer l'orientation."
  )
}

export function buildAffineTransform(
  scale: number,
  rotationDeg: number,
  realCenter: Point,
  photoCenter: Point
): AffineTransform {
  const theta = (rotationDeg * Math.PI) / 180
  const a = scale * Math.cos(theta)
  const b = -scale * Math.sin(theta)
  const c = scale * Math.sin(theta)
  const d = scale * Math.cos(theta)
  const e = realCenter.x - (a * photoCenter.x + b * photoCenter.y)
  const f = realCenter.y - (c * photoCenter.x + d * photoCenter.y)
  return { a, b, c, d, e, f }
}
```

**Checkpoint before Chunk 2:** run the full suite and `tsc -b` — both must be clean before moving on, since Chunk 2 builds directly on this module.

```bash
npm test -- --run
npx tsc -b
```

---

## Chunk 2: Wire it into `RodDetectionPanel.tsx`

This chunk replaces the old 2-4 point `PlanCalibrationTool`-based flow inside `RodDetectionPanel.tsx` with the new 1-click flow built on Chunk 1's pure functions, and removes the now-dead `onCalibrated` plumbing one level up in `MissionPhotosGallery.tsx`. `PlanCalibrationTool.tsx` itself is untouched — it still serves interior-plan calibration from `MissionWorkspace.tsx` unchanged.

**Why `MissionPhotosGallery.tsx` is in scope here even though the spec's "Portée technique" only names `RodDetectionPanel.tsx`:** `MissionPhotosGallery.tsx` passes `onCalibrated={handlePhotoCalibrated}` into `RodDetectionPanel` today (verified by reading the file — `src/components/MissionPhotosGallery.tsx:53`). Once `RodDetectionPanel` no longer has a separate "calibrate, then detect" two-step (Task 6 collapses both into one click), that prop stops existing on `RodDetectionPanelProps` — so the caller must be updated in the same chunk or the build breaks. This is not new functionality, it's the direct, minimal consequence of Task 6's prop-interface change.

### Task 6: `RodDetectionPanel.tsx` — full rewrite (auto-detect → 1 click → create/invert)

**Files:**
- Modify (full replacement): `src/components/RodDetectionPanel.tsx`
- Modify (full replacement): `src/components/RodDetectionPanel.test.tsx`

Implements spec §"Flux utilisateur" (auto-detect on mount, single map click = photo center, the 2 blocking error cases as alternates under step 3) and §"Correction manuelle: Inverser l'orientation" (delete + recreate with the other family member, reusing the exact state list the spec names: raw detections, rodMarkers, pixel-space pairing, `s`, `realCenter`).

**On duplicate-submission protection:** both `handleMapClick` and `handleInvertOrientation` check a `committing` flag before doing anything, and the render conditionally unmounts their only trigger element (the map, the invert button) for the duration of a commit. In real usage this render-gating is what actually stops a second click — once the trigger is gone, there is nothing left to click. The `committing` checks inside the handlers are a defensive backstop for the (rarer, harder-to-hit) case of two events reaching the same still-mounted handler before React reconciles the unmount — a scenario that's real (fast double-clicks/double-taps can do this) but not practical to simulate deterministically in an RTL/jsdom test without fighting React's batching internals in ways that wouldn't reflect real browser timing anyway. Step 1's busy-state test therefore verifies the render-gating (the part that's both the primary protection and reliably testable), not the defensive guard clauses in isolation — don't read it as proof the guard clauses are load-bearing on their own.

- [ ] **Step 1: Replace the test file wholesale**

```typescript
// src/components/RodDetectionPanel.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RodDetectionPanel } from './RodDetectionPanel'
import * as arucoDetector from '../vision/arucoDetector'
import * as arucoMapping from '../vision/arucoMapping'
import * as rodPhotoCalibration from '../vision/rodPhotoCalibration'
import * as rodMarkersRepo from '../data/rodMarkersRepo'
import * as feltPointsRepo from '../data/feltPointsRepo'
import * as feltSegmentsRepo from '../data/feltSegmentsRepo'

vi.mock('../vision/arucoDetector')
vi.mock('../vision/arucoMapping')
vi.mock('../vision/rodPhotoCalibration')
vi.mock('../data/rodMarkersRepo')
vi.mock('../data/feltPointsRepo')
vi.mock('../data/feltSegmentsRepo')
vi.mock('./MapView', () => ({
  // Matches the mock convention already used in PlanCalibrationTool.test.tsx —
  // real map interaction is covered by MapView's own tests.
  MapView: ({ onMapClick }: { onMapClick?: (latlng: { lat: number; lng: number }) => void }) => (
    <button onClick={() => onMapClick?.({ lat: 48.8566, lng: 2.3522 })}>simulate-map-click</button>
  ),
}))

const photo = {
  id: 'mp1', missionId: 'm1', imageUrl: 'https://x/a.jpg', calibration: null,
  createdAt: '2026-07-16T10:00:00Z',
}
const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const pixelSegments = [{ networkName: 'Hartmann', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 0 } }]

let createdImages: { crossOrigin: string | null }[] = []

function stubDetectionPipeline() {
  vi.mocked(arucoDetector.detectMarkers).mockReturnValue([
    { markerId: 101, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
    { markerId: 102, corners: [{ x: 90, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }, { x: 90, y: 10 }] },
  ])
  vi.mocked(rodMarkersRepo.listRodMarkers).mockResolvedValue([
    { markerId: 101, networkName: 'Hartmann', rodNumber: 1 },
    { markerId: 102, networkName: 'Hartmann', rodNumber: 1 },
  ])
  vi.mocked(rodPhotoCalibration.groupRodsInPixelSpace).mockReturnValue({
    segments: pixelSegments,
    points: [],
  })
}

describe('RodDetectionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createdImages = []
    // jsdom's Image doesn't actually load image bytes — stub it so `new Image()`
    // fires onload on the next tick, simulating a successful load. Also records
    // each instance so tests can assert on properties (like crossOrigin) set on
    // it before `src` triggers the "load".
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        crossOrigin: string | null = null
        naturalWidth = 4000
        naturalHeight = 3000
        constructor() {
          createdImages.push(this)
        }
        set src(_: string) {
          setTimeout(() => this.onload?.(), 0)
        }
      }
    )
  })

  afterEach(() => vi.unstubAllGlobals())

  it('shows the fixed capture-assumption text', async () => {
    stubDetectionPipeline()
    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)
    expect(
      await screen.findByText(/trépied \+ bras télescopique \+ télécommande/i)
    ).toBeInTheDocument()
  })

  it('detects automatically on mount and, once a complete rod on a known network is found, prompts for one map click', async () => {
    stubDetectionPipeline()
    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)

    await waitFor(() => expect(arucoDetector.detectMarkers).toHaveBeenCalled())
    expect(await screen.findByText('simulate-map-click')).toBeInTheDocument()
  })

  it('loads the detection image with crossOrigin="anonymous" (photo.imageUrl is cross-origin Supabase Storage — without this, arucoDetector\'s getImageData throws a canvas-tainted SecurityError)', async () => {
    stubDetectionPipeline()
    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)

    await waitFor(() => expect(arucoDetector.detectMarkers).toHaveBeenCalled())
    expect(createdImages).toHaveLength(1)
    expect(createdImages[0].crossOrigin).toBe('anonymous')
  })

  it('shows a blocking error and no map prompt when no complete rod is detected', async () => {
    vi.mocked(arucoDetector.detectMarkers).mockReturnValue([])
    vi.mocked(rodMarkersRepo.listRodMarkers).mockResolvedValue([])
    vi.mocked(rodPhotoCalibration.groupRodsInPixelSpace).mockReturnValue({ segments: [], points: [] })

    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Aucune tige complète détectée — impossible de calculer l'échelle."
    )
    expect(screen.queryByText('simulate-map-click')).not.toBeInTheDocument()
  })

  it('shows a blocking error and no map prompt when no detected rod belongs to a known network family', async () => {
    vi.mocked(arucoDetector.detectMarkers).mockReturnValue([
      { markerId: 201, corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
      { markerId: 202, corners: [{ x: 90, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }, { x: 90, y: 10 }] },
    ])
    vi.mocked(rodMarkersRepo.listRodMarkers).mockResolvedValue([
      { markerId: 201, networkName: 'RéseauInconnu', rodNumber: 1 },
      { markerId: 202, networkName: 'RéseauInconnu', rodNumber: 1 },
    ])
    vi.mocked(rodPhotoCalibration.groupRodsInPixelSpace).mockReturnValue({
      segments: [{ networkName: 'RéseauInconnu', pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 0 } }],
      points: [],
    })

    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Aucune tige de réseau reconnu détectée — impossible de calculer l'orientation."
    )
    expect(screen.queryByText('simulate-map-click')).not.toBeInTheDocument()
  })

  it('on map click, derives scale/rotation/transform from the pixel-space segments and creates the real FeltSegments/FeltPoints', async () => {
    stubDetectionPipeline()
    vi.mocked(rodPhotoCalibration.deriveScale).mockReturnValue(0.02)
    vi.mocked(rodPhotoCalibration.deriveRotation).mockReturnValue(0)
    vi.mocked(rodPhotoCalibration.buildAffineTransform).mockReturnValue({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 })
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({
      recognized: [
        { markerId: 101, rodNumber: 1, networkName: 'Hartmann', x: 5, y: 5 },
        { markerId: 102, rodNumber: 1, networkName: 'Hartmann', x: 7, y: 5 },
      ],
      totalDetected: 2,
      totalRecognized: 2,
    })
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [{ networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 } }],
      points: [],
    })
    vi.mocked(feltSegmentsRepo.createFeltSegment).mockResolvedValue({
      id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 }, polarityA: null, polarityB: null, createdAt: '2026-08-10T10:00:00Z',
    })

    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)
    fireEvent.click(await screen.findByText('simulate-map-click'))

    await waitFor(() =>
      expect(rodPhotoCalibration.deriveScale).toHaveBeenCalledWith(pixelSegments)
    )
    expect(rodPhotoCalibration.deriveRotation).toHaveBeenCalledWith(pixelSegments)
    expect(rodPhotoCalibration.buildAffineTransform).toHaveBeenCalledWith(
      0.02, 0, { x: expect.any(Number), y: expect.any(Number) }, { x: 2000, y: 1500 }
    )
    expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledWith({
      planId: 'p1', networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 },
    })
    expect(
      await screen.findByText('2 marqueurs détectés, 2 reconnus (1 tiges complètes, 0 points isolés).')
    ).toBeInTheDocument()
    // Map prompt is gone once calibrated; "Inverser l'orientation" appears instead.
    expect(screen.queryByText('simulate-map-click')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /inverser l'orientation/i })).toBeInTheDocument()
  })

  it('shows a busy state and hides the map prompt / invert button while a commit is in flight (the trigger element is unmounted for the duration, so there is nothing left to double-click in real usage)', async () => {
    stubDetectionPipeline()
    vi.mocked(rodPhotoCalibration.deriveScale).mockReturnValue(0.02)
    vi.mocked(rodPhotoCalibration.deriveRotation).mockReturnValue(0)
    vi.mocked(rodPhotoCalibration.buildAffineTransform).mockReturnValue({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 })
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({ recognized: [], totalDetected: 0, totalRecognized: 0 })
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [{ networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 } }],
      points: [],
    })
    // Left unresolved on purpose, to inspect the UI mid-flight before letting it settle.
    let resolveCreate: (value: unknown) => void = () => {}
    vi.mocked(feltSegmentsRepo.createFeltSegment).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve
      })
    )

    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)
    fireEvent.click(await screen.findByText('simulate-map-click'))

    // Mid-flight: the map prompt that triggered this commit is gone (nothing
    // left to double-click), and "Inverser l'orientation" hasn't appeared yet
    // either (the commit it would act on hasn't resolved) — there is no
    // interactive element left that could re-trigger a second commit.
    expect(screen.queryByText('simulate-map-click')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /inverser l'orientation/i })).not.toBeInTheDocument()
    expect(screen.getByText(/enregistrement en cours/i)).toBeInTheDocument()

    resolveCreate({
      id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 }, polarityA: null, polarityB: null, createdAt: '2026-08-10T10:00:00Z',
    })

    expect(await screen.findByRole('button', { name: /inverser l'orientation/i })).toBeInTheDocument()
    expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledTimes(1)
  })

  it('"Inverser l\'orientation" deletes the created entities and recreates them with the other family member, toggling back on a second click', async () => {
    stubDetectionPipeline()
    vi.mocked(rodPhotoCalibration.deriveScale).mockReturnValue(0.02)
    vi.mocked(rodPhotoCalibration.deriveRotation).mockReturnValue(0)
    vi.mocked(rodPhotoCalibration.buildAffineTransform).mockReturnValue({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 })
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({
      recognized: [], totalDetected: 2, totalRecognized: 2,
    })
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [{ networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 } }],
      points: [],
    })
    vi.mocked(feltSegmentsRepo.createFeltSegment)
      .mockResolvedValueOnce({
        id: 'fs1', planId: 'p1', networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 }, polarityA: null, polarityB: null, createdAt: '2026-08-10T10:00:00Z',
      })
      .mockResolvedValueOnce({
        id: 'fs2', planId: 'p1', networkName: 'Hartmann', pointA: { x: 5, y: 6 }, pointB: { x: 7, y: 6 }, polarityA: null, polarityB: null, createdAt: '2026-08-10T10:01:00Z',
      })

    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)
    fireEvent.click(await screen.findByText('simulate-map-click'))
    await waitFor(() => expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /inverser l'orientation/i }))

    await waitFor(() => expect(feltSegmentsRepo.deleteFeltSegment).toHaveBeenCalledWith('fs1'))
    expect(rodPhotoCalibration.deriveRotation).toHaveBeenNthCalledWith(2, pixelSegments, true)
    await waitFor(() => expect(feltSegmentsRepo.createFeltSegment).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: /inverser l'orientation/i }))

    await waitFor(() => expect(feltSegmentsRepo.deleteFeltSegment).toHaveBeenCalledWith('fs2'))
    expect(rodPhotoCalibration.deriveRotation).toHaveBeenNthCalledWith(3, pixelSegments, false)
  })

  it('surfaces a repo error (e.g. offline write failure) via role="alert" without crashing', async () => {
    stubDetectionPipeline()
    vi.mocked(rodPhotoCalibration.deriveScale).mockReturnValue(0.02)
    vi.mocked(rodPhotoCalibration.deriveRotation).mockReturnValue(0)
    vi.mocked(rodPhotoCalibration.buildAffineTransform).mockReturnValue({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 5 })
    vi.mocked(arucoMapping.mapDetectionsToPoints).mockReturnValue({ recognized: [], totalDetected: 0, totalRecognized: 0 })
    vi.mocked(arucoMapping.pairIntoSegmentsAndPoints).mockReturnValue({
      segments: [{ networkName: 'Hartmann', pointA: { x: 5, y: 5 }, pointB: { x: 7, y: 5 } }],
      points: [],
    })
    vi.mocked(feltSegmentsRepo.createFeltSegment).mockRejectedValue(new Error('Hors ligne'))

    render(<RodDetectionPanel photo={photo} planId="p1" missionOrigin={missionOrigin} mapCenter={[48.8566, 2.3522]} />)
    fireEvent.click(await screen.findByText('simulate-map-click'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Hors ligne')
  })
})
```

- [ ] **Step 2: Run the test file, verify it fails against the current (pre-rewrite) component**

Run: `npm test -- --run src/components/RodDetectionPanel.test.tsx`
Expected: FAIL — the current component still renders `PlanCalibrationTool` and requires an `onCalibrated` prop; none of the new mocks (`rodPhotoCalibration`, the new `MapView` mock) line up with it.

- [ ] **Step 3: Replace the component wholesale**

```typescript
// src/components/RodDetectionPanel.tsx
import { useEffect, useState } from 'react'
import { MapView } from './MapView'
import { detectMarkers } from '../vision/arucoDetector'
import {
  mapDetectionsToPoints,
  pairIntoSegmentsAndPoints,
  type FeltSegmentCandidate,
  type RawMarkerDetection,
} from '../vision/arucoMapping'
import {
  groupRodsInPixelSpace,
  deriveScale,
  deriveRotation,
  buildAffineTransform,
} from '../vision/rodPhotoCalibration'
import { allowedBearingsForNetwork } from '../domain/networkBearings'
import { listRodMarkers } from '../data/rodMarkersRepo'
import { createFeltPoint, deleteFeltPoint } from '../data/feltPointsRepo'
import { createFeltSegment, deleteFeltSegment } from '../data/feltSegmentsRepo'
import type { MissionPhoto, Point, RodMarker } from '../domain/types'
import { latLngToLocal, type LatLng } from '../geometry/localCoordinates'

export interface RodDetectionPanelProps {
  photo: MissionPhoto
  planId: string
  missionOrigin: LatLng
  mapCenter: [number, number]
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    // Required for arucoDetector's ctx.getImageData() to succeed: photo.imageUrl
    // points at Supabase Storage, a different origin than the app itself, and an
    // <img> loaded cross-origin without this taints the canvas it's drawn to —
    // getImageData then throws SecurityError instead of returning pixel data.
    // Supabase Storage serves public buckets with permissive CORS headers, so
    // 'anonymous' (no credentials sent) is sufficient.
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Impossible de charger l'image pour la détection."))
    image.src = url
  })
}

interface PendingCalibration {
  detections: RawMarkerDetection[]
  rodMarkers: RodMarker[]
  segments: FeltSegmentCandidate[]
  photoCenter: Point
}

interface LastCalibration extends PendingCalibration {
  scale: number
  realCenter: Point
  inverted: boolean
  createdSegmentIds: string[]
  createdPointIds: string[]
}

// Laurent's fixed photo-taking setup (tripod + 3m telescopic arm + remote
// trigger) is what makes "photo center = where I was standing" reliable
// enough to calibrate from — displayed so the assumption is visible, not
// silently baked into the math (spec §Objectifs). Not configurable.
const CAPTURE_ASSUMPTION_TEXT =
  "Photo verticale, centrée sur votre position (trépied + bras télescopique + télécommande) — hypothèse fixe du calage automatique."

// MapView's root element is styled height: '100%', resolving against its
// parent's actual height — matches PlanCalibrationTool.tsx's MAP_WRAPPER_STYLE
// and its comment on why every direct MapView wrapper needs an explicit height.
const MAP_WRAPPER_STYLE = { height: 400 }

export function RodDetectionPanel({ photo, planId, missionOrigin, mapCenter }: RodDetectionPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingCalibration | null>(null)
  const [last, setLast] = useState<LastCalibration | null>(null)
  // Both handlers below check this before doing anything, AND the render
  // unmounts their only trigger element (the map / the invert button) while
  // it's true — the render-gating is the actual real-world protection
  // (nothing left to click once the trigger is gone); the in-handler check
  // is a defensive backstop for two events reaching the same still-mounted
  // handler before React reconciles the unmount. The old PlanCalibrationTool-
  // based version of this component had equivalent protection under a
  // different name (`detecting`); this replaces it.
  const [committing, setCommitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setSummary(null)
    setPending(null)
    setLast(null)

    async function run() {
      try {
        const image = await loadImage(photo.imageUrl)
        const detections = detectMarkers(image)
        const rodMarkers = await listRodMarkers()
        const { segments } = groupRodsInPixelSpace(detections, rodMarkers)

        if (segments.length === 0) {
          if (!cancelled) setError("Aucune tige complète détectée — impossible de calculer l'échelle.")
          return
        }
        const hasKnownFamily = segments.some((s) => allowedBearingsForNetwork(s.networkName) !== null)
        if (!hasKnownFamily) {
          if (!cancelled) setError("Aucune tige de réseau reconnu détectée — impossible de calculer l'orientation.")
          return
        }

        if (!cancelled) {
          setPending({
            detections,
            rodMarkers,
            segments,
            photoCenter: { x: image.naturalWidth / 2, y: image.naturalHeight / 2 },
          })
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }
    run()

    return () => {
      cancelled = true
    }
  }, [photo.imageUrl])

  async function commitCalibration(
    base: PendingCalibration,
    scale: number,
    rotationDeg: number,
    realCenter: Point
  ) {
    const transform = buildAffineTransform(scale, rotationDeg, realCenter, base.photoCenter)
    const { recognized, totalDetected, totalRecognized } = mapDetectionsToPoints(
      base.detections,
      transform,
      base.rodMarkers
    )
    const { segments: realSegments, points: realPoints } = pairIntoSegmentsAndPoints(recognized)

    const createdSegments = await Promise.all(
      realSegments.map((s) =>
        createFeltSegment({ planId, networkName: s.networkName, pointA: s.pointA, pointB: s.pointB })
      )
    )
    const createdPoints = await Promise.all(
      realPoints.map((p) => createFeltPoint({ planId, networkName: p.networkName, x: p.x, y: p.y }))
    )

    setSummary(
      `${totalDetected} marqueurs détectés, ${totalRecognized} reconnus ` +
        `(${realSegments.length} tiges complètes, ${realPoints.length} points isolés).`
    )
    return {
      createdSegmentIds: createdSegments.map((s) => s.id),
      createdPointIds: createdPoints.map((p) => p.id),
    }
  }

  async function handleMapClick(latlng: LatLng) {
    if (!pending || committing) return
    setError(null)
    setCommitting(true)
    try {
      const realCenter = latLngToLocal(latlng, missionOrigin)
      const scale = deriveScale(pending.segments)
      const rotationDeg = deriveRotation(pending.segments)
      const created = await commitCalibration(pending, scale, rotationDeg, realCenter)
      setLast({ ...pending, scale, realCenter, inverted: false, ...created })
      setPending(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCommitting(false)
    }
  }

  async function handleInvertOrientation() {
    if (!last || committing) return
    setError(null)
    setCommitting(true)
    try {
      const inverted = !last.inverted
      const rotationDeg = deriveRotation(last.segments, inverted)
      await Promise.all([
        ...last.createdSegmentIds.map((id) => deleteFeltSegment(id)),
        ...last.createdPointIds.map((id) => deleteFeltPoint(id)),
      ])
      const created = await commitCalibration(last, last.scale, rotationDeg, last.realCenter)
      setLast({ ...last, inverted, ...created })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCommitting(false)
    }
  }

  return (
    <div>
      <p>{CAPTURE_ASSUMPTION_TEXT}</p>
      {error && <p role="alert">{error}</p>}
      {summary && <p>{summary}</p>}
      {committing && <p>Enregistrement en cours…</p>}
      {pending && !committing && (
        <>
          <p>Cliquez sur le plan à l'endroit où vous vous teniez pour cette photo (centre de la photo).</p>
          <div style={MAP_WRAPPER_STYLE}>
            <MapView center={mapCenter} onMapClick={handleMapClick} />
          </div>
        </>
      )}
      {last && !committing && (
        <button onClick={handleInvertOrientation}>Inverser l'orientation</button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test file, verify it passes**

Run: `npm test -- --run src/components/RodDetectionPanel.test.tsx`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/RodDetectionPanel.tsx src/components/RodDetectionPanel.test.tsx
git commit -m "feat: 1-click auto calibration for rod-photo detection"
```

### Task 7: `MissionPhotosGallery.tsx` — drop the now-removed `onCalibrated` wiring

**Files:**
- Modify: `src/components/MissionPhotosGallery.tsx`
- Modify: `src/components/MissionPhotosGallery.test.tsx`

`RodDetectionPanel` no longer has an `onCalibrated` prop (Task 6 collapsed calibration into the same click that runs detection), so the caller's `handlePhotoCalibrated` and the prop it fed become unused — remove them rather than leave dead code.

**Also in scope for the same reason:** once `handlePhotoCalibrated` is gone, `setPhotoCalibration` in `src/data/missionPhotosRepo.ts` has no remaining caller anywhere in `src/` (confirmed by grep during plan review) — Task 6/7 together are what make it dead, so its removal belongs in this task rather than being left as an orphan. `MissionPhoto.calibration` itself (the field and DB column) is NOT removed: existing photos may already carry a non-null value from before this feature shipped, and deleting a column is a separate, higher-risk schema decision outside this chunk's scope — only its doc comment is updated so it no longer describes a write path that no longer exists.

- [ ] **Step 1: Update the test file — drop `onCalibrated` from the mock, delete the now-inapplicable test**

In `src/components/MissionPhotosGallery.test.tsx`:

```typescript
vi.mock('./RodDetectionPanel', () => ({
  RodDetectionPanel: ({
    photo,
    planId,
  }: {
    photo: { id: string }
    planId: string
  }) => <div data-testid="rod-detection-panel" data-photo-id={photo.id} data-plan-id={planId} />,
}))
```

Delete the `'keeps the panel open on the updated photo once its calibration is saved'` test entirely — it exercised `onCalibrated`/`simulate-photo-calibrated`, which no longer exist on `RodDetectionPanel`'s contract. The two-step "calibrate, then detect while staying on the same photo" behavior it checked is now moot: there is only one step.

- [ ] **Step 2: Run the test file, verify the remaining tests fail only where expected**

Run: `npm test -- --run src/components/MissionPhotosGallery.test.tsx`
Expected: FAIL on `'opens RodDetectionPanel for the chosen photo...'` and `'returns to the gallery...'` only if they happen to reference `onCalibrated` (they don't per the current file) — otherwise this step may already pass; that's fine, proceed to Step 3 regardless since the component still needs the dead code removed.

- [ ] **Step 3: Remove `handlePhotoCalibrated` and the `onCalibrated` prop from the component**

In `src/components/MissionPhotosGallery.tsx`, delete the `handlePhotoCalibrated` function (lines 36-40) and its doc comment, and change the `RodDetectionPanel` usage to:

```tsx
<RodDetectionPanel
  photo={selectedPhoto}
  planId={planId}
  missionOrigin={missionOrigin}
  mapCenter={[missionOrigin.lat, missionOrigin.lng]}
/>
```

- [ ] **Step 4: Run the test file, verify it passes**

Run: `npm test -- --run src/components/MissionPhotosGallery.test.tsx`
Expected: PASS, all cases.

- [ ] **Step 5: Remove the now-dead `setPhotoCalibration`**

In `src/data/missionPhotosRepo.ts`, delete the `setPhotoCalibration` function (currently lines 67-80) and drop the now-unused `AffineTransform` import if nothing else in the file still uses it.

In `src/data/missionPhotosRepo.test.ts`, remove the `setPhotoCalibration` import (currently line 3) and delete the `"sets a photo's calibration transform"` test (currently lines 70-88).

In `src/domain/types.ts`, update `MissionPhoto.calibration`'s doc comment (currently lines 230-232) from:

```typescript
  /** Per-photo calibration (pixel → mission-local metric), null until Laurent
   * calibrates this photo for rod detection — each aerial photo has its own
   * framing/angle, so calibration lives on the photo, not the mission. */
  calibration: AffineTransform | null
```

to:

```typescript
  /** Legacy per-photo calibration (pixel → mission-local metric). No longer
   * written by the app — rod-photo detection now derives its transform
   * automatically per detection run (see RodDetectionPanel.tsx /
   * rodPhotoCalibration.ts) rather than persisting one on the photo. Kept
   * for photos calibrated before that change; may be non-null on old rows. */
  calibration: AffineTransform | null
```

- [ ] **Step 6: Run the full suite, verify nothing else referenced the removed function**

Run: `npm test -- --run && npx tsc -b`
Expected: PASS / clean — a `tsc -b` failure here would mean something outside the files already touched still imports `setPhotoCalibration`, which would need investigating before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/components/MissionPhotosGallery.tsx src/components/MissionPhotosGallery.test.tsx src/data/missionPhotosRepo.ts src/data/missionPhotosRepo.test.ts src/domain/types.ts
git commit -m "refactor: drop onCalibrated/setPhotoCalibration made dead by 1-click calibration"
```

### Task 8: Real-photo validation (manual, not automated)

**Why this can't be a Vitest test:** every automated test in Tasks 6-7 mocks `rodPhotoCalibration`'s trigonometry — Chunk 1 proved the math correct in the abstract (Task 3's fixtures, hand-verified in plan review), but the spec (§"Dérivation de la transformation → Rotation θ") explicitly flags the sign convention between `atan2`'s pixel-space angle (y grows downward in image space) and the real-world bearing family (y grows north in `latLngToLocal`'s local frame) as **unverified against a real photo**. A wrong sign would still pass every mocked unit test, since the mocks never exercise real trigonometry end-to-end against a real image.

- [ ] **Step 1: With the app running against a real Supabase project, open a mission that has at least one uploaded rod photo with ≥1 complete rod on a known network**

- [ ] **Step 2: Open that photo in "Détecter les tiges", click the plan where the photo was taken, and compare the resulting FeltSegment(s) against what Laurent knows to be true on the ground (rod orientation, which network)**

- [ ] **Step 3: If the orientation is off by exactly 90°, click "Inverser l'orientation" and confirm it now matches**

- [ ] **Step 4: If the orientation is wrong in some *other* way (not a clean 90° flip), that's a sign bug in `deriveRotation`'s `atan2`/family-member arithmetic, not the accepted 90° ambiguity — stop and debug via superpowers:systematic-debugging rather than papering over it with another correction button.**

- [ ] **Step 5: Report the result back — this task has no commit of its own; it's a go/no-go gate on Chunk 1's `deriveRotation` before considering the whole feature done.**

**Checkpoint after Chunk 2:** run the full suite and `tsc -b` once more.

```bash
npm test -- --run
npx tsc -b
```

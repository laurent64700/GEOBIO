# Plan 1 — Moteur réseaux telluriques (Sous-système B, saisie manuelle) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PWA where Laurent can create a mission, place an exterior plan (IGN) and/or a calibrated interior plan, generate a theoretical grid from a network template (Hartmann/Curry/Peyré/Or/Argent/Bagua), and adjust it point-by-point to match what he senses on-site — with an orthogonality assist and free-form tracing for water/faults.

**Architecture:** React + TypeScript + Vite PWA. Leaflet for the map (chosen over MapLibre because the interior-plan calibration relies on the Leaflet-only `Leaflet.DistortableImage` plugin). Supabase (Postgres + PostGIS extension enabled, though Plan 1's editable line/point data is stored as `jsonb` rather than native geometry columns — see Chunk 1 rationale). All grid math (generation, calibration transform, orthogonality deviation) lives in framework-free TypeScript modules under `src/geometry/`, unit-tested with Vitest, so the hardest-to-get-right logic is verified independently of any UI or map library.

**Tech Stack:** Vite, React 18, TypeScript, Leaflet + react-leaflet, Leaflet.DistortableImage, @geoman-io/leaflet-geoman-free (line point editing), Supabase JS v2, Vitest, @testing-library/react.

**Spec reference:** `docs/superpowers/specs/2026-07-15-geobio-architecture-design.md`, §6.0–§6.2, §6.4 (§6.3 optical capture is explicitly out of scope for this plan — it is Plan 2).

---

## Chunk 1: Project scaffold, Supabase schema, domain types

### Task 1: Scaffold the Vite + React + TypeScript PWA

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `src/main.tsx`, `src/App.tsx`
- Create: `.gitignore`

- [ ] **Step 1: Scaffold with Vite (non-interactively — the repo root already contains `docs/`, and `create-vite` prompts interactively when the target directory isn't empty)**

Run, from `D:\LAURENT PC\GEOBIO`:
```bash
npm create vite@latest temp-scaffold -- --template react-ts
cp -r temp-scaffold/. .
rm -rf temp-scaffold
```
(scaffolding into the empty `temp-scaffold` subdirectory avoids the "directory not
empty" interactive prompt entirely, then its contents are copied into the repo root —
`cp -r temp-scaffold/.` includes dotfiles like `.gitignore`)

Expected: `package.json`, `src/`, `index.html`, `tsconfig.json` created at the repo
root; `docs/` untouched.

- [ ] **Step 2: Add PWA plugin, Vitest, Testing Library, Leaflet stack dependencies**

Run:
```bash
npm install leaflet react-leaflet @supabase/supabase-js
npm install -D vite-plugin-pwa vitest @testing-library/react @testing-library/jest-dom jsdom @types/leaflet
```

- [ ] **Step 3: Configure `vite.config.ts` with the PWA plugin and Vitest jsdom environment**

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'GEOBIO',
        short_name: 'GEOBIO',
        start_url: '.',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2b6a3f',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
```

Note: no `workbox`/offline caching strategy is configured — matches the spec's explicit
decision (§4 "Connectivité terrain") that Plan 1 has no offline-first requirement. The
manifest exists purely for installability (add-to-homescreen), not offline capability.

- [ ] **Step 4: Add two placeholder PWA icons so the manifest doesn't reference missing files**

Copy any 192x192 and 512x512 PNG into `public/pwa-192.png` and `public/pwa-512.png`
(temporary placeholders — real branding is not part of this plan's scope).

- [ ] **Step 5: Verify the dev server starts**

Run: `npm run dev`
Expected: Vite prints a `Local: http://localhost:5173/` URL, and the default Vite+React
page loads without console errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html src public .gitignore
git commit -m "Scaffold Vite + React + TypeScript PWA"
```

---

### Task 2: Supabase project wiring and environment config

**Files:**
- Create: `.env.local.example`
- Create: `src/lib/supabaseClient.ts`
- Modify: `.gitignore` (ensure `.env.local` is ignored)

- [ ] **Step 1: Document the required environment variables**

```
# .env.local.example
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxx
```

- [ ] **Step 2: Confirm `.env.local` is git-ignored**

Check `.gitignore` contains `.env.local` (Vite's default template already includes
`*.local` — verify, don't duplicate).

- [ ] **Step 3: Write the Supabase client module**

```typescript
// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — copy .env.local.example to .env.local and fill in your Supabase project values.'
  )
}

export const supabase = createClient(url, anonKey)
```

- [ ] **Step 4: Manual verification note**

This module has no unit test — it's a thin wrapper whose only behavior is "throw on
missing env vars," which is exercised naturally the first time anyone runs the app
without `.env.local`. Real connectivity is verified in Chunk 3 once a query is made
against it.

- [ ] **Step 5: Commit**

```bash
git add .env.local.example src/lib/supabaseClient.ts .gitignore
git commit -m "Add Supabase client wiring"
```

---

### Task 3: Database schema migration

**Files:**
- Create: `supabase/migrations/0001_plan1_schema.sql`

**Rationale (read before writing the SQL):** the spec (§4) justifies Supabase partly on
PostGIS being "natif pour géométries/requêtes spatiales." Plan 1 has no spatial-query
requirement (no "find lines near X" feature is in scope) — every line/point is only
ever read and rewritten whole by the mission that owns it. Storing `theoretical_points`
/ `adjusted_points` as `jsonb` arrays of `{x, y}` is therefore simpler for Plan 1's
actual read/write pattern than native `geometry(LineString)` columns, with no loss of
capability. The `postgis` extension is still enabled so a future sub-project (e.g.
proximity queries across missions) can add geometry columns without a schema rewrite.

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/0001_plan1_schema.sql
create extension if not exists postgis;
create extension if not exists pgcrypto; -- gen_random_uuid()

create table mission (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  mission_date date not null,
  declination_deg double precision,
  created_at timestamptz not null default now()
);

create table plan (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references mission(id) on delete cascade,
  kind text not null check (kind in ('exterieur', 'interieur')),
  image_url text,
  -- affine transform {a,b,c,d,e,f} mapping image pixel -> mission-local metric (x,y);
  -- null for 'exterieur' plans, which read coordinates directly off the IGN base layer
  calibration jsonb,
  created_at timestamptz not null default now(),
  constraint interieur_requires_image check (
    kind = 'exterieur' or (kind = 'interieur' and image_url is not null)
  )
);

create table grid_template (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  spacing_x_m double precision not null check (spacing_x_m > 0),
  spacing_y_m double precision not null check (spacing_y_m > 0),
  angle_true_north_deg double precision not null,
  origin_offset_x double precision not null default 0,
  origin_offset_y double precision not null default 0,
  created_at timestamptz not null default now()
);

create table grid_instance (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plan(id) on delete cascade,
  -- frozen copy of the grid_template row at generation time (see spec §6.1:
  -- editing a template later must never retroactively change existing instances)
  template_snapshot jsonb not null,
  origin_x double precision not null,
  origin_y double precision not null,
  created_at timestamptz not null default now()
);

create table grid_line (
  id uuid primary key default gen_random_uuid(),
  grid_instance_id uuid not null references grid_instance(id) on delete cascade,
  -- 'axis-a' or 'axis-b': the two perpendicular line families of a grid (see §6.1 Chunk 2)
  family text not null check (family in ('axis-a', 'axis-b')),
  theoretical_points jsonb not null, -- [{x,y}, ...] straight line as generated
  adjusted_points jsonb not null,    -- [{x,y}, ...] current, possibly deformed line
  created_at timestamptz not null default now()
);

create table freeform_network (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plan(id) on delete cascade,
  kind text not null check (kind in ('eau', 'faille')),
  points jsonb not null, -- [{x,y}, ...]
  created_at timestamptz not null default now()
);

create index on plan (mission_id);
create index on grid_instance (plan_id);
create index on grid_line (grid_instance_id);
create index on freeform_network (plan_id);
```

- [ ] **Step 2: ⚠️ Human checkpoint — link the Supabase CLI to Laurent's project**

This step needs Laurent, not an agentic worker: it requires an interactive OAuth login
and his actual project reference. **Pause here and ask him to run, in a terminal he
controls:**
```bash
npx supabase login
npx supabase link --project-ref <his-project-ref>
```
Once he confirms this is done (and that `.env.local` — Task 2 — has his project's real
URL/anon key), continue to Step 3.

- [ ] **Step 3: Apply the migration**

Run: `npx supabase db push`

Expected: CLI reports the migration applied with no errors.

- [ ] **Step 4: Verify the tables exist**

Run: `npx supabase db diff --schema public`
Expected: no diff (schema matches the migration that was just pushed).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_plan1_schema.sql
git commit -m "Add Plan 1 database schema (mission, plan, grid_template, grid_instance, grid_line, freeform_network)"
```

**Security note:** no RLS policies are defined here — the anon key (Task 2) has full
table access. Acceptable for now per spec (§1: personal single-user tool, no
multi-account before Phase 5); revisit when Phase 5 introduces other practitioners.

**Mission angle convention:** `mission` intentionally has no "true north" column.
Spec §3.1 fixes true north as the system-wide angle reference for every mission — it's
a fixed convention, not a per-mission value, so nothing needs to be stored beyond the
optional `declination_deg` (used only to convert to magnetic north for display, per
§3.1). The actual angle values live on `grid_template.angle_true_north_deg`.

---

### Task 4: Shared TypeScript domain types

**Files:**
- Create: `src/domain/types.ts`
- Test: `src/domain/types.test.ts`

- [ ] **Step 1: Write a failing compile-time test**

```typescript
// src/domain/types.test.ts
import { describe, it, expect } from 'vitest'
import type { Point, GridTemplate, GridLine } from './types'

describe('domain types', () => {
  it('Point has numeric x/y', () => {
    const p: Point = { x: 1.5, y: -2.25 }
    expect(p.x).toBe(1.5)
    expect(p.y).toBe(-2.25)
  })

  it('GridLine family is restricted to axis-a or axis-b', () => {
    const line: GridLine = {
      id: '1',
      gridInstanceId: '1',
      family: 'axis-a',
      theoreticalPoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      adjustedPoints: [{ x: 0, y: 0 }, { x: 10, y: 0.3 }],
    }
    expect(line.family).toBe('axis-a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails (types.ts doesn't exist yet)**

Run: `npx vitest run src/domain/types.test.ts`
Expected: FAIL — `Cannot find module './types'`

- [ ] **Step 3: Write the domain types**

```typescript
// src/domain/types.ts
export interface Point {
  x: number
  y: number
}

/** Affine transform mapping image pixel coordinates to mission-local metric (x, y). */
export interface AffineTransform {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export interface Mission {
  id: string
  address: string
  missionDate: string // ISO date
  declinationDeg: number | null
}

export type PlanKind = 'exterieur' | 'interieur'

export interface Plan {
  id: string
  missionId: string
  kind: PlanKind
  imageUrl: string | null
  calibration: AffineTransform | null
}

export interface GridTemplate {
  id: string
  name: string
  spacingXM: number
  spacingYM: number
  angleTrueNorthDeg: number
  originOffsetX: number
  originOffsetY: number
}

export interface GridInstance {
  id: string
  planId: string
  templateSnapshot: GridTemplate
  originX: number
  originY: number
}

export type GridLineFamily = 'axis-a' | 'axis-b'

export interface GridLine {
  id: string
  gridInstanceId: string
  family: GridLineFamily
  theoreticalPoints: Point[]
  adjustedPoints: Point[]
}

export type FreeformNetworkKind = 'eau' | 'faille'

export interface FreeformNetwork {
  id: string
  planId: string
  kind: FreeformNetworkKind
  points: Point[]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/types.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/domain/types.test.ts
git commit -m "Add Plan 1 domain types"
```

---

**Chunk 1 exit criteria:** `npm run dev` serves the app, `npx vitest run` passes,
Supabase schema is live, domain types compile and are tested.

---

## Chunk 2: Geometry core (grid generation, plan calibration, orthogonality assist)

All three tasks below are framework-free TypeScript — no React, no Leaflet, no
Supabase. This is deliberate: these are the calculations the spec (§6.1, §6.2, §3.1)
identifies as the parts that must be *correct*, and pure functions are the cheapest
thing in the whole plan to verify exhaustively with Vitest, independent of any UI.

### Task 5: Grid generation (bearing math, line clipping, theoretical grid lines)

**Files:**
- Create: `src/geometry/gridGeneration.ts`
- Test: `src/geometry/gridGeneration.test.ts`

- [ ] **Step 1: Write failing tests for the bearing/direction helpers and line clipping**

```typescript
// src/geometry/gridGeneration.test.ts
import { describe, it, expect } from 'vitest'
import {
  bearingUnitVector,
  clipLineToBounds,
  generateTheoreticalLines,
} from './gridGeneration'

describe('bearingUnitVector', () => {
  it('bearing 0 (north) points to (0, 1)', () => {
    const v = bearingUnitVector(0)
    expect(v.x).toBeCloseTo(0)
    expect(v.y).toBeCloseTo(1)
  })

  it('bearing 90 (east) points to (1, 0)', () => {
    const v = bearingUnitVector(90)
    expect(v.x).toBeCloseTo(1)
    expect(v.y).toBeCloseTo(0)
  })
})

describe('clipLineToBounds', () => {
  const bounds = { minX: -5, maxX: 5, minY: -5, maxY: 5 }

  it('clips a horizontal line through the origin to the box edges', () => {
    const clipped = clipLineToBounds({ x: 0, y: 0 }, { x: 1, y: 0 }, bounds)
    expect(clipped).not.toBeNull()
    expect(clipped![0]).toEqual({ x: -5, y: 0 })
    expect(clipped![1]).toEqual({ x: 5, y: 0 })
  })

  it('returns null for a line entirely outside the box', () => {
    const clipped = clipLineToBounds({ x: 0, y: 100 }, { x: 1, y: 0 }, bounds)
    expect(clipped).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/geometry/gridGeneration.test.ts`
Expected: FAIL — `Cannot find module './gridGeneration'`

- [ ] **Step 3: Implement bearing helpers and line clipping**

```typescript
// src/geometry/gridGeneration.ts
import type { GridTemplate, GridLineFamily, Point } from '../domain/types'

export interface BoundingBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** Unit vector for a compass bearing in degrees (0 = north, 90 = east, clockwise). */
export function bearingUnitVector(bearingDeg: number): Point {
  const rad = (bearingDeg * Math.PI) / 180
  return { x: Math.sin(rad), y: Math.cos(rad) }
}

/**
 * Clips the infinite line { origin + t * direction | t in R } to an axis-aligned
 * bounding box. Returns the two intersection points (in increasing-t order), or
 * null if the line never crosses the box.
 */
export function clipLineToBounds(
  origin: Point,
  direction: Point,
  bounds: BoundingBox
): [Point, Point] | null {
  let tMin = -Infinity
  let tMax = Infinity

  if (direction.x === 0) {
    if (origin.x < bounds.minX || origin.x > bounds.maxX) return null
  } else {
    const t1 = (bounds.minX - origin.x) / direction.x
    const t2 = (bounds.maxX - origin.x) / direction.x
    tMin = Math.max(tMin, Math.min(t1, t2))
    tMax = Math.min(tMax, Math.max(t1, t2))
  }

  if (direction.y === 0) {
    if (origin.y < bounds.minY || origin.y > bounds.maxY) return null
  } else {
    const t1 = (bounds.minY - origin.y) / direction.y
    const t2 = (bounds.maxY - origin.y) / direction.y
    tMin = Math.max(tMin, Math.min(t1, t2))
    tMax = Math.min(tMax, Math.max(t1, t2))
  }

  if (tMin > tMax) return null

  return [
    { x: origin.x + tMin * direction.x, y: origin.y + tMin * direction.y },
    { x: origin.x + tMax * direction.x, y: origin.y + tMax * direction.y },
  ]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/geometry/gridGeneration.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write a failing test for full grid generation**

```typescript
// append to src/geometry/gridGeneration.test.ts
describe('generateTheoreticalLines', () => {
  it('generates axis-a and axis-b line families covering the bounds', () => {
    const template = { spacingXM: 2, spacingYM: 2.5, angleTrueNorthDeg: 0 }
    const origin = { x: 0, y: 0 }
    const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }

    const lines = generateTheoreticalLines(template, origin, bounds)

    const axisA = lines.filter((l) => l.family === 'axis-a')
    const axisB = lines.filter((l) => l.family === 'axis-b')
    expect(axisA).toHaveLength(3) // x = -2.5, 0, 2.5 within [-3, 3]
    expect(axisB).toHaveLength(3) // y = -2, 0, 2 within [-3, 3]

    const central = axisA.find((l) => Math.abs(l.points[0].x) < 1e-9)
    expect(central).toBeDefined()
    expect(central!.points[0]).toEqual({ x: 0, y: -3 })
    expect(central!.points[1]).toEqual({ x: 0, y: 3 })
  })

  it('rotates both families together when angleTrueNorthDeg is set (Curry-style 45°)', () => {
    const template = { spacingXM: 2, spacingYM: 2, angleTrueNorthDeg: 45 }
    const origin = { x: 0, y: 0 }
    const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }

    const lines = generateTheoreticalLines(template, origin, bounds)
    // The central (k=0) axis-a line passes through the origin, but
    // clipLineToBounds returns its box-boundary endpoints, not the origin
    // itself — so identify it by midpoint (which IS the origin for the
    // central line), not by endpoint proximity.
    const central = lines.find((l) => {
      if (l.family !== 'axis-a') return false
      const midX = (l.points[0].x + l.points[1].x) / 2
      const midY = (l.points[0].y + l.points[1].y) / 2
      return Math.hypot(midX, midY) < 1e-6
    })
    expect(central).toBeDefined()
    // At 45°, the line runs along (sin45°, cos45°) clipped to the box —
    // expected endpoints (-3,-3) and (3,3), neither purely vertical nor horizontal.
    expect(Math.abs(central!.points[0].x)).toBeCloseTo(3)
    expect(Math.abs(central!.points[0].y)).toBeCloseTo(3)
    expect(central!.points[0].x).toBeCloseTo(central!.points[0].y)
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/geometry/gridGeneration.test.ts`
Expected: FAIL — `generateTheoreticalLines is not a function`

- [ ] **Step 7: Implement `generateTheoreticalLines`**

```typescript
// append to src/geometry/gridGeneration.ts
export interface GeneratedLine {
  family: GridLineFamily
  points: [Point, Point]
}

function maxOffsetIndexNeeded(
  origin: Point,
  spacing: number,
  bounds: BoundingBox
): number {
  const corners: Point[] = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
  ]
  // Deliberately a loose over-approximation (max Euclidean distance to any
  // corner, not projected onto the step direction) — simple and always safe:
  // candidates that don't actually reach the box are dropped later because
  // clipLineToBounds returns null for them.
  const maxDist = Math.max(
    ...corners.map((c) => Math.hypot(c.x - origin.x, c.y - origin.y))
  )
  return Math.ceil(maxDist / spacing) + 1
}

/**
 * `origin` is the final, already-composed grid origin (i.e. `grid_instance.origin_{x,y}`
 * with `template.originOffsetX/Y` already applied) — composing that offset is the
 * caller's responsibility (Chunk 5, when a `GridInstance` is generated), not this
 * function's, since this module has no knowledge of `GridInstance`.
 */
export function generateTheoreticalLines(
  template: Pick<GridTemplate, 'spacingXM' | 'spacingYM' | 'angleTrueNorthDeg'>,
  origin: Point,
  bounds: BoundingBox
): GeneratedLine[] {
  const primaryDir = bearingUnitVector(template.angleTrueNorthDeg)
  const perpDir = bearingUnitVector(template.angleTrueNorthDeg + 90)
  const lines: GeneratedLine[] = []

  const offsetA = maxOffsetIndexNeeded(origin, template.spacingYM, bounds)
  for (let k = -offsetA; k <= offsetA; k++) {
    const linePoint: Point = {
      x: origin.x + k * template.spacingYM * perpDir.x,
      y: origin.y + k * template.spacingYM * perpDir.y,
    }
    const clipped = clipLineToBounds(linePoint, primaryDir, bounds)
    if (clipped) lines.push({ family: 'axis-a', points: clipped })
  }

  const offsetB = maxOffsetIndexNeeded(origin, template.spacingXM, bounds)
  for (let k = -offsetB; k <= offsetB; k++) {
    const linePoint: Point = {
      x: origin.x + k * template.spacingXM * primaryDir.x,
      y: origin.y + k * template.spacingXM * primaryDir.y,
    }
    const clipped = clipLineToBounds(linePoint, perpDir, bounds)
    if (clipped) lines.push({ family: 'axis-b', points: clipped })
  }

  return lines
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/geometry/gridGeneration.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 9: Commit**

```bash
git add src/geometry/gridGeneration.ts src/geometry/gridGeneration.test.ts
git commit -m "Add grid generation math (bearing, line clipping, theoretical grid lines)"
```

---

### Task 6: Plan calibration (control points → similarity transform)

**Files:**
- Create: `src/geometry/calibration.ts`
- Test: `src/geometry/calibration.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/geometry/calibration.test.ts
import { describe, it, expect } from 'vitest'
import { calibratePlan, CalibrationError } from './calibration'

describe('calibratePlan', () => {
  it('fits a similarity transform (rotation + scale + translation) from 2 control points', () => {
    // Real-world mapping being fit: x' = -py + 10, y' = px + 20
    // (a 90° rotation, scale 1, translated by (10, 20))
    const transform = calibratePlan([
      { image: { x: 0, y: 0 }, real: { x: 10, y: 20 } },
      { image: { x: 10, y: 0 }, real: { x: 10, y: 30 } },
    ])

    expect(transform.a).toBeCloseTo(0)
    expect(transform.b).toBeCloseTo(-1)
    expect(transform.c).toBeCloseTo(1)
    expect(transform.d).toBeCloseTo(0)
    expect(transform.e).toBeCloseTo(10)
    expect(transform.f).toBeCloseTo(20)
  })

  it('rejects fewer than 2 control points', () => {
    expect(() =>
      calibratePlan([{ image: { x: 0, y: 0 }, real: { x: 0, y: 0 } }])
    ).toThrow(CalibrationError)
  })

  it('rejects control points closer than 2 meters apart in real space', () => {
    expect(() =>
      calibratePlan([
        { image: { x: 0, y: 0 }, real: { x: 0, y: 0 } },
        { image: { x: 10, y: 0 }, real: { x: 1, y: 0 } },
      ])
    ).toThrow(CalibrationError)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/geometry/calibration.test.ts`
Expected: FAIL — `Cannot find module './calibration'`

- [ ] **Step 3: Implement `calibratePlan`**

```typescript
// src/geometry/calibration.ts
import type { AffineTransform, Point } from '../domain/types'

export interface ControlPoint {
  /** Pixel coordinates in the source plan image. */
  image: Point
  /** Mission-local metric coordinates this pixel corresponds to. */
  real: Point
}

export class CalibrationError extends Error {}

// Spec §3.1 caps control points at "2 à 4" — enforced by the UI (Chunk 4, which
// only ever offers up to 4 control-point slots), not here: this function accepts
// any count >= MIN_CONTROL_POINTS by design, so it isn't artificially restricted
// if that UI cap ever changes.
const MIN_CONTROL_POINTS = 2
const MIN_REAL_DISTANCE_M = 2

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length
  const M = matrix.map((row, i) => [...row, rhs[i]])

  for (let col = 0; col < n; col++) {
    let pivotRow = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r
    }
    ;[M[col], M[pivotRow]] = [M[pivotRow], M[col]]

    const pivot = M[col][col]
    if (Math.abs(pivot) < 1e-9) {
      throw new CalibrationError(
        'Points de contrôle dégénérés (colinéaires en image ou en réel) — calage impossible.'
      )
    }
    for (let c = col; c <= n; c++) M[col][c] /= pivot

    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = M[r][col]
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c]
    }
  }

  return M.map((row) => row[n])
}

/**
 * Fits a similarity transform (uniform scale + rotation + translation — no
 * shear, matching spec §3.1 "échelle + rotation + position") from 2-4 control
 * points, by least squares. The transform is linear in its 4 unknowns
 * (a, b, tx, ty) regardless of point count, so the same solver handles the
 * exactly-determined case (2 points) and the over-determined case (3-4
 * points) uniformly — no separate "exact" vs "least-squares" code paths.
 */
export function calibratePlan(points: ControlPoint[]): AffineTransform {
  if (points.length < MIN_CONTROL_POINTS) {
    throw new CalibrationError(
      `Au moins ${MIN_CONTROL_POINTS} points de contrôle sont nécessaires pour caler un plan.`
    )
  }

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dist = Math.hypot(
        points[i].real.x - points[j].real.x,
        points[i].real.y - points[j].real.y
      )
      if (dist < MIN_REAL_DISTANCE_M) {
        throw new CalibrationError(
          `Les points de contrôle ${i + 1} et ${j + 1} sont trop proches ` +
            `(${dist.toFixed(2)} m) — au moins ${MIN_REAL_DISTANCE_M} m d'écart requis.`
        )
      }
    }
  }

  // x' = a*x - b*y + tx ; y' = b*x + a*y + ty  — linear in (a, b, tx, ty)
  const rows: number[][] = []
  const rhs: number[] = []
  for (const { image: p, real: m } of points) {
    rows.push([p.x, -p.y, 1, 0])
    rhs.push(m.x)
    rows.push([p.y, p.x, 0, 1])
    rhs.push(m.y)
  }

  const ATA = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
  const ATb = [0, 0, 0, 0]
  for (let i = 0; i < rows.length; i++) {
    for (let r = 0; r < 4; r++) {
      ATb[r] += rows[i][r] * rhs[i]
      for (let c = 0; c < 4; c++) {
        ATA[r][c] += rows[i][r] * rows[i][c]
      }
    }
  }

  const [a, b, tx, ty] = solveLinearSystem(ATA, ATb)
  return { a, b: -b, c: b, d: a, e: tx, f: ty }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/geometry/calibration.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/calibration.ts src/geometry/calibration.test.ts
git commit -m "Add plan calibration (control points to similarity transform)"
```

---

### Task 7: Orthogonality micro-adjustment assist

**Files:**
- Create: `src/geometry/orthogonality.ts`
- Test: `src/geometry/orthogonality.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/geometry/orthogonality.test.ts
import { describe, it, expect } from 'vitest'
import {
  lineBearingDeg,
  angularDeviationDeg,
  suggestOrthogonalStraighten,
  getOrthogonalitySuggestion,
} from './orthogonality'

describe('lineBearingDeg', () => {
  it('a line running due north has bearing 0', () => {
    expect(lineBearingDeg([{ x: 0, y: 0 }, { x: 0, y: 10 }])).toBeCloseTo(0)
  })

  it('a line running due east has bearing 90', () => {
    expect(lineBearingDeg([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBeCloseTo(90)
  })
})

describe('angularDeviationDeg', () => {
  it('small deviations return their signed difference', () => {
    expect(angularDeviationDeg(5, 0)).toBeCloseTo(5)
  })

  it('compares mod 180 since a line has no directional sign', () => {
    // 170° actual vs 0° theoretical is really only 10° off (the "other end" of the line)
    expect(angularDeviationDeg(170, 0)).toBeCloseTo(-10)
  })
})

describe('suggestOrthogonalStraighten', () => {
  it('produces a straightened segment matching the theoretical bearing, preserving centroid and length', () => {
    const points = [{ x: 0, y: 0 }, { x: 2, y: 10 }]
    const suggested = suggestOrthogonalStraighten(points, 0) // theoretical: due north

    expect(suggested[0].x).toBeCloseTo(1) // centroid.x preserved
    expect(suggested[1].x).toBeCloseTo(1)
    const originalLength = Math.hypot(2, 10)
    const suggestedLength = Math.hypot(
      suggested[1].x - suggested[0].x,
      suggested[1].y - suggested[0].y
    )
    expect(suggestedLength).toBeCloseTo(originalLength)
  })
})

describe('getOrthogonalitySuggestion', () => {
  it('computes deviation against axis-b (perpendicular, +90°) for a near-east-west line', () => {
    const template = { angleTrueNorthDeg: 0 }
    const points = [{ x: 0, y: 0 }, { x: 10, y: 1 }] // nearly east-west, slightly tilted
    const result = getOrthogonalitySuggestion(points, 'axis-b', template)

    // atan2(10, 1) in degrees ≈ 84.29 ; theoretical axis-b bearing = 0 + 90 = 90
    expect(result.deviationDeg).toBeCloseTo(-5.71, 1)
    expect(result.suggestedPoints).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/geometry/orthogonality.test.ts`
Expected: FAIL — `Cannot find module './orthogonality'`

- [ ] **Step 3: Implement the orthogonality module**

```typescript
// src/geometry/orthogonality.ts
import type { GridLineFamily, GridTemplate, Point } from '../domain/types'
import { bearingUnitVector } from './gridGeneration'

/** Bearing (degrees, 0 = north, clockwise) of the straight line from the first to the last point. */
export function lineBearingDeg(points: Point[]): number {
  if (points.length < 2) {
    throw new Error('Une ligne nécessite au moins 2 points pour calculer une direction.')
  }
  const start = points[0]
  const end = points[points.length - 1]
  const rad = Math.atan2(end.x - start.x, end.y - start.y)
  return (rad * 180) / Math.PI
}

/**
 * Angular difference between two bearings, compared modulo 180° — a line has
 * no directional sign, so 170° and 0° are 10° apart, not 170°. Result is in
 * (-90, 90].
 */
export function angularDeviationDeg(actualBearingDeg: number, theoreticalBearingDeg: number): number {
  let diff = (((actualBearingDeg - theoreticalBearingDeg) % 180) + 180) % 180
  if (diff > 90) diff -= 180
  return diff
}

/**
 * A straightened version of `points`, rotated to `theoreticalBearingDeg`
 * while preserving the line's centroid and total end-to-end length — this is
 * the "preview" shown by the orthogonality assist (spec §6.2), never applied
 * automatically.
 */
export function suggestOrthogonalStraighten(points: Point[], theoreticalBearingDeg: number): [Point, Point] {
  const centroid: Point = {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  }
  const start = points[0]
  const end = points[points.length - 1]
  const halfLength = Math.hypot(end.x - start.x, end.y - start.y) / 2
  const dir = bearingUnitVector(theoreticalBearingDeg)

  return [
    { x: centroid.x - dir.x * halfLength, y: centroid.y - dir.y * halfLength },
    { x: centroid.x + dir.x * halfLength, y: centroid.y + dir.y * halfLength },
  ]
}

/** The theoretical bearing of a grid line family: axis-a runs along the template's own angle, axis-b perpendicular to it. */
export function familyBearingDeg(
  template: Pick<GridTemplate, 'angleTrueNorthDeg'>,
  family: GridLineFamily
): number {
  return family === 'axis-a' ? template.angleTrueNorthDeg : template.angleTrueNorthDeg + 90
}

export function getOrthogonalitySuggestion(
  linePoints: Point[],
  family: GridLineFamily,
  template: Pick<GridTemplate, 'angleTrueNorthDeg'>
): { deviationDeg: number; suggestedPoints: [Point, Point] } {
  const theoreticalBearing = familyBearingDeg(template, family)
  const actualBearing = lineBearingDeg(linePoints)
  return {
    deviationDeg: angularDeviationDeg(actualBearing, theoreticalBearing),
    suggestedPoints: suggestOrthogonalStraighten(linePoints, theoreticalBearing),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/geometry/orthogonality.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/orthogonality.ts src/geometry/orthogonality.test.ts
git commit -m "Add orthogonality micro-adjustment assist math"
```

---

**Chunk 2 exit criteria:** `npx vitest run` passes all geometry tests (13 tests across
3 files); no React/Leaflet/Supabase dependency anywhere in `src/geometry/`.

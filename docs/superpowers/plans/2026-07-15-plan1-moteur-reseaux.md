# Plan 1 — Moteur réseaux telluriques (Sous-système B, saisie manuelle) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PWA where Laurent can create a mission, place an exterior plan (IGN) and/or a calibrated interior plan, generate a theoretical grid from a network template (Hartmann/Curry/Palm/Peyré/Wissmann — Bagua and the planetary-scale Or/Argent/Cuivre networks are separate, deferred sub-projects, see Chunk 5), and adjust it point-by-point to match what he senses on-site — with an orthogonality assist and free-form tracing for water/faults.

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

---

## Chunk 3: Map shell — Leaflet + IGN base layer, Mission creation, exterior Plan

**Files created in this chunk map 1:1 to spec §3.1's "Extérieur" paragraph and §6.1's
`Mission`/`Plan` rows — no calibration logic here (that's Chunk 4, interior-only).**

### Task 8: Shared Supabase test mock + `missionsRepo`

**Files:**
- Create: `src/test/supabaseMock.ts`
- Create: `src/data/missionsRepo.ts`
- Test: `src/data/missionsRepo.test.ts`

- [ ] **Step 1: Write the shared Supabase chain mock helper (used by every repo test in this plan — written once here, reused in Chunks 3-7)**

```typescript
// src/test/supabaseMock.ts
import { vi } from 'vitest'

export interface SupabaseQueryResult<T> {
  data: T | null
  error: { message: string } | null
}

/**
 * A minimal fake for supabase-js's fluent query builder. Every chained method
 * (insert/select/eq/order/...) returns the same `chain` object; `single()`
 * resolves to `result`, and the chain itself is also thenable so queries that
 * never call `.single()` (e.g. a bare `.select()` list query) can be awaited
 * directly, matching how supabase-js's real builder behaves.
 */
export function createSupabaseChainMock<T>(result: SupabaseQueryResult<T>) {
  const chain: any = {
    insert: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: SupabaseQueryResult<T>) => void) => resolve(result),
  }
  const from = vi.fn(() => chain)
  return { from, chain }
}
```

- [ ] **Step 2: Write failing tests for `missionsRepo`**

```typescript
// src/data/missionsRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMission, listMissions } from './missionsRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('missionsRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a mission and maps the row to camelCase', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'm1',
        address: '12 rue des Lilas',
        mission_date: '2026-07-20',
        declination_deg: 1.5,
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const mission = await createMission({
      address: '12 rue des Lilas',
      missionDate: '2026-07-20',
      declinationDeg: 1.5,
    })

    expect(from).toHaveBeenCalledWith('mission')
    expect(chain.insert).toHaveBeenCalledWith({
      address: '12 rue des Lilas',
      mission_date: '2026-07-20',
      declination_deg: 1.5,
    })
    expect(mission).toEqual({
      id: 'm1',
      address: '12 rue des Lilas',
      missionDate: '2026-07-20',
      declinationDeg: 1.5,
    })
  })

  it('throws a descriptive French error when the insert fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createMission({ address: 'x', missionDate: '2026-07-20' })
    ).rejects.toThrow('Impossible de créer la mission : network down')
  })

  it('lists missions ordered by most recent date first', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [
        { id: 'm2', address: 'B', mission_date: '2026-07-21', declination_deg: null },
        { id: 'm1', address: 'A', mission_date: '2026-07-20', declination_deg: null },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const missions = await listMissions()

    expect(chain.order).toHaveBeenCalledWith('mission_date', { ascending: false })
    expect(missions).toHaveLength(2)
    expect(missions[0].id).toBe('m2')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/data/missionsRepo.test.ts`
Expected: FAIL — `Cannot find module './missionsRepo'`

- [ ] **Step 4: Implement `missionsRepo`**

```typescript
// src/data/missionsRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { Mission } from '../domain/types'

export interface CreateMissionInput {
  address: string
  missionDate: string // ISO date, e.g. '2026-07-20'
  declinationDeg?: number | null
}

interface MissionRow {
  id: string
  address: string
  mission_date: string
  declination_deg: number | null
}

function mapRowToMission(row: MissionRow): Mission {
  return {
    id: row.id,
    address: row.address,
    missionDate: row.mission_date,
    declinationDeg: row.declination_deg,
  }
}

export async function createMission(input: CreateMissionInput): Promise<Mission> {
  const { data, error } = await supabase
    .from('mission')
    .insert({
      address: input.address,
      mission_date: input.missionDate,
      declination_deg: input.declinationDeg ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible de créer la mission : ${error.message}`)
  return mapRowToMission(data as MissionRow)
}

export async function listMissions(): Promise<Mission[]> {
  const { data, error } = await supabase
    .from('mission')
    .select()
    .order('mission_date', { ascending: false })

  if (error) throw new Error(`Impossible de charger les missions : ${error.message}`)
  return (data as MissionRow[]).map(mapRowToMission)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/data/missionsRepo.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/test/supabaseMock.ts src/data/missionsRepo.ts src/data/missionsRepo.test.ts
git commit -m "Add Supabase test mock helper and missionsRepo"
```

---

### Task 9: `MapView` with IGN base layer

**Files:**
- Create: `src/components/MapView.tsx`
- Test: `src/components/MapView.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/MapView.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MapView } from './MapView'

describe('MapView', () => {
  it('renders a Leaflet map container', () => {
    render(<MapView center={[48.8566, 2.3522]} />)
    expect(document.querySelector('.leaflet-container')).not.toBeNull()
  })

  it('renders the IGN attribution', () => {
    render(<MapView center={[48.8566, 2.3522]} />)
    expect(screen.getByText(/IGN-F\/Géoportail/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/MapView.test.tsx`
Expected: FAIL — `Cannot find module './MapView'`

- [ ] **Step 3: Implement `MapView`**

```tsx
// src/components/MapView.tsx
import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// IGN Géoplateforme WMTS endpoint (data.geopf.fr) — free, keyless access to
// the standard orthophoto layer as of this plan's writing (spec §3.1/§4).
// ⚠️ VERIFY against https://geoservices.ign.fr/documentation before relying
// on it: IGN has changed this endpoint's domain and auth scheme before, and
// may again — this constant is the single place to update if so.
const IGN_ORTHOPHOTO_WMTS_URL =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile' +
  '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg'

export interface MapViewProps {
  /** [latitude, longitude] */
  center: [number, number]
  zoom?: number
}

export function MapView({ center, zoom = 18 }: MapViewProps) {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      <TileLayer url={IGN_ORTHOPHOTO_WMTS_URL} attribution="&copy; IGN-F/Géoportail" maxZoom={20} />
    </MapContainer>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/MapView.test.tsx`
Expected: PASS (2 tests)

If this fails with a jsdom-related error from Leaflet (rare for a bare
`MapContainer` + `TileLayer` with no markers, but Leaflet does probe some
browser APIs on mount): add a `src/test/setup.ts` with a minimal
`window.ResizeObserver` stub, wire it into `vite.config.ts`'s
`test.setupFiles`, and re-run. Do not add speculative polyfills beyond what
the actual failure message asks for.

- [ ] **Step 5: Commit**

```bash
git add src/components/MapView.tsx src/components/MapView.test.tsx
git commit -m "Add MapView with IGN Geoplateforme base layer"
```

---

### Task 10: `plansRepo` (exterior plan creation)

**Files:**
- Create: `src/data/plansRepo.ts`
- Test: `src/data/plansRepo.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/data/plansRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPlan, listPlansForMission } from './plansRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('plansRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an exterior plan with no image/calibration', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { id: 'p1', mission_id: 'm1', kind: 'exterieur', image_url: null, calibration: null },
      error: null,
    })
    vi.mocked(supabase).from = from

    const plan = await createPlan({ missionId: 'm1', kind: 'exterieur' })

    expect(from).toHaveBeenCalledWith('plan')
    expect(chain.insert).toHaveBeenCalledWith({
      mission_id: 'm1',
      kind: 'exterieur',
      image_url: null,
      calibration: null,
    })
    expect(plan).toEqual({ id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null })
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(createPlan({ missionId: 'm1', kind: 'exterieur' })).rejects.toThrow(
      'Impossible de créer le plan : network down'
    )
  })

  it('lists plans scoped to a mission', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [{ id: 'p1', mission_id: 'm1', kind: 'exterieur', image_url: null, calibration: null }],
      error: null,
    })
    vi.mocked(supabase).from = from

    const plans = await listPlansForMission('m1')

    expect(chain.eq).toHaveBeenCalledWith('mission_id', 'm1')
    expect(plans).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/plansRepo.test.ts`
Expected: FAIL — `Cannot find module './plansRepo'`

- [ ] **Step 3: Implement `plansRepo`**

```typescript
// src/data/plansRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { AffineTransform, Plan, PlanKind } from '../domain/types'

export interface CreatePlanInput {
  missionId: string
  kind: PlanKind
  imageUrl?: string | null
  calibration?: AffineTransform | null
}

interface PlanRow {
  id: string
  mission_id: string
  kind: PlanKind
  image_url: string | null
  calibration: AffineTransform | null
}

function mapRowToPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    missionId: row.mission_id,
    kind: row.kind,
    imageUrl: row.image_url,
    calibration: row.calibration,
  }
}

export async function createPlan(input: CreatePlanInput): Promise<Plan> {
  const { data, error } = await supabase
    .from('plan')
    .insert({
      mission_id: input.missionId,
      kind: input.kind,
      image_url: input.imageUrl ?? null,
      calibration: input.calibration ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible de créer le plan : ${error.message}`)
  return mapRowToPlan(data as PlanRow)
}

export async function listPlansForMission(missionId: string): Promise<Plan[]> {
  const { data, error } = await supabase.from('plan').select().eq('mission_id', missionId)

  if (error) throw new Error(`Impossible de charger les plans : ${error.message}`)
  return (data as PlanRow[]).map(mapRowToPlan)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/data/plansRepo.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/plansRepo.ts src/data/plansRepo.test.ts
git commit -m "Add plansRepo"
```

---

### Task 11: `MissionForm` + `MissionWorkspace` composition

**Files:**
- Create: `src/components/MissionForm.tsx`
- Test: `src/components/MissionForm.test.tsx`
- Create: `src/pages/MissionWorkspace.tsx`
- Test: `src/pages/MissionWorkspace.test.tsx`
- Modify: `src/App.tsx` (replace the Vite starter content with `<MissionWorkspace />`)

- [ ] **Step 1: Write failing tests for `MissionForm`**

```typescript
// src/components/MissionForm.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MissionForm } from './MissionForm'
import * as missionsRepo from '../data/missionsRepo'

vi.mock('../data/missionsRepo')

describe('MissionForm', () => {
  it('creates a mission and calls onCreated with the result', async () => {
    const mission = { id: 'm1', address: '12 rue des Lilas', missionDate: '2026-07-20', declinationDeg: null }
    vi.mocked(missionsRepo.createMission).mockResolvedValue(mission)
    const onCreated = vi.fn()

    render(<MissionForm onCreated={onCreated} />)
    fireEvent.change(screen.getByLabelText('Adresse'), { target: { value: '12 rue des Lilas' } })
    fireEvent.change(screen.getByLabelText('Date de mission'), { target: { value: '2026-07-20' } })
    fireEvent.click(screen.getByRole('button', { name: /créer la mission/i }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(mission))
  })

  it('shows an error message when creation fails', async () => {
    vi.mocked(missionsRepo.createMission).mockRejectedValue(
      new Error('Impossible de créer la mission : network down')
    )

    render(<MissionForm onCreated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Adresse'), { target: { value: 'x' } })
    fireEvent.change(screen.getByLabelText('Date de mission'), { target: { value: '2026-07-20' } })
    fireEvent.click(screen.getByRole('button', { name: /créer la mission/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/MissionForm.test.tsx`
Expected: FAIL — `Cannot find module './MissionForm'`

- [ ] **Step 3: Implement `MissionForm`**

```tsx
// src/components/MissionForm.tsx
import { useState, type FormEvent } from 'react'
import { createMission } from '../data/missionsRepo'
import type { Mission } from '../domain/types'

export interface MissionFormProps {
  onCreated: (mission: Mission) => void
}

export function MissionForm({ onCreated }: MissionFormProps) {
  const [address, setAddress] = useState('')
  const [missionDate, setMissionDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const mission = await createMission({ address, missionDate })
      onCreated(mission)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Adresse
        <input value={address} onChange={(e) => setAddress(e.target.value)} required />
      </label>
      <label>
        Date de mission
        <input
          type="date"
          value={missionDate}
          onChange={(e) => setMissionDate(e.target.value)}
          required
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Création…' : 'Créer la mission'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/MissionForm.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Write failing tests for `MissionWorkspace`**

```tsx
// src/pages/MissionWorkspace.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MissionWorkspace } from './MissionWorkspace'
import * as plansRepo from '../data/plansRepo'

vi.mock('../data/plansRepo')
vi.mock('../components/MissionForm', async () => {
  const { useEffect } = await import('react')
  return {
    // Calls onCreated from an effect, not during render — matches how the
    // real MissionForm invokes it (from an async submit handler, after
    // render completes), and avoids React's "Cannot update a component
    // while rendering a different component" warning that a synchronous
    // in-render call would trigger.
    MissionForm: ({ onCreated }: { onCreated: (m: unknown) => void }) => {
      useEffect(() => {
        onCreated({ id: 'm1', address: 'x', missionDate: '2026-07-20', declinationDeg: null })
      }, [onCreated])
      return null
    },
  }
})
vi.mock('../components/MapView', () => ({
  MapView: () => <div data-testid="map-view" />,
}))

describe('MissionWorkspace', () => {
  it('creates an exterior plan once a mission is created, then shows the map', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1',
      missionId: 'm1',
      kind: 'exterieur',
      imageUrl: null,
      calibration: null,
    })

    render(<MissionWorkspace />)

    await waitFor(() =>
      expect(plansRepo.createPlan).toHaveBeenCalledWith({ missionId: 'm1', kind: 'exterieur' })
    )
    expect(await screen.findByTestId('map-view')).toBeInTheDocument()
  })

  it('shows an error if exterior plan creation fails', async () => {
    vi.mocked(plansRepo.createPlan).mockRejectedValue(
      new Error('Impossible de créer le plan : network down')
    )

    render(<MissionWorkspace />)

    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/pages/MissionWorkspace.test.tsx`
Expected: FAIL — `Cannot find module './MissionWorkspace'`

- [ ] **Step 7: Implement `MissionWorkspace`**

```tsx
// src/pages/MissionWorkspace.tsx
import { useState } from 'react'
import { MissionForm } from '../components/MissionForm'
import { MapView } from '../components/MapView'
import { createPlan } from '../data/plansRepo'
import type { Mission } from '../domain/types'

// Rough center of metropolitan France — a placeholder until a mission's
// address is geocoded to real coordinates. Geocoding isn't required by any
// Plan 1 spec requirement (§6.0-§6.2); the operator can pan/zoom the map
// manually to the actual site in the meantime.
const DEFAULT_CENTER: [number, number] = [46.6, 2.5]

export function MissionWorkspace() {
  const [mission, setMission] = useState<Mission | null>(null)
  const [planReady, setPlanReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleMissionCreated(created: Mission) {
    setMission(created)
    try {
      await createPlan({ missionId: created.id, kind: 'exterieur' })
      setPlanReady(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!mission) {
    return <MissionForm onCreated={handleMissionCreated} />
  }

  if (error) {
    return <p role="alert">{error}</p>
  }

  if (!planReady) {
    return <p>Préparation du plan extérieur…</p>
  }

  return <MapView center={DEFAULT_CENTER} />
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/pages/MissionWorkspace.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 9: Wire `MissionWorkspace` into `App.tsx`**

```tsx
// src/App.tsx — replace the entire Vite starter content with:
import { MissionWorkspace } from './pages/MissionWorkspace'
import './App.css'

function App() {
  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <MissionWorkspace />
    </div>
  )
}

export default App
```

- [ ] **Step 10: Manually verify in the browser**

Run: `npm run dev`, open the printed URL.
Expected: the mission creation form appears; filling it in and submitting shows
"Préparation du plan extérieur…" briefly, then a Leaflet map centered on France
with IGN orthophoto tiles loading.

- [ ] **Step 11: Commit**

```bash
git add src/components/MissionForm.tsx src/components/MissionForm.test.tsx src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx src/App.tsx
git commit -m "Add MissionForm and MissionWorkspace, wire into App"
```

---

**Chunk 3 exit criteria:** `npx vitest run` passes; `npm run dev` lets Laurent create a
mission and see an exterior IGN-based plan render as a live map.

---

## Chunk 4: Interior plan calibration

**Gap this chunk fills first (Task 12/13):** the map (Chunk 3) works in WGS84
lat/lng, but spec §3.1 stores every point in **mission-local metric coordinates**.
Nothing so far converts between the two — this chunk introduces that conversion,
anchored on a one-time "origin" click per mission, because interior-plan calibration
(this chunk) is the first feature that actually needs a `real: Point` in local
meters. Chunk 5 (grid origin placement) will reuse the same origin/conversion rather
than duplicating it.

### Task 12: Local coordinate system (lat/lng ↔ mission-local metric)

**Files:**
- Create: `src/geometry/localCoordinates.ts`
- Test: `src/geometry/localCoordinates.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/geometry/localCoordinates.test.ts
import { describe, it, expect } from 'vitest'
import { latLngToLocal, localToLatLng } from './localCoordinates'

describe('latLngToLocal', () => {
  it('maps the origin itself to (0, 0)', () => {
    const origin = { lat: 48.8566, lng: 2.3522 }
    expect(latLngToLocal(origin, origin)).toEqual({ x: 0, y: 0 })
  })

  it('1/1000 degree of latitude is ~111.32 m north', () => {
    const origin = { lat: 0, lng: 0 }
    const p = latLngToLocal({ lat: 0.001, lng: 0 }, origin)
    expect(p.y).toBeCloseTo(111.32, 1)
    expect(p.x).toBeCloseTo(0)
  })

  it('scales longitude by cos(latitude) at non-equatorial origins', () => {
    const origin = { lat: 48.8566, lng: 2.3522 }
    const p = latLngToLocal({ lat: 48.8566, lng: 2.3522 + 0.001 }, origin)
    const expectedMetersPerDegLng = 111320 * Math.cos((48.8566 * Math.PI) / 180)
    expect(p.x).toBeCloseTo(expectedMetersPerDegLng * 0.001, 1)
    expect(p.y).toBeCloseTo(0)
  })
})

describe('localToLatLng', () => {
  it('round-trips with latLngToLocal', () => {
    const origin = { lat: 48.8566, lng: 2.3522 }
    const original = { lat: 48.858, lng: 2.355 }
    const back = localToLatLng(latLngToLocal(original, origin), origin)
    expect(back.lat).toBeCloseTo(original.lat, 9)
    expect(back.lng).toBeCloseTo(original.lng, 9)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/geometry/localCoordinates.test.ts`
Expected: FAIL — `Cannot find module './localCoordinates'`

- [ ] **Step 3: Implement the conversion**

```typescript
// src/geometry/localCoordinates.ts
import type { Point } from '../domain/types'

const METERS_PER_DEG_LAT = 111_320

export interface LatLng {
  lat: number
  lng: number
}

/**
 * Converts a WGS84 lat/lng to mission-local planar meters (x = east, y =
 * north) relative to `origin`, using an equirectangular approximation. This
 * is accurate to within centimeters over distances of a few hundred meters —
 * comfortably sufficient for a residential property (spec §3.1's local
 * metric referential). It is deliberately NOT a geodesy-grade projection
 * (no ellipsoid correction) — do not reuse this for anything beyond a single
 * property's local referential.
 */
export function latLngToLocal(point: LatLng, origin: LatLng): Point {
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180)
  return {
    x: (point.lng - origin.lng) * metersPerDegLng,
    y: (point.lat - origin.lat) * METERS_PER_DEG_LAT,
  }
}

export function localToLatLng(point: Point, origin: LatLng): LatLng {
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180)
  return {
    lat: origin.lat + point.y / METERS_PER_DEG_LAT,
    lng: origin.lng + point.x / metersPerDegLng,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/geometry/localCoordinates.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/geometry/localCoordinates.ts src/geometry/localCoordinates.test.ts
git commit -m "Add lat/lng to mission-local metric coordinate conversion"
```

---

### Task 13: Mission origin (schema, repo, map click handler)

**Files:**
- Create: `supabase/migrations/0002_mission_origin.sql`
- Modify: `src/domain/types.ts` (add `originLat`/`originLng` to `Mission`)
- Modify: `src/data/missionsRepo.ts` (map new columns, add `setMissionOrigin`)
- Modify: `src/data/missionsRepo.test.ts` (cover the new function/fields)
- Modify: `src/components/MapView.tsx` (add an optional click handler)
- Modify: `src/components/MapView.test.tsx` (cover the click handler)

**Note:** wiring the origin-click step into `MissionWorkspace` is deliberately
deferred to Task 16, which rewrites that page's state management wholesale (a
discriminated-union "phase" state replacing the growing pile of independent
booleans) to also accommodate interior-plan calibration in the same pass — adding
the origin step here first, then immediately restructuring it in Task 16, would mean
writing throwaway code. This task stops at a tested, working `setMissionOrigin` repo
function and a tested, working `MapView` click handler; both are consumed by Task 16.

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/0002_mission_origin.sql
alter table mission add column origin_lat double precision;
alter table mission add column origin_lng double precision;
```

- [ ] **Step 2: Apply it**

Run: `npx supabase db push`
Expected: CLI reports the migration applied with no errors.

- [ ] **Step 3: Extend the `Mission` type**

```typescript
// src/domain/types.ts — modify the existing Mission interface
export interface Mission {
  id: string
  address: string
  missionDate: string
  declinationDeg: number | null
  originLat: number | null
  originLng: number | null
}
```

- [ ] **Step 4: Write a failing test for `setMissionOrigin`**

```typescript
// append to src/data/missionsRepo.test.ts
import { setMissionOrigin } from './missionsRepo'

// ... inside describe('missionsRepo', () => { ... }):
it('sets the mission origin and maps it back', async () => {
  const { from, chain } = createSupabaseChainMock({
    data: {
      id: 'm1',
      address: 'A',
      mission_date: '2026-07-20',
      declination_deg: null,
      origin_lat: 48.8566,
      origin_lng: 2.3522,
    },
    error: null,
  })
  vi.mocked(supabase).from = from

  const mission = await setMissionOrigin('m1', { lat: 48.8566, lng: 2.3522 })

  expect(from).toHaveBeenCalledWith('mission')
  expect(chain.eq).toHaveBeenCalledWith('id', 'm1')
  expect(mission.originLat).toBe(48.8566)
  expect(mission.originLng).toBe(2.3522)
})
```

Also update every existing `MissionRow`/expected-`Mission` object in this file to
include `origin_lat: null, origin_lng: null` (row side) and
`originLat: null, originLng: null` (mapped side), so the earlier tests keep passing
against the widened type.

**Blast radius — widening `Mission` breaks other files too, fix them in this same
step:**
- `src/components/MissionForm.test.tsx` (Chunk 3): the `mission` object literal passed
  to `onCreated`'s expectation needs `originLat: null, originLng: null` added.
- `src/pages/MissionWorkspace.test.tsx` (Chunk 3): the inline `MissionForm` mock's
  hardcoded object (`{ id: 'm1', address: 'x', missionDate: '2026-07-20', declinationDeg: null }`)
  needs the same two fields added, or `tsc` will reject it against the widened type.

- [ ] **Step 5: Run tests to verify the new one fails**

Run: `npx vitest run src/data/missionsRepo.test.ts`
Expected: FAIL — `setMissionOrigin is not a function`

- [ ] **Step 6: Implement the change in `missionsRepo.ts`**

```typescript
// src/data/missionsRepo.ts — modify MissionRow, mapRowToMission, and add:
interface MissionRow {
  id: string
  address: string
  mission_date: string
  declination_deg: number | null
  origin_lat: number | null
  origin_lng: number | null
}

function mapRowToMission(row: MissionRow): Mission {
  return {
    id: row.id,
    address: row.address,
    missionDate: row.mission_date,
    declinationDeg: row.declination_deg,
    originLat: row.origin_lat,
    originLng: row.origin_lng,
  }
}

export async function setMissionOrigin(
  missionId: string,
  origin: { lat: number; lng: number }
): Promise<Mission> {
  const { data, error } = await supabase
    .from('mission')
    .update({ origin_lat: origin.lat, origin_lng: origin.lng })
    .eq('id', missionId)
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer l'origine de la mission : ${error.message}`)
  return mapRowToMission(data as MissionRow)
}
```

Also add `update: vi.fn(() => chain)` to `createSupabaseChainMock` in
`src/test/supabaseMock.ts` (the `.update().eq().select().single()` chain shape is new
in this task).

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/data/missionsRepo.test.ts`
Expected: PASS (4 tests — the 3 from Chunk 3 plus this one)

- [ ] **Step 8: Write a failing test for `MapView`'s click handler**

```typescript
// append to src/components/MapView.test.tsx
import { fireEvent } from '@testing-library/react'

it('calls onMapClick with lat/lng when the map is clicked', () => {
  const onMapClick = vi.fn()
  render(<MapView center={[48.8566, 2.3522]} onMapClick={onMapClick} />)
  const container = document.querySelector('.leaflet-container') as HTMLElement
  // jsdom gives the container a zero-size layout box by default, so pass
  // explicit coordinates rather than relying on fireEvent's clientX/clientY
  // defaults (both 0) — this keeps the resulting lat/lng meaningful instead
  // of a degenerate case that would pass even if the handler were broken.
  fireEvent.click(container, { clientX: 50, clientY: 50 })
  expect(onMapClick).toHaveBeenCalled()
  const [{ lat, lng }] = onMapClick.mock.calls[0]
  expect(Number.isFinite(lat)).toBe(true)
  expect(Number.isFinite(lng)).toBe(true)
})
```

- [ ] **Step 9: Run test to verify it fails**

Run: `npx vitest run src/components/MapView.test.tsx`
Expected: FAIL — `onMapClick` prop has no effect (not wired up yet)

If this test instead fails with `lat`/`lng` being `NaN` even after Step 10's
implementation (jsdom's zero-size container can confuse Leaflet's pixel-to-latlng
projection in some versions): this is the same category of jsdom/Leaflet friction
anticipated in Chunk 3, Task 9, Step 4 — add the same `src/test/setup.ts` fallback
described there rather than treating it as a logic bug in `ClickHandler`.

- [ ] **Step 10: Add the click handler to `MapView`**

```tsx
// src/components/MapView.tsx — add:
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet'

function ClickHandler({ onMapClick }: { onMapClick: (latlng: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

export interface MapViewProps {
  center: [number, number]
  zoom?: number
  onMapClick?: (latlng: { lat: number; lng: number }) => void
}

export function MapView({ center, zoom = 18, onMapClick }: MapViewProps) {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      <TileLayer url={IGN_ORTHOPHOTO_WMTS_URL} attribution="&copy; IGN-F/Géoportail" maxZoom={20} />
      {onMapClick && <ClickHandler onMapClick={onMapClick} />}
    </MapContainer>
  )
}
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `npx vitest run src/components/MapView.test.tsx`
Expected: PASS (3 tests)

**How `setMissionOrigin` and `MapView`'s click handler will be consumed (preview,
not applied here):**

```tsx
import { setMissionOrigin } from '../data/missionsRepo'

async function handleOriginClick(latlng: { lat: number; lng: number }) {
  const updated = await setMissionOrigin(mission.id, latlng)
  // ...transition to the next phase with `updated`
}
```

This preview exists only to show the two pieces built in this task fit together —
it is **not applied to `MissionWorkspace.tsx` in this task**. Task 16 replaces that
page's state management entirely with a phase-based version that includes this same
origin-setting call. Skip straight to Task 16 once Step 11 above passes.

- [ ] **Step 12: Run the full test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: PASS (every test written so far — this task touched shared files
`missionsRepo.ts`/`.test.ts` and `MapView.tsx`/`.test.ts`, but added no new
`MissionWorkspace` behavior yet).

- [ ] **Step 13: Commit**

```bash
git add supabase/migrations/0002_mission_origin.sql src/domain/types.ts src/data/missionsRepo.ts src/data/missionsRepo.test.ts src/test/supabaseMock.ts src/components/MapView.tsx src/components/MapView.test.tsx
git commit -m "Add mission origin: schema, repo, map click handler"
```

---

### Task 14: Interior plan image upload

**Files:**
- Create: `src/data/planImageStorage.ts`
- Test: `src/data/planImageStorage.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/data/planImageStorage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadPlanImage } from './planImageStorage'
import { supabase } from '../lib/supabaseClient'

vi.mock('../lib/supabaseClient', () => ({
  supabase: { storage: { from: vi.fn() } },
}))

describe('uploadPlanImage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uploads the file to the plans bucket and returns its public URL', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'm1/plan.jpg' }, error: null })
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: 'https://xxx.supabase.co/storage/v1/object/public/plans/m1/plan.jpg' },
    })
    vi.mocked(supabase.storage.from).mockReturnValue({ upload, getPublicUrl } as any)

    const file = new File(['fake-image-bytes'], 'plan.jpg', { type: 'image/jpeg' })
    const url = await uploadPlanImage('m1', file)

    expect(supabase.storage.from).toHaveBeenCalledWith('plans')
    expect(upload).toHaveBeenCalledWith('m1/plan.jpg', file, { upsert: true })
    expect(url).toBe('https://xxx.supabase.co/storage/v1/object/public/plans/m1/plan.jpg')
  })

  it('throws a descriptive French error when the upload fails', async () => {
    const upload = vi.fn().mockResolvedValue({ data: null, error: { message: 'quota exceeded' } })
    vi.mocked(supabase.storage.from).mockReturnValue({ upload } as any)

    const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
    await expect(uploadPlanImage('m1', file)).rejects.toThrow(
      "Impossible d'envoyer l'image du plan : quota exceeded"
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/planImageStorage.test.ts`
Expected: FAIL — `Cannot find module './planImageStorage'`

- [ ] **Step 3: Implement `uploadPlanImage`**

```typescript
// src/data/planImageStorage.ts
import { supabase } from '../lib/supabaseClient'

const BUCKET = 'plans'

export async function uploadPlanImage(missionId: string, file: File): Promise<string> {
  const path = `${missionId}/${file.name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })

  if (error) throw new Error(`Impossible d'envoyer l'image du plan : ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/data/planImageStorage.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: ⚠️ Human checkpoint — create the storage bucket**

This needs Laurent: in the Supabase dashboard, create a **public** bucket named
`plans` (Storage → New bucket → name `plans`, toggle "Public bucket" on). Confirm
before moving to Task 15.

- [ ] **Step 6: Commit**

```bash
git add src/data/planImageStorage.ts src/data/planImageStorage.test.ts
git commit -m "Add interior plan image upload to Supabase Storage"
```

---

### Task 15: Control point picker (image click + map click → `calibratePlan`)

**Files:**
- Create: `src/components/PlanCalibrationTool.tsx`
- Test: `src/components/PlanCalibrationTool.test.tsx`

- [ ] **Step 1: Write a failing test for the pure pixel-scaling helper**

```typescript
// src/components/PlanCalibrationTool.test.tsx (top of file)
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlanCalibrationTool, clientPositionToNaturalImagePoint } from './PlanCalibrationTool'

describe('clientPositionToNaturalImagePoint', () => {
  it('scales a displayed-size click position up to the natural image size', () => {
    const point = clientPositionToNaturalImagePoint(
      { naturalWidth: 800, naturalHeight: 600 },
      { left: 10, top: 20, width: 400, height: 300 },
      { x: 210, y: 170 }
    )
    // displayed at half natural size (400/800, 300/600) -> scale factor 2 on both axes
    expect(point).toEqual({ x: 400, y: 300 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PlanCalibrationTool.test.tsx`
Expected: FAIL — `Cannot find module './PlanCalibrationTool'`

- [ ] **Step 3: Implement the pure helper and the component shell**

```tsx
// src/components/PlanCalibrationTool.tsx
import { useState, type MouseEvent } from 'react'
import { MapView } from './MapView'
import { calibratePlan, CalibrationError, type ControlPoint } from '../geometry/calibration'
import { latLngToLocal, type LatLng } from '../geometry/localCoordinates'
import type { AffineTransform, Point } from '../domain/types'

/**
 * Converts a click's viewport (client) position on a possibly-scaled `<img>`
 * into a coordinate in the image's natural (full-resolution) pixel space —
 * calibration must be independent of how large the browser happens to be
 * displaying the image.
 */
export function clientPositionToNaturalImagePoint(
  img: Pick<HTMLImageElement, 'naturalWidth' | 'naturalHeight'>,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  client: { x: number; y: number }
): Point {
  const scaleX = img.naturalWidth / rect.width
  const scaleY = img.naturalHeight / rect.height
  return {
    x: (client.x - rect.left) * scaleX,
    y: (client.y - rect.top) * scaleY,
  }
}

export interface PlanCalibrationToolProps {
  imageUrl: string
  missionOrigin: LatLng
  mapCenter: [number, number]
  onCalibrated: (calibration: AffineTransform) => void
}

const MAX_CONTROL_POINTS = 4 // spec §3.1: "2 à 4 points de contrôle"

export function PlanCalibrationTool({
  imageUrl,
  missionOrigin,
  mapCenter,
  onCalibrated,
}: PlanCalibrationToolProps) {
  const [points, setPoints] = useState<ControlPoint[]>([])
  const [pendingImagePoint, setPendingImagePoint] = useState<Point | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleImageClick(e: MouseEvent<HTMLImageElement>) {
    if (points.length >= MAX_CONTROL_POINTS) return
    const img = e.currentTarget
    const rect = img.getBoundingClientRect()
    const image = clientPositionToNaturalImagePoint(img, rect, { x: e.clientX, y: e.clientY })
    setPendingImagePoint(image)
    setError(null)
  }

  function handleMapClick(latlng: LatLng) {
    if (!pendingImagePoint) return
    const real = latLngToLocal(latlng, missionOrigin)
    setPoints((prev) => [...prev, { image: pendingImagePoint, real }])
    setPendingImagePoint(null)
  }

  function handleValidate() {
    try {
      onCalibrated(calibratePlan(points))
    } catch (err) {
      setError(err instanceof CalibrationError ? err.message : String(err))
    }
  }

  return (
    <div>
      <p>
        {pendingImagePoint
          ? 'Cliquez maintenant sur la carte, au même endroit réel.'
          : points.length >= MAX_CONTROL_POINTS
            ? `Maximum de ${MAX_CONTROL_POINTS} points atteint — validez ou retirez un point.`
            : `Cliquez un point du plan (${points.length} point(s) posé(s), 2 minimum, ${MAX_CONTROL_POINTS} maximum).`}
      </p>
      <img
        src={imageUrl}
        alt="Plan intérieur à caler"
        onClick={handleImageClick}
        style={{ maxWidth: '100%' }}
      />
      <MapView center={mapCenter} onMapClick={handleMapClick} />
      {error && <p role="alert">{error}</p>}
      <button onClick={handleValidate} disabled={points.length < 2}>
        Valider le calage ({points.length} points)
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PlanCalibrationTool.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Write failing integration tests for the full click-image-then-click-map flow**

`calibratePlan` itself is already exhaustively tested in isolation (Chunk 2, Task 6) —
these tests only need to verify `PlanCalibrationTool` calls it correctly and reacts to
its result, so `calibratePlan` is mocked here rather than re-verified through the UI.
This also sidesteps needing every simulated map click to land at a realistic,
sufficiently-separated real-world position.

```typescript
// append to src/components/PlanCalibrationTool.test.tsx
import { calibratePlan, CalibrationError } from '../geometry/calibration'

vi.mock('../geometry/calibration', async () => {
  const actual = await vi.importActual<typeof import('../geometry/calibration')>(
    '../geometry/calibration'
  )
  return { ...actual, calibratePlan: vi.fn() }
})

vi.mock('./MapView', () => ({
  // Real map interaction is already covered by MapView's own tests (Task 13) —
  // here, a click always reports the same fixed point, since the exact
  // real-world value doesn't matter once calibratePlan is mocked.
  MapView: ({ onMapClick }: { onMapClick?: (latlng: { lat: number; lng: number }) => void }) => (
    <button onClick={() => onMapClick?.({ lat: 48.8566, lng: 2.3522 })}>simulate-map-click</button>
  ),
}))

function setupImage(img: HTMLImageElement) {
  Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: 600, configurable: true })
  vi.spyOn(img, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON() {},
  } as DOMRect)
}

function placeOneControlPoint(img: HTMLImageElement, clientX = 0, clientY = 0) {
  fireEvent.click(img, { clientX, clientY })
  fireEvent.click(screen.getByText('simulate-map-click'))
}

describe('PlanCalibrationTool', () => {
  beforeEach(() => {
    vi.mocked(calibratePlan).mockReset()
  })

  it('collects an image click followed by a map click as one control point', () => {
    render(
      <PlanCalibrationTool
        imageUrl="https://example.com/plan.jpg"
        missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
        mapCenter={[48.8566, 2.3522]}
        onCalibrated={vi.fn()}
      />
    )
    const img = screen.getByAltText('Plan intérieur à caler') as HTMLImageElement
    setupImage(img)

    fireEvent.click(img, { clientX: 200, clientY: 150 })
    expect(screen.getByText(/cliquez maintenant sur la carte/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText('simulate-map-click'))
    expect(screen.getByText(/1 point\(s\) posé/)).toBeInTheDocument()
  })

  it('disables validation until at least 2 points are collected', () => {
    render(
      <PlanCalibrationTool
        imageUrl="https://example.com/plan.jpg"
        missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
        mapCenter={[48.8566, 2.3522]}
        onCalibrated={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /valider le calage/i })).toBeDisabled()
  })

  it('ignores further image clicks once 4 control points are collected (spec cap)', () => {
    render(
      <PlanCalibrationTool
        imageUrl="https://example.com/plan.jpg"
        missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
        mapCenter={[48.8566, 2.3522]}
        onCalibrated={vi.fn()}
      />
    )
    const img = screen.getByAltText('Plan intérieur à caler') as HTMLImageElement
    setupImage(img)

    for (let i = 0; i < 4; i++) placeOneControlPoint(img, i, i)
    expect(screen.getByText(/maximum de 4 points atteint/i)).toBeInTheDocument()

    placeOneControlPoint(img, 99, 99) // should be ignored — already at the cap
    expect(screen.getByText(/maximum de 4 points atteint/i)).toBeInTheDocument()
    expect(screen.queryByText(/5 point\(s\) posé/)).not.toBeInTheDocument()
  })

  it('calls onCalibrated with the fitted transform once validated with 2+ points', () => {
    const fakeTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    vi.mocked(calibratePlan).mockReturnValue(fakeTransform)
    const onCalibrated = vi.fn()
    render(
      <PlanCalibrationTool
        imageUrl="https://example.com/plan.jpg"
        missionOrigin={{ lat: 0, lng: 0 }}
        mapCenter={[0, 0]}
        onCalibrated={onCalibrated}
      />
    )
    const img = screen.getByAltText('Plan intérieur à caler') as HTMLImageElement
    setupImage(img)

    placeOneControlPoint(img, 0, 0)
    placeOneControlPoint(img, 400, 0)

    fireEvent.click(screen.getByRole('button', { name: /valider le calage/i }))
    expect(onCalibrated).toHaveBeenCalledWith(fakeTransform)
  })

  it('shows the CalibrationError message and does not call onCalibrated when validation fails', () => {
    vi.mocked(calibratePlan).mockImplementation(() => {
      throw new CalibrationError('Les points de contrôle 1 et 2 sont trop proches.')
    })
    const onCalibrated = vi.fn()
    render(
      <PlanCalibrationTool
        imageUrl="https://example.com/plan.jpg"
        missionOrigin={{ lat: 0, lng: 0 }}
        mapCenter={[0, 0]}
        onCalibrated={onCalibrated}
      />
    )
    const img = screen.getByAltText('Plan intérieur à caler') as HTMLImageElement
    setupImage(img)

    placeOneControlPoint(img, 0, 0)
    placeOneControlPoint(img, 10, 10)
    fireEvent.click(screen.getByRole('button', { name: /valider le calage/i }))

    expect(onCalibrated).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('trop proches')
  })
})
```

(add `import { beforeEach } from 'vitest'` to this file's existing `vitest` import line
if not already present)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/components/PlanCalibrationTool.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add src/components/PlanCalibrationTool.tsx src/components/PlanCalibrationTool.test.tsx
git commit -m "Add PlanCalibrationTool: image+map control point picker"
```

---

### Task 16: Rewrite `MissionWorkspace` with phase-based state; wire origin + interior calibration

**Files:**
- Modify (full rewrite): `src/pages/MissionWorkspace.tsx`
- Modify (full rewrite): `src/pages/MissionWorkspace.test.tsx`

**Why a rewrite, not another incremental patch:** by the end of Chunk 3 this page
already tracked its flow through 3 independent nullable/boolean state variables and a
chain of early-return `if`s. Task 13 deliberately withheld its origin-setting wiring
to avoid adding a 4th and 5th on top before this task additionally needs interior
upload + calibration state — that would compound into 6+ variables with only
implicit mutual-exclusivity. This task replaces that structure once with a single
discriminated-union `phase` state, which both TypeScript and a reader can reason
about exhaustively.

**⚠️ Scope note carried over:** this task saves the calibrated interior `Plan` record
(`image_url` + `calibration`) and confirms it round-trips through `plansRepo`. It does
**not** implement the actual on-map visual rendering of the interior image
rubber-sheeted onto its calibrated position — that requires `Leaflet.DistortableImage`
(spec §4/§6, chosen for exactly this), and its precise API (how to feed it a
pre-computed similarity transform vs. only supporting manual corner-dragging) isn't
something to guess at without the library's current docs open. Treat visual overlay
rendering as a follow-up spike before Chunk 6 needs to display interior `GridLine`s on
top of it — confirm the library's programmatic-corners API first, then extend this
component accordingly.

- [ ] **Step 1: Write the failing test suite for the full rewritten flow**

This replaces `src/pages/MissionWorkspace.test.tsx` in its entirety (all of Chunk 3
Task 11's tests are re-expressed here against the same behavior, plus the new
interior-calibration coverage):

```tsx
// src/pages/MissionWorkspace.test.tsx (full replacement)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MissionWorkspace } from './MissionWorkspace'
import * as plansRepo from '../data/plansRepo'
import * as missionsRepo from '../data/missionsRepo'
import * as planImageStorage from '../data/planImageStorage'

vi.mock('../data/plansRepo')
vi.mock('../data/missionsRepo')
vi.mock('../data/planImageStorage')

vi.mock('../components/MissionForm', async () => {
  const { useEffect } = await import('react')
  return {
    MissionForm: ({ onCreated }: { onCreated: (m: unknown) => void }) => {
      useEffect(() => {
        onCreated({
          id: 'm1', address: 'x', missionDate: '2026-07-20', declinationDeg: null,
          originLat: null, originLng: null,
        })
      }, [onCreated])
      return null
    },
  }
})

vi.mock('../components/MapView', () => ({
  MapView: ({ onMapClick }: { onMapClick?: (latlng: { lat: number; lng: number }) => void }) => (
    <div data-testid="map-view">
      {onMapClick && (
        <button onClick={() => onMapClick({ lat: 48.8566, lng: 2.3522 })}>simulate-map-click</button>
      )}
    </div>
  ),
}))

vi.mock('../components/PlanCalibrationTool', () => ({
  PlanCalibrationTool: ({ onCalibrated }: { onCalibrated: (c: unknown) => void }) => (
    <button onClick={() => onCalibrated({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })}>
      simulate-calibrated
    </button>
  ),
}))

const missionWithOrigin = {
  id: 'm1', address: 'x', missionDate: '2026-07-20', declinationDeg: null,
  originLat: 48.8566, originLng: 2.3522,
}

describe('MissionWorkspace', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an exterior plan once a mission is created, then prompts for the origin', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })

    render(<MissionWorkspace />)

    await waitFor(() =>
      expect(plansRepo.createPlan).toHaveBeenCalledWith({ missionId: 'm1', kind: 'exterieur' })
    )
    expect(await screen.findByText(/cliquez sur la carte/i)).toBeInTheDocument()
  })

  it('shows an error if exterior plan creation fails', async () => {
    vi.mocked(plansRepo.createPlan).mockRejectedValue(
      new Error('Impossible de créer le plan : network down')
    )
    render(<MissionWorkspace />)
    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })

  it('records the mission origin on map click, then shows the map and the interior-upload option', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)

    render(<MissionWorkspace />)
    await screen.findByText(/cliquez sur la carte/i)
    fireEvent.click(screen.getByText('simulate-map-click'))

    await waitFor(() =>
      expect(missionsRepo.setMissionOrigin).toHaveBeenCalledWith('m1', { lat: 48.8566, lng: 2.3522 })
    )
    expect(await screen.findByTestId('map-view')).toBeInTheDocument()
    expect(screen.getByLabelText(/importer un plan intérieur/i)).toBeInTheDocument()
  })

  it('uploads a chosen interior file, then shows the calibration tool', async () => {
    vi.mocked(plansRepo.createPlan).mockResolvedValue({
      id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
    })
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
    vi.mocked(planImageStorage.uploadPlanImage).mockResolvedValue('https://x/plan.jpg')

    render(<MissionWorkspace />)
    await screen.findByText(/cliquez sur la carte/i)
    fireEvent.click(screen.getByText('simulate-map-click'))
    await screen.findByLabelText(/importer un plan intérieur/i)

    const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })

    await waitFor(() => expect(planImageStorage.uploadPlanImage).toHaveBeenCalledWith('m1', file))
    expect(await screen.findByText('simulate-calibrated')).toBeInTheDocument()
  })

  it('saves an interior Plan once calibration completes', async () => {
    vi.mocked(plansRepo.createPlan)
      .mockResolvedValueOnce({ id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null })
      .mockResolvedValueOnce({
        id: 'p2', missionId: 'm1', kind: 'interieur', imageUrl: 'https://x/plan.jpg',
        calibration: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      })
    vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
    vi.mocked(planImageStorage.uploadPlanImage).mockResolvedValue('https://x/plan.jpg')

    render(<MissionWorkspace />)
    await screen.findByText(/cliquez sur la carte/i)
    fireEvent.click(screen.getByText('simulate-map-click'))
    await screen.findByLabelText(/importer un plan intérieur/i)
    const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })
    await screen.findByText('simulate-calibrated')

    fireEvent.click(screen.getByText('simulate-calibrated'))

    await waitFor(() =>
      expect(plansRepo.createPlan).toHaveBeenCalledWith({
        missionId: 'm1', kind: 'interieur', imageUrl: 'https://x/plan.jpg',
        calibration: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
      })
    )
    expect(await screen.findByTestId('map-view')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/MissionWorkspace.test.tsx`
Expected: FAIL (the current implementation has no origin/interior phases)

- [ ] **Step 3: Rewrite `MissionWorkspace.tsx` with phase-based state**

```tsx
// src/pages/MissionWorkspace.tsx (full replacement)
import { useState } from 'react'
import { MissionForm } from '../components/MissionForm'
import { MapView } from '../components/MapView'
import { PlanCalibrationTool } from '../components/PlanCalibrationTool'
import { createPlan } from '../data/plansRepo'
import { setMissionOrigin } from '../data/missionsRepo'
import { uploadPlanImage } from '../data/planImageStorage'
import type { AffineTransform, Mission } from '../domain/types'
import type { LatLng } from '../geometry/localCoordinates'

// Rough center of metropolitan France — a placeholder until a mission's address
// is geocoded to real coordinates. Geocoding isn't required by any Plan 1 spec
// requirement (§6.0-§6.2); the operator can pan/zoom the map manually in the
// meantime.
const DEFAULT_CENTER: [number, number] = [46.6, 2.5]

type WorkspacePhase =
  | { name: 'creating-mission' }
  | { name: 'creating-exterior-plan'; mission: Mission }
  | { name: 'setting-origin'; mission: Mission }
  | { name: 'ready-no-interior'; mission: Mission }
  | { name: 'calibrating-interior'; mission: Mission; imageUrl: string }
  | { name: 'error'; message: string }

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function MissionWorkspace() {
  const [phase, setPhase] = useState<WorkspacePhase>({ name: 'creating-mission' })

  async function handleMissionCreated(mission: Mission) {
    setPhase({ name: 'creating-exterior-plan', mission })
    try {
      await createPlan({ missionId: mission.id, kind: 'exterieur' })
      setPhase({ name: 'setting-origin', mission })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  async function handleOriginClick(latlng: LatLng) {
    if (phase.name !== 'setting-origin') return
    try {
      const updated = await setMissionOrigin(phase.mission.id, latlng)
      setPhase({ name: 'ready-no-interior', mission: updated })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  async function handleInteriorFileChosen(file: File) {
    if (phase.name !== 'ready-no-interior') return
    try {
      const url = await uploadPlanImage(phase.mission.id, file)
      setPhase({ name: 'calibrating-interior', mission: phase.mission, imageUrl: url })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  async function handleInteriorCalibrated(calibration: AffineTransform) {
    if (phase.name !== 'calibrating-interior') return
    try {
      await createPlan({
        missionId: phase.mission.id,
        kind: 'interieur',
        imageUrl: phase.imageUrl,
        calibration,
      })
      // Back to the map view — Plan 1 doesn't yet render the calibrated
      // overlay visually (see this task's scope note).
      setPhase({ name: 'ready-no-interior', mission: phase.mission })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }

  switch (phase.name) {
    case 'creating-mission':
      return <MissionForm onCreated={handleMissionCreated} />

    case 'creating-exterior-plan':
      return <p>Préparation du plan extérieur…</p>

    case 'setting-origin':
      return (
        <div>
          <p>Cliquez sur la carte à l'endroit qui servira d'origine du site.</p>
          <MapView center={DEFAULT_CENTER} onMapClick={handleOriginClick} />
        </div>
      )

    case 'ready-no-interior': {
      // originLat/originLng are guaranteed non-null here: this phase is only
      // ever entered via setMissionOrigin's successful response (above) or
      // after returning from interior calibration (which requires having
      // passed through here first).
      const { originLat, originLng } = phase.mission
      return (
        <div>
          <MapView center={[originLat!, originLng!]} />
          <label>
            Importer un plan intérieur (optionnel)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleInteriorFileChosen(e.target.files[0])}
            />
          </label>
        </div>
      )
    }

    case 'calibrating-interior':
      return (
        <PlanCalibrationTool
          imageUrl={phase.imageUrl}
          missionOrigin={{ lat: phase.mission.originLat!, lng: phase.mission.originLng! }}
          mapCenter={[phase.mission.originLat!, phase.mission.originLng!]}
          onCalibrated={handleInteriorCalibrated}
        />
      )

    case 'error':
      return <p role="alert">{phase.message}</p>
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/pages/MissionWorkspace.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS (every test in the project)

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev`. Create a mission, click the map to set the origin, upload a plan
photo, click 2 points on the image + 2 corresponding points on the map, validate.
Expected: no crash, and in Supabase, a new `plan` row exists with `kind = 'interieur'`,
a populated `image_url`, and a `calibration` JSON object.

- [ ] **Step 7: Commit**

```bash
git add src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "Rewrite MissionWorkspace with phase-based state; wire origin and interior calibration"
```

---

**Chunk 4 exit criteria:** `npx vitest run` passes; Laurent can set a mission's
origin, upload an interior plan photo, calibrate it against 2-4 control points, and
see the resulting `Plan` row saved with its `calibration` transform. On-map visual
rendering of the rubber-sheeted interior image is explicitly deferred (Task 16 note)
pending a quick verification spike against `Leaflet.DistortableImage`'s actual API.

---

## Chunk 5: Grid templates (Hartmann/Curry/Palm/Peyré/Wissmann), polarity + color, `GridInstance` generation

**⚠️ Correction to the spec (§6.4), caught while writing this chunk:** the spec
claims Bagua is "just one more `GridTemplate`" reusing the generic grid engine with
"no logic beyond it needed." That's incorrect — `generateTheoreticalLines` (Chunk 2)
produces a **rectangular** grid (two perpendicular families of parallel, evenly-spaced
lines), which is the right shape for Hartmann/Curry/Palm/Peyré/Wissmann, but a Bagua is
**8 angular wedges radiating from a center point** — a completely different geometry
that the rectangular generator cannot produce. This wasn't caught during spec review
either. **Bagua is therefore excluded from this chunk.** It needs its own small
"radial sector" generator (a different pure function, sharing only the
"plan calé au nord" prerequisite with the rectangular engine) before it can ship —
treat that as a follow-up spike, sized similarly to a single extra Chunk-2-style task,
not a large undertaking, but a real one, not a same-engine reuse.

**⚠️ Second correction, caught mid-chunk: Or/Argent/Cuivre are NOT `GridTemplate`
candidates at all.** Laurent's manual describes them as **planetary-scale sacred
networks** — the Or network alone has a mesh of ~270 km (E-O) × ~400 km (N-S) in
France, with only ~26 crossing points on the entire globe (the "carré magique" of
the Earth). This is a fundamentally different kind of object than a repeating local
grid a few meters wide: at property scale, "is this site on/near a rare fixed
crossing point" is a sparse lookup, not a generated mesh. Same treatment as
Bagua — **excluded from this chunk**, deferred to its own future sub-project once
Laurent has real reference coordinates for these crossing points. `Peyré` and `Palm`
(named after "or"/"cuivre" in the original small-scale table) are kept as-is in
`GridTemplate` below — that naming may or may not correspond to this planetary
system; that's an open question for Laurent's domain expertise, not something this
plan resolves by merging or renaming anything.

**Domain values used below:** only Hartmann's full parameters (2 m × 2.5 m, 0° from
true north) were explicitly confirmed earlier in this project's conversation.
Curry's angle (45° from Hartmann's, per spec §6.2) is also known, but not its
spacing — and the schema requires both `spacing_x_m`/`spacing_y_m` as non-null, so a
seed row still can't be inserted with a value that was never confirmed. Peyré has
neither confirmed. None of the three are seeded here — Laurent enters them himself
via the template-creation UI (Task 18) once he has the real values, since getting a
geobiology network's parameters wrong would be worse than leaving them blank. (Task
21, later in this chunk, supersedes this with real confirmed values for all 5 local
networks — Or/Argent/Cuivre remain excluded throughout, per the correction above.)

### Task 17: `gridTemplatesRepo` + Hartmann seed

**Files:**
- Create: `supabase/migrations/0003_seed_hartmann_template.sql`
- Create: `src/data/gridTemplatesRepo.ts`
- Test: `src/data/gridTemplatesRepo.test.ts`

- [ ] **Step 1: Seed migration**

```sql
-- supabase/migrations/0003_seed_hartmann_template.sql
insert into grid_template (name, spacing_x_m, spacing_y_m, angle_true_north_deg, origin_offset_x, origin_offset_y)
values ('Hartmann', 2, 2.5, 0, 0, 0)
on conflict (name) do nothing;
```

- [ ] **Step 2: Apply it**

Run: `npx supabase db push`
Expected: CLI reports the migration applied; a `Hartmann` row now exists in
`grid_template`.

- [ ] **Step 3: Write failing tests for `gridTemplatesRepo`**

```typescript
// src/data/gridTemplatesRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGridTemplate, listGridTemplates } from './gridTemplatesRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('gridTemplatesRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a grid template and maps the row to camelCase', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 't1', name: 'Curry', spacing_x_m: 2, spacing_y_m: 2,
        angle_true_north_deg: 45, origin_offset_x: 0, origin_offset_y: 0,
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const template = await createGridTemplate({
      name: 'Curry', spacingXM: 2, spacingYM: 2, angleTrueNorthDeg: 45,
      originOffsetX: 0, originOffsetY: 0,
    })

    expect(from).toHaveBeenCalledWith('grid_template')
    expect(chain.insert).toHaveBeenCalledWith({
      name: 'Curry', spacing_x_m: 2, spacing_y_m: 2,
      angle_true_north_deg: 45, origin_offset_x: 0, origin_offset_y: 0,
    })
    expect(template.name).toBe('Curry')
  })

  it('lists all grid templates', async () => {
    const { from } = createSupabaseChainMock({
      data: [
        { id: 't0', name: 'Hartmann', spacing_x_m: 2, spacing_y_m: 2.5, angle_true_north_deg: 0, origin_offset_x: 0, origin_offset_y: 0 },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const templates = await listGridTemplates()
    expect(templates).toHaveLength(1)
    expect(templates[0].name).toBe('Hartmann')
  })

  it('throws a descriptive French error when creation fails (e.g. duplicate name)', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'duplicate key value' } })
    vi.mocked(supabase).from = from

    await expect(
      createGridTemplate({ name: 'Hartmann', spacingXM: 2, spacingYM: 2.5, angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0 })
    ).rejects.toThrow('Impossible de créer le gabarit de grille : duplicate key value')
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/data/gridTemplatesRepo.test.ts`
Expected: FAIL — `Cannot find module './gridTemplatesRepo'`

- [ ] **Step 5: Implement `gridTemplatesRepo`**

```typescript
// src/data/gridTemplatesRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { GridTemplate } from '../domain/types'

export interface CreateGridTemplateInput {
  name: string
  spacingXM: number
  spacingYM: number
  angleTrueNorthDeg: number
  originOffsetX: number
  originOffsetY: number
}

interface GridTemplateRow {
  id: string
  name: string
  spacing_x_m: number
  spacing_y_m: number
  angle_true_north_deg: number
  origin_offset_x: number
  origin_offset_y: number
}

function mapRowToGridTemplate(row: GridTemplateRow): GridTemplate {
  return {
    id: row.id,
    name: row.name,
    spacingXM: row.spacing_x_m,
    spacingYM: row.spacing_y_m,
    angleTrueNorthDeg: row.angle_true_north_deg,
    originOffsetX: row.origin_offset_x,
    originOffsetY: row.origin_offset_y,
  }
}

export async function createGridTemplate(input: CreateGridTemplateInput): Promise<GridTemplate> {
  const { data, error } = await supabase
    .from('grid_template')
    .insert({
      name: input.name,
      spacing_x_m: input.spacingXM,
      spacing_y_m: input.spacingYM,
      angle_true_north_deg: input.angleTrueNorthDeg,
      origin_offset_x: input.originOffsetX,
      origin_offset_y: input.originOffsetY,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible de créer le gabarit de grille : ${error.message}`)
  return mapRowToGridTemplate(data as GridTemplateRow)
}

export async function listGridTemplates(): Promise<GridTemplate[]> {
  const { data, error } = await supabase.from('grid_template').select()

  if (error) throw new Error(`Impossible de charger les gabarits de grille : ${error.message}`)
  return (data as GridTemplateRow[]).map(mapRowToGridTemplate)
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/data/gridTemplatesRepo.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0003_seed_hartmann_template.sql src/data/gridTemplatesRepo.ts src/data/gridTemplatesRepo.test.ts
git commit -m "Add gridTemplatesRepo and seed the Hartmann template"
```

---

### Task 18: `GridTemplatePicker` (select existing or create a new template)

**Files:**
- Create: `src/components/GridTemplatePicker.tsx`
- Test: `src/components/GridTemplatePicker.test.tsx`

**Scope simplification:** the create-template form only exposes `name`, `spacingXM`,
`spacingYM`, `angleTrueNorthDeg` — `originOffsetX`/`originOffsetY` default to `0` and
aren't user-editable here. Spec §3.2 defines them as part of a `GridTemplate` but
never describes a workflow that needs a non-zero offset; exposing them would be
speculative UI for a case nobody asked for. `gridTemplatesRepo.createGridTemplate`
(Task 17) still accepts them, so this isn't a data-model limitation — only a
narrower form, easy to widen later if a real need shows up.

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/GridTemplatePicker.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GridTemplatePicker } from './GridTemplatePicker'
import * as gridTemplatesRepo from '../data/gridTemplatesRepo'

vi.mock('../data/gridTemplatesRepo')

const hartmann = {
  id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5,
  angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0,
}

describe('GridTemplatePicker', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists existing templates and calls onSelected when one is chosen', async () => {
    vi.mocked(gridTemplatesRepo.listGridTemplates).mockResolvedValue([hartmann])
    const onSelected = vi.fn()

    render(<GridTemplatePicker onSelected={onSelected} />)

    const option = await screen.findByRole('button', { name: /hartmann/i })
    fireEvent.click(option)
    expect(onSelected).toHaveBeenCalledWith(hartmann)
  })

  it('creates a new template and calls onSelected with it', async () => {
    vi.mocked(gridTemplatesRepo.listGridTemplates).mockResolvedValue([])
    const curry = {
      id: 't1', name: 'Curry', spacingXM: 2, spacingYM: 2,
      angleTrueNorthDeg: 45, originOffsetX: 0, originOffsetY: 0,
    }
    vi.mocked(gridTemplatesRepo.createGridTemplate).mockResolvedValue(curry)
    const onSelected = vi.fn()

    render(<GridTemplatePicker onSelected={onSelected} />)
    await screen.findByText(/aucun gabarit/i)

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Curry' } })
    fireEvent.change(screen.getByLabelText(/espacement x/i), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/espacement y/i), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/angle/i), { target: { value: '45' } })
    fireEvent.click(screen.getByRole('button', { name: /créer le gabarit/i }))

    await waitFor(() =>
      expect(gridTemplatesRepo.createGridTemplate).toHaveBeenCalledWith({
        name: 'Curry', spacingXM: 2, spacingYM: 2, angleTrueNorthDeg: 45,
        originOffsetX: 0, originOffsetY: 0,
      })
    )
    expect(onSelected).toHaveBeenCalledWith(curry)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/GridTemplatePicker.test.tsx`
Expected: FAIL — `Cannot find module './GridTemplatePicker'`

- [ ] **Step 3: Implement `GridTemplatePicker`**

```tsx
// src/components/GridTemplatePicker.tsx
import { useEffect, useState, type FormEvent } from 'react'
import { createGridTemplate, listGridTemplates } from '../data/gridTemplatesRepo'
import type { GridTemplate } from '../domain/types'

export interface GridTemplatePickerProps {
  onSelected: (template: GridTemplate) => void
}

export function GridTemplatePicker({ onSelected }: GridTemplatePickerProps) {
  const [templates, setTemplates] = useState<GridTemplate[] | null>(null)
  const [name, setName] = useState('')
  const [spacingXM, setSpacingXM] = useState('')
  const [spacingYM, setSpacingYM] = useState('')
  const [angleTrueNorthDeg, setAngleTrueNorthDeg] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listGridTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    try {
      const template = await createGridTemplate({
        name,
        spacingXM: Number(spacingXM),
        spacingYM: Number(spacingYM),
        angleTrueNorthDeg: Number(angleTrueNorthDeg),
        originOffsetX: 0,
        originOffsetY: 0,
      })
      onSelected(template)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (templates === null) return <p>Chargement des gabarits…</p>

  return (
    <div>
      {error && <p role="alert">{error}</p>}
      {templates.length === 0 ? (
        <p>Aucun gabarit existant — créez-en un.</p>
      ) : (
        <ul>
          {templates.map((t) => (
            <li key={t.id}>
              <button onClick={() => onSelected(t)}>{t.name}</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleCreate}>
        <label>
          Nom
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Espacement X (m)
          <input
            type="number" step="0.01" value={spacingXM}
            onChange={(e) => setSpacingXM(e.target.value)} required
          />
        </label>
        <label>
          Espacement Y (m)
          <input
            type="number" step="0.01" value={spacingYM}
            onChange={(e) => setSpacingYM(e.target.value)} required
          />
        </label>
        <label>
          Angle par rapport au nord vrai (degrés)
          <input
            type="number" step="0.1" value={angleTrueNorthDeg}
            onChange={(e) => setAngleTrueNorthDeg(e.target.value)} required
          />
        </label>
        <button type="submit">Créer le gabarit</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/GridTemplatePicker.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/GridTemplatePicker.tsx src/components/GridTemplatePicker.test.tsx
git commit -m "Add GridTemplatePicker: select or create a grid template"
```

**Scope note:** `GridTemplatePicker` is not wired into `MissionWorkspace` in this
chunk — that happens in Chunk 6, together with the map rendering of the generated
grid lines it will trigger. Selecting/creating a template with nothing yet visible on
the map would be a confusing dead end; Chunk 6 makes the whole "pick a template →
place its origin → see it on the map → adjust it" flow work end-to-end in one piece.

---

### Task 19: `gridInstancesRepo` + `gridLinesRepo`

**Files:**
- Create: `src/data/gridInstancesRepo.ts`
- Test: `src/data/gridInstancesRepo.test.ts`
- Create: `src/data/gridLinesRepo.ts`
- Test: `src/data/gridLinesRepo.test.ts`

- [ ] **Step 1: Write failing tests for `gridInstancesRepo`**

```typescript
// src/data/gridInstancesRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGridInstance } from './gridInstancesRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

const hartmann = {
  id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5,
  angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0,
}

describe('gridInstancesRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a grid instance with a frozen template snapshot', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: { id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 1.5, origin_y: -2 },
      error: null,
    })
    vi.mocked(supabase).from = from

    const instance = await createGridInstance({
      planId: 'p1', templateSnapshot: hartmann, originX: 1.5, originY: -2,
    })

    expect(from).toHaveBeenCalledWith('grid_instance')
    expect(chain.insert).toHaveBeenCalledWith({
      plan_id: 'p1', template_snapshot: hartmann, origin_x: 1.5, origin_y: -2,
    })
    expect(instance.templateSnapshot).toEqual(hartmann)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/gridInstancesRepo.test.ts`
Expected: FAIL — `Cannot find module './gridInstancesRepo'`

- [ ] **Step 3: Implement `gridInstancesRepo`**

```typescript
// src/data/gridInstancesRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { GridInstance, GridTemplate } from '../domain/types'

export interface CreateGridInstanceInput {
  planId: string
  templateSnapshot: GridTemplate
  originX: number
  originY: number
}

interface GridInstanceRow {
  id: string
  plan_id: string
  template_snapshot: GridTemplate
  origin_x: number
  origin_y: number
}

function mapRowToGridInstance(row: GridInstanceRow): GridInstance {
  return {
    id: row.id,
    planId: row.plan_id,
    templateSnapshot: row.template_snapshot,
    originX: row.origin_x,
    originY: row.origin_y,
  }
}

export async function createGridInstance(input: CreateGridInstanceInput): Promise<GridInstance> {
  const { data, error } = await supabase
    .from('grid_instance')
    .insert({
      plan_id: input.planId,
      template_snapshot: input.templateSnapshot,
      origin_x: input.originX,
      origin_y: input.originY,
    })
    .select()
    .single()

  if (error) throw new Error(`Impossible de créer l'instance de grille : ${error.message}`)
  return mapRowToGridInstance(data as GridInstanceRow)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/gridInstancesRepo.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Write failing tests for `gridLinesRepo`**

```typescript
// src/data/gridLinesRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGridLines } from './gridLinesRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('gridLinesRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('bulk-creates grid lines with adjustedPoints initialized to theoreticalPoints', async () => {
    const rows = [
      {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a',
        theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
        adjusted_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      },
    ]
    const { from, chain } = createSupabaseChainMock({ data: rows, error: null })
    vi.mocked(supabase).from = from

    const lines = await createGridLines([
      { gridInstanceId: 'gi1', family: 'axis-a', theoreticalPoints: [{ x: 0, y: -3 }, { x: 0, y: 3 }] },
    ])

    expect(from).toHaveBeenCalledWith('grid_line')
    expect(chain.insert).toHaveBeenCalledWith([
      {
        grid_instance_id: 'gi1', family: 'axis-a',
        theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
        adjusted_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      },
    ])
    expect(lines[0].adjustedPoints).toEqual(lines[0].theoreticalPoints)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/data/gridLinesRepo.test.ts`
Expected: FAIL — `Cannot find module './gridLinesRepo'`

- [ ] **Step 7: Implement `gridLinesRepo`**

```typescript
// src/data/gridLinesRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { GridLine, GridLineFamily, Point } from '../domain/types'

export interface CreateGridLineInput {
  gridInstanceId: string
  family: GridLineFamily
  theoreticalPoints: Point[]
}

interface GridLineRow {
  id: string
  grid_instance_id: string
  family: GridLineFamily
  theoretical_points: Point[]
  adjusted_points: Point[]
}

function mapRowToGridLine(row: GridLineRow): GridLine {
  return {
    id: row.id,
    gridInstanceId: row.grid_instance_id,
    family: row.family,
    theoreticalPoints: row.theoretical_points,
    adjustedPoints: row.adjusted_points,
  }
}

export async function createGridLines(inputs: CreateGridLineInput[]): Promise<GridLine[]> {
  const { data, error } = await supabase
    .from('grid_line')
    .insert(
      inputs.map((i) => ({
        grid_instance_id: i.gridInstanceId,
        family: i.family,
        theoretical_points: i.theoreticalPoints,
        adjusted_points: i.theoreticalPoints,
      }))
    )
    .select()

  if (error) throw new Error(`Impossible de créer les lignes de grille : ${error.message}`)
  return (data as GridLineRow[]).map(mapRowToGridLine)
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/data/gridLinesRepo.test.ts`
Expected: PASS (1 test)

- [ ] **Step 9: Commit**

```bash
git add src/data/gridInstancesRepo.ts src/data/gridInstancesRepo.test.ts src/data/gridLinesRepo.ts src/data/gridLinesRepo.test.ts
git commit -m "Add gridInstancesRepo and gridLinesRepo"
```

---

### Task 20: `createGridForPlan` orchestration

**Files:**
- Create: `src/domain/createGridForPlan.ts`
- Test: `src/domain/createGridForPlan.test.ts`

- [ ] **Step 1: Write a failing test**

```typescript
// src/domain/createGridForPlan.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createGridForPlan, DEFAULT_GRID_RADIUS_M } from './createGridForPlan'
import * as gridInstancesRepo from '../data/gridInstancesRepo'
import * as gridLinesRepo from '../data/gridLinesRepo'
import type { GridLine } from './types'

vi.mock('../data/gridInstancesRepo')
vi.mock('../data/gridLinesRepo')

const hartmann = {
  id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5,
  angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0,
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
          theoreticalPoints: i.theoreticalPoints,
          adjustedPoints: i.theoreticalPoints,
        })
      )
    )

    const result = await createGridForPlan('p1', hartmann, { x: 0, y: 0 })

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

    expect(result.instance.id).toBe('gi1')
    expect(result.lines).toHaveLength(linesArg.length)
  })

  it('composes the template origin offset into the clicked point before generating', async () => {
    const offsetTemplate = { ...hartmann, originOffsetX: 5, originOffsetY: -3 }
    vi.mocked(gridInstancesRepo.createGridInstance).mockResolvedValue({
      id: 'gi2', planId: 'p1', templateSnapshot: offsetTemplate, originX: 5, originY: -3,
    })
    vi.mocked(gridLinesRepo.createGridLines).mockResolvedValue([])

    await createGridForPlan('p1', offsetTemplate, { x: 0, y: 0 })

    // Clicked (0,0) + offset (5,-3) = final origin (5,-3) — this is what must
    // reach createGridInstance, per generateTheoreticalLines' documented
    // contract (Chunk 2) that origin composition is this function's job.
    expect(gridInstancesRepo.createGridInstance).toHaveBeenCalledWith({
      planId: 'p1', templateSnapshot: offsetTemplate, originX: 5, originY: -3,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/createGridForPlan.test.ts`
Expected: FAIL — `Cannot find module './createGridForPlan'`

- [ ] **Step 3: Implement `createGridForPlan`**

```typescript
// src/domain/createGridForPlan.ts
import { generateTheoreticalLines, type BoundingBox } from '../geometry/gridGeneration'
import { createGridInstance } from '../data/gridInstancesRepo'
import { createGridLines } from '../data/gridLinesRepo'
import type { GridTemplate, Point } from './types'

/**
 * Fixed default extent around the grid origin. A real "current map viewport"
 * bounds would need reading Leaflet's live view and converting it to local
 * coordinates — deferred to Chunk 6, once the map actually renders the
 * generated lines and it's clear whether this default needs to be wider.
 */
export const DEFAULT_GRID_RADIUS_M = 30

export async function createGridForPlan(
  planId: string,
  template: GridTemplate,
  originClicked: Point,
  radiusM: number = DEFAULT_GRID_RADIUS_M
) {
  // generateTheoreticalLines (Chunk 2) documents that it expects the FINAL,
  // already-composed origin — i.e. the point Laurent clicked, shifted by the
  // template's own offset. That composition is this function's job; skipping
  // it would silently misplace every grid generated from a template whose
  // origin offset isn't (0, 0).
  const origin: Point = {
    x: originClicked.x + template.originOffsetX,
    y: originClicked.y + template.originOffsetY,
  }

  const bounds: BoundingBox = {
    minX: origin.x - radiusM,
    maxX: origin.x + radiusM,
    minY: origin.y - radiusM,
    maxY: origin.y + radiusM,
  }
  const generated = generateTheoreticalLines(template, origin, bounds)

  const instance = await createGridInstance({
    planId,
    templateSnapshot: template,
    originX: origin.x,
    originY: origin.y,
  })
  const lines = await createGridLines(
    generated.map((l) => ({
      gridInstanceId: instance.id,
      family: l.family,
      theoreticalPoints: l.points,
    }))
  )

  return { instance, lines }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/createGridForPlan.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/createGridForPlan.ts src/domain/createGridForPlan.test.ts
git commit -m "Add createGridForPlan orchestration"
```

---

### Task 21: Polarity (+/-) and per-network color; seed all 5 confirmed networks

**Why this task exists:** Laurent confirmed (after Task 17 was written) that every
network line carries a **polarity** (+ or −), shown via **line style** (solid = +,
dashed = −) under **one color per network** — not the two-colors-per-axis reading
initially suspected from the photographed reference table. He also provided the
authoritative spacing ranges, band widths, and vibratory bases for **5 confirmed
networks** (Hartmann, Curry, Palm, Peyré, Wissmann) from a physical manual — enough
to seed all 5 properly, superseding Task 17's Hartmann-only seed. "Argent" is **not**
a 6th `GridTemplate` — see this chunk's opening correction: it's part of a
planetary-scale sacred-network system (with Or and Cuivre) that needs a different
data model entirely, deferred as its own future sub-project, not seeded here.

**Files:**
- Create: `supabase/migrations/0004_polarity_and_color.sql`
- Create: `supabase/migrations/0005_seed_confirmed_networks.sql`
- Modify: `src/domain/types.ts` (add `GridTemplate.color`, `GridLine.polarity`)
- Modify: `src/geometry/gridGeneration.ts` + `.test.ts` (assign alternating polarity)
- Modify: `src/data/gridTemplatesRepo.ts` + `.test.ts` (carry `color`)
- Modify: `src/data/gridLinesRepo.ts` + `.test.ts` (carry `polarity`)
- Modify: `src/domain/createGridForPlan.ts` + `.test.ts` (pass `polarity` through)
- Modify: `src/components/GridTemplatePicker.tsx` + `.test.tsx` (add a color field)

**Blast radius — every existing `GridTemplate`/`GridLine` literal that must gain the
new required fields (following Task 13's precedent: widening a shared type breaks
sibling fixtures silently under `npx vitest run` alone, since esbuild's transform
doesn't type-check — only `tsc`/`npm run build` would catch a missed one, see Step 18
below):**
- `src/domain/types.test.ts` (Chunk 1, Task 4) — the `line: GridLine` literal needs
  `polarity: '+'` added.
- `src/data/gridInstancesRepo.test.ts` (Task 19) — the top-level `hartmann` const
  needs `color: '#d32f2f'` added.
- `src/domain/createGridForPlan.test.ts` (Task 20) — the top-level `hartmann` const
  needs `color: '#d32f2f'` added (this also fixes the derived `offsetTemplate =
  {...hartmann, originOffsetX: 5, originOffsetY: -3}`, which spreads from it).
- `src/components/GridTemplatePicker.test.tsx` (Task 18) — **both** the first test's
  `hartmann` const and the second test's `curry` const need `color` added (Step 14
  below only walked through the second test's color-input interaction; the first
  test's fixture object needs the field too, independent of any UI interaction).
- `src/data/gridTemplatesRepo.test.ts` (Task 17) — all three tests' `createGridTemplate`
  calls/expectations need `color` added, including the third ("throws a descriptive
  French error…") test, not just the first two.

**Reference values used below** (E-O/N-S trames for the two "réseaux globaux" —
Palm, Peyré — and NE-SO/NO-SE trames for the two "réseaux diagonaux" — Curry,
Wissmann — from Laurent's photographed manual page; Hartmann is also a réseau
global):

| Réseau | Trame range | Midpoint used as seed | Angle | Color |
|---|---|---|---|---|
| Hartmann | E-O 1,50-3,50m / N-S 1,10-2,50m | 2,5 / 1,8 | 0° | `#d32f2f` (rouge — confirmed) |
| Curry | diagonal 3,00-8,00m, most often ~4m (Laurent's manual, "FER... réseau diagonal") | 4 / 4 | 45° | `#f2c230` (jaune — confirmed) |
| Palm | E-O 5,50-7,50m / N-S 3,50-5,50m | 6,5 / 4,5 | 0° | `#4a90c4` (placeholder) |
| Peyré | E-O 6,00-8,50m / N-S 5,00-8,00m | 7,25 / 6,5 | 0° | `#8e5fb3` (placeholder — shifted from an earlier gold/mustard placeholder that visually clashed with Curry's now-confirmed jaune) |
| Wissmann | diagonal 8,50-11,50m | 10 / 10 | 45°* | `#2d6a4f` (placeholder) |

**⚠️ Not fully confirmed:** the midpoint of each range is seeded as a starting
point, not a fixed truth — Laurent adjusts per mission via the felt-line deformation
(§6.2) exactly as with any other template. *Wissmann's angle is assumed identical to
Curry's (both described as "diagonal") — the manual doesn't state whether Wissmann
sits on the same diagonal as Curry or the other one; verify with Laurent before
relying on it. Hartmann (rouge) and Curry (jaune) colors are Laurent's own confirmed
convention. Palm/Peyré/Wissmann remain placeholders (checked to be visually distinct
from each other and from Hartmann/Curry) pending his real values — a one-line
`UPDATE grid_template SET color = ...` migration when he supplies them, not a code
change.

- [ ] **Step 1: Migration — add columns**

```sql
-- supabase/migrations/0004_polarity_and_color.sql
alter table grid_template add column color text not null default '#888888';
alter table grid_line add column polarity text not null default '+' check (polarity in ('+', '-'));
```

- [ ] **Step 2: Apply it**

Run: `npx supabase db push`

- [ ] **Step 3: Update domain types**

```typescript
// src/domain/types.ts — modify GridTemplate, add GridLinePolarity, modify GridLine
export interface GridTemplate {
  id: string
  name: string
  spacingXM: number
  spacingYM: number
  angleTrueNorthDeg: number
  originOffsetX: number
  originOffsetY: number
  /** Single color for the whole network — polarity is shown via line style (solid/dashed), not a second color. */
  color: string
}

export type GridLinePolarity = '+' | '-'

export interface GridLine {
  id: string
  gridInstanceId: string
  family: GridLineFamily
  polarity: GridLinePolarity
  theoreticalPoints: Point[]
  adjustedPoints: Point[]
}
```

- [ ] **Step 4: Write a failing test for alternating polarity in `generateTheoreticalLines`**

```typescript
// append to src/geometry/gridGeneration.test.ts, inside describe('generateTheoreticalLines')
it('assigns alternating polarity by grid line index (theoretical convention, not a field measurement)', () => {
  const template = { spacingXM: 2, spacingYM: 2.5, angleTrueNorthDeg: 0 }
  const origin = { x: 0, y: 0 }
  const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }
  const lines = generateTheoreticalLines(template, origin, bounds)

  const axisA = lines.filter((l) => l.family === 'axis-a')
  const central = axisA.find((l) => Math.abs(l.points[0].x) < 1e-9)!
  const nextOver = axisA.find((l) => Math.abs(l.points[0].x - 2.5) < 1e-9)!
  expect(central.polarity).toBe('+')
  expect(nextOver.polarity).toBe('-')
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/geometry/gridGeneration.test.ts`
Expected: FAIL — `polarity` is `undefined`, not `'+'`/`'-'`

- [ ] **Step 6: Add polarity to `generateTheoreticalLines`**

```typescript
// src/geometry/gridGeneration.ts — modify GeneratedLine and both generation loops
export interface GeneratedLine {
  family: GridLineFamily
  /**
   * Alternates by grid index (even = '+', odd = '-') — this is the network's
   * deterministic theoretical polarity pattern (confirmed for this family of
   * rectangular networks: a fixed checkerboard alternation), not something
   * measured in the field. Laurent's felt-line adjustment (§6.2) can still
   * override it per line once GridLine editing (Chunk 6) exists.
   */
  polarity: '+' | '-'
  points: [Point, Point]
}
```

```typescript
// inside generateTheoreticalLines, both loops — add polarity from k's parity:
  const offsetA = maxOffsetIndexNeeded(origin, template.spacingYM, bounds)
  for (let k = -offsetA; k <= offsetA; k++) {
    const linePoint: Point = {
      x: origin.x + k * template.spacingYM * perpDir.x,
      y: origin.y + k * template.spacingYM * perpDir.y,
    }
    const clipped = clipLineToBounds(linePoint, primaryDir, bounds)
    if (clipped) lines.push({ family: 'axis-a', polarity: k % 2 === 0 ? '+' : '-', points: clipped })
  }

  const offsetB = maxOffsetIndexNeeded(origin, template.spacingXM, bounds)
  for (let k = -offsetB; k <= offsetB; k++) {
    const linePoint: Point = {
      x: origin.x + k * template.spacingXM * primaryDir.x,
      y: origin.y + k * template.spacingXM * primaryDir.y,
    }
    const clipped = clipLineToBounds(linePoint, perpDir, bounds)
    if (clipped) lines.push({ family: 'axis-b', polarity: k % 2 === 0 ? '+' : '-', points: clipped })
  }
```

(`k % 2 === 0 ? '+' : '-'` — note JS's `%` can return `-0`, which is still `=== 0`, so
negative even `k` values correctly get `'+'` too)

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/geometry/gridGeneration.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 8: Update `gridTemplatesRepo` to carry `color`**

```typescript
// src/data/gridTemplatesRepo.ts — add `color` to CreateGridTemplateInput, GridTemplateRow, mapRowToGridTemplate, and the insert payload
export interface CreateGridTemplateInput {
  name: string
  spacingXM: number
  spacingYM: number
  angleTrueNorthDeg: number
  originOffsetX: number
  originOffsetY: number
  color: string
}
// GridTemplateRow gains `color: string`; mapRowToGridTemplate gains `color: row.color`;
// createGridTemplate's .insert({...}) payload gains `color: input.color`.
```

Update `gridTemplatesRepo.test.ts`'s existing payloads/expectations to include
`color: '#52a675'` (or any test value) on both the input and the row/expected object.

- [ ] **Step 9: Run tests to verify they still pass**

Run: `npx vitest run src/data/gridTemplatesRepo.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 10: Update `gridLinesRepo` to carry `polarity`**

```typescript
// src/data/gridLinesRepo.ts — add `polarity` to CreateGridLineInput, GridLineRow, mapRowToGridLine, and the insert payload
export interface CreateGridLineInput {
  gridInstanceId: string
  family: GridLineFamily
  polarity: GridLinePolarity
  theoreticalPoints: Point[]
}
// GridLineRow gains `polarity: GridLinePolarity`; mapRowToGridLine gains `polarity: row.polarity`;
// the insert mapping gains `polarity: i.polarity`.
```

Update `gridLinesRepo.test.ts`'s existing payload/expectation to include
`polarity: '+'`.

- [ ] **Step 11: Run tests to verify they still pass**

Run: `npx vitest run src/data/gridLinesRepo.test.ts`
Expected: PASS (1 test)

- [ ] **Step 12: Pass `polarity` through `createGridForPlan`**

```typescript
// src/domain/createGridForPlan.ts — the createGridLines mapping gains polarity:
  const lines = await createGridLines(
    generated.map((l) => ({
      gridInstanceId: instance.id,
      family: l.family,
      polarity: l.polarity,
      theoreticalPoints: l.points,
    }))
  )
```

Update `createGridForPlan.test.ts`'s `gridLinesRepo.createGridLines` mock
implementation to also pass through `polarity: i.polarity` in its returned objects
(currently omits it).

- [ ] **Step 13: Run tests to verify they still pass**

Run: `npx vitest run src/domain/createGridForPlan.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 14: Add a color field to `GridTemplatePicker`'s create form**

```tsx
// src/components/GridTemplatePicker.tsx — add state + field
const [color, setColor] = useState('#888888')

// in handleCreate's createGridTemplate call, add: color,

// in the form JSX, add before the submit button:
<label>
  Couleur
  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
</label>
```

Update `GridTemplatePicker.test.tsx`'s creation test to set the color input
(`fireEvent.change(screen.getByLabelText('Couleur'), { target: { value: '#52a675' } })`)
and expect `color: '#52a675'` in the `createGridTemplate` call.

- [ ] **Step 15: Run tests to verify they pass**

Run: `npx vitest run src/components/GridTemplatePicker.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 16: Seed the 5 confirmed networks**

```sql
-- supabase/migrations/0005_seed_confirmed_networks.sql
insert into grid_template (name, spacing_x_m, spacing_y_m, angle_true_north_deg, origin_offset_x, origin_offset_y, color)
values
  ('Hartmann', 2.5, 1.8, 0, 0, 0, '#d32f2f'),
  ('Curry', 4, 4, 45, 0, 0, '#f2c230'),
  ('Palm', 6.5, 4.5, 0, 0, 0, '#4a90c4'),
  ('Peyré', 7.25, 6.5, 0, 0, 0, '#8e5fb3'),
  ('Wissmann', 10, 10, 45, 0, 0, '#2d6a4f')
on conflict (name) do update set
  spacing_x_m = excluded.spacing_x_m,
  spacing_y_m = excluded.spacing_y_m,
  angle_true_north_deg = excluded.angle_true_north_deg,
  color = excluded.color;
```

- [ ] **Step 17: Apply it and run the full test suite**

Run: `npx supabase db push && npx vitest run`
Expected: migration applies; all tests pass.

- [ ] **Step 18: Type-check the whole project**

Run: `npx tsc -b --noEmit`
Expected: no errors. This step exists specifically because `npx vitest run`
(esbuild-transformed, no type-checking) would NOT catch a `GridTemplate`/`GridLine`
object literal left over from before this task's fields were added — the fixtures
enumerated in this task's "Blast radius" note above are exactly the kind of gap this
step is meant to catch. If it reports missing `color`/`polarity` properties anywhere
not already listed there, fix them the same way (add the field with a placeholder
value) before moving on.

- [ ] **Step 19: Commit**

```bash
git add supabase/migrations/0004_polarity_and_color.sql supabase/migrations/0005_seed_confirmed_networks.sql src/domain/types.ts src/domain/types.test.ts src/geometry/gridGeneration.ts src/geometry/gridGeneration.test.ts src/data/gridTemplatesRepo.ts src/data/gridTemplatesRepo.test.ts src/data/gridLinesRepo.ts src/data/gridLinesRepo.test.ts src/data/gridInstancesRepo.test.ts src/domain/createGridForPlan.ts src/domain/createGridForPlan.test.ts src/components/GridTemplatePicker.tsx src/components/GridTemplatePicker.test.tsx
git commit -m "Add polarity (+/-) and per-network color; seed all 5 confirmed networks"
```

---

### Task 22: "Base vibratoire" — reinforced (doubled) line every Nth trame

**Why this task exists:** Laurent's reference diagram shows that within a family of
parallel lines, every **Nth line is doubled/reinforced** — N being the network's
"base vibratoire" from the original reference table (Task 21's table): Hartmann=7,
Curry=5, Palm=7, Peyré=9, Wissmann=5. This is a per-line rendering distinction (a
harmonic/reinforced line), not a different kind of geometry — no new object type is
needed, just one more derived attribute alongside `polarity`, following the exact
same "alternate by grid index" pattern Task 21 already established.

**Files:**
- Create: `supabase/migrations/0006_vibratory_base.sql`
- Create: `supabase/migrations/0007_seed_vibratory_base.sql`
- Modify: `src/domain/types.ts` (add `GridTemplate.vibratoryBase`, `GridLine.reinforced`)
- Modify: `src/geometry/gridGeneration.ts` + `.test.ts` (compute `reinforced`; widen the `Pick<GridTemplate, ...>` parameter type)
- Modify: `src/geometry/orthogonality.test.ts` — **not required**: `familyBearingDeg`'s
  parameter type is `Pick<GridTemplate, 'angleTrueNorthDeg'>` only, unaffected by
  widening `GridTemplate` itself with unrelated fields.
- Modify: `src/data/gridTemplatesRepo.ts` + `.test.ts` (carry `vibratoryBase`)
- Modify: `src/data/gridLinesRepo.ts` + `.test.ts` (carry `reinforced`)
- Modify: `src/domain/createGridForPlan.ts` + `.test.ts` (pass `reinforced` through)
- Modify: `src/components/GridTemplatePicker.tsx` + `.test.tsx` (add a "base vibratoire" field)

**Blast radius (same class of gap Task 21 hit twice — enumerating explicitly this
time, for every fixture that constructs a `GridTemplate`-shaped object or calls
`generateTheoreticalLines`):**
- `src/geometry/gridGeneration.test.ts` — **all three** existing `template = {...}`
  object literals (the two from Chunk 2 Task 5, plus Task 21's polarity test) need
  `vibratoryBase: 7` added, since `generateTheoreticalLines`'s parameter type is
  about to require it.
- `src/domain/types.test.ts` (Chunk 1, Task 4) — the `line: GridLine` literal needs
  `reinforced: false` added.
- `src/data/gridTemplatesRepo.test.ts` (Task 17) — all three tests' payloads/rows
  need `vibratoryBase` added (e.g. `5` for the `Curry` fixture used there).
- `src/data/gridLinesRepo.test.ts` (Task 19) — the bulk-insert test's row, input, and
  expected-insert-payload all need `reinforced: true` added (pick a value consistent
  with the test's existing k=0-style example, matching how it already sets `polarity: '+'`).
- `src/data/gridInstancesRepo.test.ts` (Task 19) — the `hartmann` const needs
  `vibratoryBase: 7` added.
- `src/domain/createGridForPlan.test.ts` (Task 20) — the `hartmann` const (and its
  derived `offsetTemplate`) needs `vibratoryBase: 7` added; the `gridLinesRepo.createGridLines`
  mock implementation needs to pass through `reinforced: i.reinforced` in its
  returned objects.
- `src/components/GridTemplatePicker.test.tsx` (Task 18) — **both** the first test's
  `hartmann` const and the second test's `curry` const need `vibratoryBase` added;
  the second test's form-filling steps need a new field interaction (see Step 14
  below) and its `createGridTemplate` expectation needs `vibratoryBase` added to the
  payload.

- [ ] **Step 1: Migration — add columns**

```sql
-- supabase/migrations/0006_vibratory_base.sql
alter table grid_template add column vibratory_base integer not null default 7 check (vibratory_base > 0);
alter table grid_line add column reinforced boolean not null default false;
```

- [ ] **Step 2: Apply it**

Run: `npx supabase db push`

- [ ] **Step 3: Update domain types**

```typescript
// src/domain/types.ts — modify GridTemplate and GridLine
export interface GridTemplate {
  id: string
  name: string
  spacingXM: number
  spacingYM: number
  angleTrueNorthDeg: number
  originOffsetX: number
  originOffsetY: number
  color: string
  /** Every Nth line in a family is a reinforced/doubled "harmonic" line — N is this value ("base vibratoire"). */
  vibratoryBase: number
}

export interface GridLine {
  id: string
  gridInstanceId: string
  family: GridLineFamily
  polarity: GridLinePolarity
  /** True for every vibratoryBase-th line in its family (a reinforced/doubled harmonic line). */
  reinforced: boolean
  theoreticalPoints: Point[]
  adjustedPoints: Point[]
}
```

- [ ] **Step 4: Write a failing test for the reinforced-line pattern**

```typescript
// append to src/geometry/gridGeneration.test.ts, inside describe('generateTheoreticalLines')
// Also add `vibratoryBase: 7` to this describe block's two existing template
// literals (Chunk 2, Task 5) and to Task 21's polarity test's template literal —
// generateTheoreticalLines' parameter type now requires it.
it('marks every vibratoryBase-th line as reinforced, starting from the central (k=0) line', () => {
  const template = { spacingXM: 2, spacingYM: 1, angleTrueNorthDeg: 0, vibratoryBase: 3 }
  const origin = { x: 0, y: 0 }
  const bounds = { minX: -3.5, maxX: 3.5, minY: -3.5, maxY: 3.5 }
  const lines = generateTheoreticalLines(template, origin, bounds)

  const axisA = lines.filter((l) => l.family === 'axis-a')
  const central = axisA.find((l) => Math.abs(l.points[0].x) < 1e-9)! // k=0
  const kThree = axisA.find((l) => Math.abs(l.points[0].x - 3) < 1e-9)! // k=3, spacingYM=1
  const kOne = axisA.find((l) => Math.abs(l.points[0].x - 1) < 1e-9)! // k=1

  expect(central.reinforced).toBe(true) // k=0 is a multiple of 3
  expect(kThree.reinforced).toBe(true) // k=3 is a multiple of 3
  expect(kOne.reinforced).toBe(false) // k=1 is not
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/geometry/gridGeneration.test.ts`
Expected: FAIL — `reinforced` is `undefined`

- [ ] **Step 6: Add `reinforced` to `generateTheoreticalLines`**

```typescript
// src/geometry/gridGeneration.ts — modify GeneratedLine and the function signature/loops
export interface GeneratedLine {
  family: GridLineFamily
  polarity: '+' | '-'
  reinforced: boolean
  points: [Point, Point]
}

export function generateTheoreticalLines(
  template: Pick<GridTemplate, 'spacingXM' | 'spacingYM' | 'angleTrueNorthDeg' | 'vibratoryBase'>,
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
    if (clipped) {
      lines.push({
        family: 'axis-a',
        polarity: k % 2 === 0 ? '+' : '-',
        reinforced: k % template.vibratoryBase === 0,
        points: clipped,
      })
    }
  }

  const offsetB = maxOffsetIndexNeeded(origin, template.spacingXM, bounds)
  for (let k = -offsetB; k <= offsetB; k++) {
    const linePoint: Point = {
      x: origin.x + k * template.spacingXM * primaryDir.x,
      y: origin.y + k * template.spacingXM * primaryDir.y,
    }
    const clipped = clipLineToBounds(linePoint, perpDir, bounds)
    if (clipped) {
      lines.push({
        family: 'axis-b',
        polarity: k % 2 === 0 ? '+' : '-',
        reinforced: k % template.vibratoryBase === 0,
        points: clipped,
      })
    }
  }

  return lines
}
```

(`k % template.vibratoryBase === 0` correctly also catches negative multiples, same
`-0 === 0` reasoning already noted for `polarity`)

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/geometry/gridGeneration.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 8: Update `gridTemplatesRepo` to carry `vibratoryBase`**

```typescript
// src/data/gridTemplatesRepo.ts — add `vibratoryBase` to CreateGridTemplateInput,
// GridTemplateRow (as `vibratory_base`), mapRowToGridTemplate, and the insert payload
```

Update `gridTemplatesRepo.test.ts`'s three tests to include `vibratoryBase: 5` (input)
/ `vibratory_base: 5` (row) / `vibratoryBase: 5` (expected) as appropriate per test.

- [ ] **Step 9: Run tests to verify they still pass**

Run: `npx vitest run src/data/gridTemplatesRepo.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 10: Update `gridLinesRepo` to carry `reinforced`**

```typescript
// src/data/gridLinesRepo.ts — add `reinforced` to CreateGridLineInput, GridLineRow,
// mapRowToGridLine, and the insert payload
```

Update `gridLinesRepo.test.ts`'s bulk-insert test to include `reinforced: true` on
the row, the input, and the expected insert payload.

- [ ] **Step 11: Run test to verify it still passes**

Run: `npx vitest run src/data/gridLinesRepo.test.ts`
Expected: PASS (1 test)

- [ ] **Step 12: Update `gridInstancesRepo.test.ts` and `createGridForPlan` + its test**

Add `vibratoryBase: 7` to `gridInstancesRepo.test.ts`'s `hartmann` const.

```typescript
// src/domain/createGridForPlan.ts — the createGridLines mapping gains reinforced:
  const lines = await createGridLines(
    generated.map((l) => ({
      gridInstanceId: instance.id,
      family: l.family,
      polarity: l.polarity,
      reinforced: l.reinforced,
      theoreticalPoints: l.points,
    }))
  )
```

Add `vibratoryBase: 7` to `createGridForPlan.test.ts`'s `hartmann` const (which also
fixes the derived `offsetTemplate`), and add `reinforced: i.reinforced` to that
file's `gridLinesRepo.createGridLines` mock implementation's returned objects.

- [ ] **Step 13: Run tests to verify they still pass**

Run: `npx vitest run src/data/gridInstancesRepo.test.ts src/domain/createGridForPlan.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 14: Add a "base vibratoire" field to `GridTemplatePicker`'s create form**

```tsx
// src/components/GridTemplatePicker.tsx — add state + field
const [vibratoryBase, setVibratoryBase] = useState('7')

// in handleCreate's createGridTemplate call, add: vibratoryBase: Number(vibratoryBase),

// in the form JSX, add after the "Couleur" field Task 21 already inserted
// (i.e. still before the submit button):
<label>
  Base vibratoire
  <input
    type="number" step="1" min="1" value={vibratoryBase}
    onChange={(e) => setVibratoryBase(e.target.value)} required
  />
</label>
```

Update `GridTemplatePicker.test.tsx`: add `vibratoryBase: 7` to the first test's
`hartmann` const and `vibratoryBase: 5` to the second test's `curry` const; in the
second test, add
`fireEvent.change(screen.getByLabelText(/base vibratoire/i), { target: { value: '5' } })`
alongside the other field interactions, and add `vibratoryBase: 5` to the expected
`createGridTemplate` call payload.

- [ ] **Step 15: Run tests to verify they pass**

Run: `npx vitest run src/components/GridTemplatePicker.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 16: Update `types.test.ts`'s `GridLine` literal**

Add `reinforced: false` to `src/domain/types.test.ts`'s `line: GridLine` object.

- [ ] **Step 17: Seed vibratory base values for the 5 confirmed networks**

```sql
-- supabase/migrations/0007_seed_vibratory_base.sql
update grid_template set vibratory_base = 7 where name = 'Hartmann';
update grid_template set vibratory_base = 5 where name = 'Curry';
update grid_template set vibratory_base = 7 where name = 'Palm';
update grid_template set vibratory_base = 9 where name = 'Peyré';
update grid_template set vibratory_base = 5 where name = 'Wissmann';
```

- [ ] **Step 18: Apply it, run the full suite, and type-check**

Run: `npx supabase db push && npx vitest run && npx tsc -b --noEmit`
Expected: migration applies; all tests pass; no type errors. If `tsc` reports a
missing `vibratoryBase`/`reinforced` property anywhere not listed in this task's
"Blast radius" note, fix it the same way before moving on.

- [ ] **Step 19: Commit**

```bash
git add supabase/migrations/0006_vibratory_base.sql supabase/migrations/0007_seed_vibratory_base.sql src/domain/types.ts src/domain/types.test.ts src/geometry/gridGeneration.ts src/geometry/gridGeneration.test.ts src/data/gridTemplatesRepo.ts src/data/gridTemplatesRepo.test.ts src/data/gridLinesRepo.ts src/data/gridLinesRepo.test.ts src/data/gridInstancesRepo.test.ts src/domain/createGridForPlan.ts src/domain/createGridForPlan.test.ts src/components/GridTemplatePicker.tsx src/components/GridTemplatePicker.test.tsx
git commit -m "Add vibratory-base reinforced-line pattern; seed values for 5 confirmed networks"
```

---

**Chunk 5 exit criteria:** `npx vitest run` and `npx tsc -b --noEmit` both pass.
Laurent can, programmatically (not yet through the UI — Chunk 7 wires it up), select
or create a `GridTemplate` (with color and base vibratoire) and generate + persist a
`GridInstance` with its `GridLine`s (each carrying a +/- polarity and a
reinforced/doubled flag every Nth line) around a chosen origin. All 5 confirmed
networks (Hartmann, Curry, Palm, Peyré, Wissmann) are seeded with real reference
values including their vibratory base; the planetary-scale Or/Argent/Cuivre system
and Bagua (both a different kind of object than `GridTemplate`, see this chunk's
opening corrections) remain explicitly out of scope, deferred to their own future
sub-projects.

---

## Chunk 6: Global assessment (nuisance causes + Bovis vibratory rate)

**Why this chunk exists, and why it comes before grid rendering/editing:** Laurent's
real field workflow does this measurement **first**, right after creating the
mission and its exterior plan — before locating magnetic north, before any water or
grid search. The result conditions what he investigates next (e.g. a high
"géobiologique" cause reading focuses the rest of the visit on telluric networks).
It's also fully independent of the map/grid work — a simple one-time-per-mission
form — so it's a clean, self-contained chunk to build ahead of the more complex
Chunk 7 (map rendering, layers, grid editing).

**Scale confirmed by Laurent:** the 5 nuisance causes (architectural,
électromagnétique, géobiologique, paranormal, autres) are each rated **0 to 10**.
The vibratory rate uses the Bovis scale, **0 to 180 000**.

### Task 23: Global assessment schema + repo

**Files:**
- Create: `supabase/migrations/0008_global_assessment.sql`
- Modify: `src/domain/types.ts` (add global assessment fields to `Mission`)
- Modify: `src/data/missionsRepo.ts` + `.test.ts` (add `setGlobalAssessment`)

**Blast radius:** widening `Mission` again means every existing `Mission`-shaped
fixture across the plan needs the 6 new nullable fields added. Enumerating them,
following the same rigor as Chunk 5's Tasks 21/22:
- `src/data/missionsRepo.test.ts` (Chunk 3/4) — all `Mission`/row fixtures.
- `src/components/MissionForm.test.tsx` (Chunk 3) — the `mission` object literal.
- `src/pages/MissionWorkspace.test.tsx` (Chunk 4) — the inline `MissionForm` mock's
  hardcoded object, and the `missionWithOrigin` const.
All 6 new fields are nullable (`number | null`), so every existing fixture can just
add them as `null` — no need to invent plausible non-null values for fixtures that
aren't testing this feature.

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/0008_global_assessment.sql
alter table mission add column cause_architectural numeric check (cause_architectural between 0 and 10);
alter table mission add column cause_electromagnetique numeric check (cause_electromagnetique between 0 and 10);
alter table mission add column cause_geobiologique numeric check (cause_geobiologique between 0 and 10);
alter table mission add column cause_paranormale numeric check (cause_paranormale between 0 and 10);
alter table mission add column cause_autres numeric check (cause_autres between 0 and 10);
alter table mission add column bovis_rate numeric check (bovis_rate between 0 and 180000);
```

- [ ] **Step 2: Apply it**

Run: `npx supabase db push`

- [ ] **Step 3: Extend the `Mission` type**

```typescript
// src/domain/types.ts — modify Mission
export interface Mission {
  id: string
  address: string
  missionDate: string
  declinationDeg: number | null
  originLat: number | null
  originLng: number | null
  causeArchitectural: number | null
  causeElectromagnetique: number | null
  causeGeobiologique: number | null
  causeParanormale: number | null
  causeAutres: number | null
  bovisRate: number | null
}
```

- [ ] **Step 4: Fix the blast-radius fixtures**

Add `causeArchitectural: null, causeElectromagnetique: null, causeGeobiologique: null,
causeParanormale: null, causeAutres: null, bovisRate: null` (and the equivalent
`_snake_case: null` row fields in `missionsRepo.test.ts`'s DB-row literals) to every
fixture enumerated in this task's "Blast radius" note above.

- [ ] **Step 5: Write a failing test for `setGlobalAssessment`**

```typescript
// append to src/data/missionsRepo.test.ts
it('sets the global assessment and maps it back', async () => {
  const { from, chain } = createSupabaseChainMock({
    data: {
      id: 'm1', address: 'A', mission_date: '2026-07-20', declination_deg: null,
      origin_lat: null, origin_lng: null,
      cause_architectural: 3, cause_electromagnetique: 6, cause_geobiologique: 8,
      cause_paranormale: 1, cause_autres: 0, bovis_rate: 9500,
    },
    error: null,
  })
  vi.mocked(supabase).from = from

  const mission = await setGlobalAssessment('m1', {
    causeArchitectural: 3, causeElectromagnetique: 6, causeGeobiologique: 8,
    causeParanormale: 1, causeAutres: 0, bovisRate: 9500,
  })

  expect(from).toHaveBeenCalledWith('mission')
  expect(chain.eq).toHaveBeenCalledWith('id', 'm1')
  expect(mission.bovisRate).toBe(9500)
  expect(mission.causeGeobiologique).toBe(8)
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/data/missionsRepo.test.ts`
Expected: FAIL — `setGlobalAssessment is not a function`

- [ ] **Step 7: Implement `setGlobalAssessment`**

```typescript
// src/data/missionsRepo.ts — modify MissionRow, mapRowToMission, and add:
interface MissionRow {
  id: string
  address: string
  mission_date: string
  declination_deg: number | null
  origin_lat: number | null
  origin_lng: number | null
  cause_architectural: number | null
  cause_electromagnetique: number | null
  cause_geobiologique: number | null
  cause_paranormale: number | null
  cause_autres: number | null
  bovis_rate: number | null
}

function mapRowToMission(row: MissionRow): Mission {
  return {
    id: row.id,
    address: row.address,
    missionDate: row.mission_date,
    declinationDeg: row.declination_deg,
    originLat: row.origin_lat,
    originLng: row.origin_lng,
    causeArchitectural: row.cause_architectural,
    causeElectromagnetique: row.cause_electromagnetique,
    causeGeobiologique: row.cause_geobiologique,
    causeParanormale: row.cause_paranormale,
    causeAutres: row.cause_autres,
    bovisRate: row.bovis_rate,
  }
}

export interface GlobalAssessmentInput {
  causeArchitectural: number
  causeElectromagnetique: number
  causeGeobiologique: number
  causeParanormale: number
  causeAutres: number
  bovisRate: number
}

export async function setGlobalAssessment(
  missionId: string,
  input: GlobalAssessmentInput
): Promise<Mission> {
  const { data, error } = await supabase
    .from('mission')
    .update({
      cause_architectural: input.causeArchitectural,
      cause_electromagnetique: input.causeElectromagnetique,
      cause_geobiologique: input.causeGeobiologique,
      cause_paranormale: input.causeParanormale,
      cause_autres: input.causeAutres,
      bovis_rate: input.bovisRate,
    })
    .eq('id', missionId)
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer les mesures globales : ${error.message}`)
  return mapRowToMission(data as MissionRow)
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/data/missionsRepo.test.ts`
Expected: PASS (5 tests — 4 from before, unchanged in count by Step 4's fixture fix,
plus this new one)

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0008_global_assessment.sql src/domain/types.ts src/data/missionsRepo.ts src/data/missionsRepo.test.ts src/components/MissionForm.test.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "Add global assessment (nuisance causes + Bovis rate) schema and repo"
```

---

### Task 24: `GlobalAssessmentForm` UI + wire into `MissionWorkspace`

**Files:**
- Create: `src/components/GlobalAssessmentForm.tsx`
- Test: `src/components/GlobalAssessmentForm.test.tsx`
- Modify (full rewrite of the `WorkspacePhase` union and switch): `src/pages/MissionWorkspace.tsx`
- Modify: `src/pages/MissionWorkspace.test.tsx`

- [ ] **Step 1: Write failing tests for `GlobalAssessmentForm`**

```tsx
// src/components/GlobalAssessmentForm.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GlobalAssessmentForm } from './GlobalAssessmentForm'

describe('GlobalAssessmentForm', () => {
  it('renders a 0-10 slider for each of the 5 causes and a 0-180000 slider for Bovis', () => {
    render(<GlobalAssessmentForm onSaved={vi.fn()} />)
    ;[
      'Architectural', 'Électromagnétique', 'Géobiologique', 'Paranormal', 'Autres',
    ].forEach((label) => {
      const input = screen.getByLabelText(label) as HTMLInputElement
      expect(input.min).toBe('0')
      expect(input.max).toBe('10')
    })
    const bovis = screen.getByLabelText(/taux vibratoire/i) as HTMLInputElement
    expect(bovis.min).toBe('0')
    expect(bovis.max).toBe('180000')
  })

  it('calls onSaved with the slider values when submitted', () => {
    const onSaved = vi.fn()
    render(<GlobalAssessmentForm onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText('Architectural'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Électromagnétique'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Géobiologique'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Paranormal'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Autres'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText(/taux vibratoire/i), { target: { value: '9500' } })
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }))

    expect(onSaved).toHaveBeenCalledWith({
      causeArchitectural: 3, causeElectromagnetique: 6, causeGeobiologique: 8,
      causeParanormale: 1, causeAutres: 0, bovisRate: 9500,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/GlobalAssessmentForm.test.tsx`
Expected: FAIL — `Cannot find module './GlobalAssessmentForm'`

- [ ] **Step 3: Implement `GlobalAssessmentForm`**

```tsx
// src/components/GlobalAssessmentForm.tsx
import { useState } from 'react'
import type { GlobalAssessmentInput } from '../data/missionsRepo'

export interface GlobalAssessmentFormProps {
  onSaved: (input: GlobalAssessmentInput) => void
}

interface CauseSliderProps {
  label: string
  value: number
  onChange: (v: number) => void
}

function CauseSlider({ label, value, onChange }: CauseSliderProps) {
  return (
    <label>
      {label}
      <input
        type="range" min={0} max={10} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span>{value}</span>
    </label>
  )
}

export function GlobalAssessmentForm({ onSaved }: GlobalAssessmentFormProps) {
  const [causeArchitectural, setCauseArchitectural] = useState(0)
  const [causeElectromagnetique, setCauseElectromagnetique] = useState(0)
  const [causeGeobiologique, setCauseGeobiologique] = useState(0)
  const [causeParanormale, setCauseParanormale] = useState(0)
  const [causeAutres, setCauseAutres] = useState(0)
  const [bovisRate, setBovisRate] = useState(0)

  return (
    <div>
      <CauseSlider label="Architectural" value={causeArchitectural} onChange={setCauseArchitectural} />
      <CauseSlider label="Électromagnétique" value={causeElectromagnetique} onChange={setCauseElectromagnetique} />
      <CauseSlider label="Géobiologique" value={causeGeobiologique} onChange={setCauseGeobiologique} />
      <CauseSlider label="Paranormal" value={causeParanormale} onChange={setCauseParanormale} />
      <CauseSlider label="Autres" value={causeAutres} onChange={setCauseAutres} />
      <label>
        Taux vibratoire (Bovis)
        <input
          type="range" min={0} max={180000} step={500} value={bovisRate}
          onChange={(e) => setBovisRate(Number(e.target.value))}
        />
        <span>{bovisRate}</span>
      </label>
      <button
        onClick={() =>
          onSaved({
            causeArchitectural, causeElectromagnetique, causeGeobiologique,
            causeParanormale, causeAutres, bovisRate,
          })
        }
      >
        Enregistrer les mesures globales
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/GlobalAssessmentForm.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Insert a `global-assessment` phase into `MissionWorkspace`, between exterior-plan creation and origin-setting**

This follows Laurent's confirmed field order: mission → exterior plan → **global
assessment** → magnetic north / origin → everything else.

```typescript
// src/pages/MissionWorkspace.tsx — modify the WorkspacePhase union:
type WorkspacePhase =
  | { name: 'creating-mission' }
  | { name: 'creating-exterior-plan'; mission: Mission }
  | { name: 'global-assessment'; mission: Mission }
  | { name: 'setting-origin'; mission: Mission }
  | { name: 'ready-no-interior'; mission: Mission }
  | { name: 'calibrating-interior'; mission: Mission; imageUrl: string }
  | { name: 'error'; message: string }
```

```typescript
// modify handleMissionCreated's success path:
      await createPlan({ missionId: mission.id, kind: 'exterieur' })
      setPhase({ name: 'global-assessment', mission })
```

```typescript
// add a new handler:
import { setGlobalAssessment, type GlobalAssessmentInput } from '../data/missionsRepo'

async function handleGlobalAssessmentSaved(input: GlobalAssessmentInput) {
  if (phase.name !== 'global-assessment') return
  try {
    const updated = await setGlobalAssessment(phase.mission.id, input)
    setPhase({ name: 'setting-origin', mission: updated })
  } catch (err) {
    setPhase({ name: 'error', message: messageOf(err) })
  }
}
```

```tsx
// add a new switch case, alongside the existing ones:
import { GlobalAssessmentForm } from '../components/GlobalAssessmentForm'

    case 'global-assessment':
      return <GlobalAssessmentForm onSaved={handleGlobalAssessmentSaved} />
```

- [ ] **Step 6: Write a failing test for the new phase**

```typescript
// append to src/pages/MissionWorkspace.test.tsx
vi.mock('../components/GlobalAssessmentForm', () => ({
  GlobalAssessmentForm: ({ onSaved }: { onSaved: (i: unknown) => void }) => (
    <button
      onClick={() =>
        onSaved({
          causeArchitectural: 3, causeElectromagnetique: 6, causeGeobiologique: 8,
          causeParanormale: 1, causeAutres: 0, bovisRate: 9500,
        })
      }
    >
      simulate-global-assessment
    </button>
  ),
}))

it('shows the global assessment form after the exterior plan, then proceeds to origin-setting', async () => {
  vi.mocked(plansRepo.createPlan).mockResolvedValue({
    id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
  })
  vi.mocked(missionsRepo.setGlobalAssessment).mockResolvedValue({
    ...missionWithOrigin, originLat: null, originLng: null,
    causeArchitectural: 3, causeElectromagnetique: 6, causeGeobiologique: 8,
    causeParanormale: 1, causeAutres: 0, bovisRate: 9500,
  })

  render(<MissionWorkspace />)

  fireEvent.click(await screen.findByText('simulate-global-assessment'))

  await waitFor(() =>
    expect(missionsRepo.setGlobalAssessment).toHaveBeenCalledWith('m1', {
      causeArchitectural: 3, causeElectromagnetique: 6, causeGeobiologique: 8,
      causeParanormale: 1, causeAutres: 0, bovisRate: 9500,
    })
  )
  expect(await screen.findByText(/cliquez sur la carte/i)).toBeInTheDocument()
})
```

Also add `vi.mocked(missionsRepo.setGlobalAssessment)` to the file's existing
`vi.mock('../data/missionsRepo')` auto-mock (no factory change needed — auto-mock
already covers any new export).

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/pages/MissionWorkspace.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 8: Run the full suite and type-check**

Run: `npx vitest run && npx tsc -b --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 9: Manually verify in the browser**

Run: `npm run dev`. Create a mission, wait for the exterior plan, move the 6 sliders,
click "Enregistrer les mesures globales".
Expected: no crash; the origin-setting prompt appears next; in Supabase, the
mission row has all 6 fields populated.

- [ ] **Step 10: Commit**

```bash
git add src/components/GlobalAssessmentForm.tsx src/components/GlobalAssessmentForm.test.tsx src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "Add GlobalAssessmentForm and wire it as a MissionWorkspace phase"
```

---

**Chunk 6 exit criteria:** `npx vitest run` and `npx tsc -b --noEmit` both pass.
Right after creating a mission and its exterior plan, Laurent rates the 5 nuisance
causes (0-10) and the Bovis vibratory rate (0-180 000) via sliders, saved to the
mission before moving on to origin-setting and grid work (Chunk 7).

---

## Chunk 7: Field-sensing foundation — polarity anchor fix, "ressenti" layer, compass guide

**Why this chunk exists, and why it precedes grid rendering/editing (now Chunk 8):**
Laurent clarified a methodologically critical point after Chunk 5/6 were written:
**the theoretical grid must never be visible while he's doing blind field sensing**
— seeing pre-drawn lines while trying to feel a network's actual position creates
confirmation bias (he'd unconsciously place his felt points to match what he sees,
rather than reporting what he actually senses). The theoretical grid is toggled on
**afterward**, manually, purely as a comparison/calibration aid — and calibration
means fitting the theoretical lines onto his recorded felt data, never the reverse.

This chunk builds the foundation that Chunk 8 (grid rendering/layers/editing) will
render and let him toggle: the felt-point data model, the polarity-anchor fix
(a real bug in already-committed Chunk 5 code), the compass/guide-line field tool,
and the cadastral parcel base map. None of this renders a theoretical grid line yet
— that's deliberately Chunk 8's job, once the "what shows by default" question
(this chunk) is settled first.

### Task 25: Fix polarity anchor — reference line, not a hardcoded parity

**The bug:** `generateTheoreticalLines` (Chunk 2, hardened in Chunk 5's Tasks 21-22)
currently assigns `polarity: k % 2 === 0 ? '+' : '-'` unconditionally — line index
`k=0` is always `'+'`. But Laurent's actual field process is the reverse: **he
senses which polarity a specific line actually has, and the software should
extrapolate the rest from that anchor** — the assignment can't be hardcoded, because
which physical line is "+" isn't a universal constant, it's discovered per-mission
by feel.

**Files:**
- Modify: `src/geometry/gridGeneration.ts` + `.test.ts` (add an `originPolarity` parameter)
- Modify: `src/domain/createGridForPlan.ts` + `.test.ts` (thread `originPolarity` through)

**Blast radius:** every existing call to `generateTheoreticalLines` needs the new
parameter added:
- `src/geometry/gridGeneration.test.ts` — all 4 existing test calls (2 from Chunk 2
  Task 5, 1 from Chunk 5 Task 21's polarity test, 1 from Task 22's vibratory-base
  test) need `'+'` passed as the new argument, chosen so none of their existing
  polarity assertions change (since `'+'` is what the old hardcoded behavior already
  produced for even `k` — passing `'+'` keeps every prior assertion valid unchanged).
- `src/domain/createGridForPlan.test.ts` — both existing tests' calls to
  `createGridForPlan(...)` need an `originPolarity` argument added.

- [ ] **Step 1: Write a failing test for a flipped anchor**

```typescript
// append to src/geometry/gridGeneration.test.ts, inside describe('generateTheoreticalLines')
// First, update the 4 existing calls in this file to pass '+' as the new 4th
// positional argument (or named field, per Step 3's exact signature) — this keeps
// every existing assertion in this file valid since '+' reproduces the old
// hardcoded k%2===0 behavior for the central/even lines.

it('flips the whole alternation when originPolarity is "-" instead of "+"', () => {
  const template = { spacingXM: 2, spacingYM: 2.5, angleTrueNorthDeg: 0, vibratoryBase: 7 }
  const origin = { x: 0, y: 0 }
  const bounds = { minX: -3, maxX: 3, minY: -3, maxY: 3 }

  const lines = generateTheoreticalLines(template, origin, bounds, '-')
  const axisA = lines.filter((l) => l.family === 'axis-a')
  const central = axisA.find((l) => Math.abs(l.points[0].x) < 1e-9)! // k=0
  const nextOver = axisA.find((l) => Math.abs(l.points[0].x - 2.5) < 1e-9)! // k=1

  expect(central.polarity).toBe('-') // k=0 now takes the anchor's polarity
  expect(nextOver.polarity).toBe('+') // k=1 is the opposite
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/geometry/gridGeneration.test.ts`
Expected: FAIL — `generateTheoreticalLines` doesn't accept a 4th argument yet (or,
depending on how TS/esbuild handles the extra arg, the test's `central.polarity`
assertion fails because polarity is still hardcoded)

- [ ] **Step 3: Add the `originPolarity` parameter**

```typescript
// src/geometry/gridGeneration.ts — modify generateTheoreticalLines' signature and both loops
export function generateTheoreticalLines(
  template: Pick<GridTemplate, 'spacingXM' | 'spacingYM' | 'angleTrueNorthDeg' | 'vibratoryBase'>,
  origin: Point,
  bounds: BoundingBox,
  /**
   * The polarity Laurent actually sensed on the k=0 (central/origin) line in the
   * field — NOT a universal constant. Every other line's polarity is extrapolated
   * from this single anchor by alternation (§6.2's "j'indique la polarité d'une
   * ligne et le logiciel extrapole les autres").
   */
  originPolarity: '+' | '-'
): GeneratedLine[] {
  const primaryDir = bearingUnitVector(template.angleTrueNorthDeg)
  const perpDir = bearingUnitVector(template.angleTrueNorthDeg + 90)
  const lines: GeneratedLine[] = []

  function polarityForIndex(k: number): '+' | '-' {
    const isEvenK = k % 2 === 0
    if (isEvenK) return originPolarity
    return originPolarity === '+' ? '-' : '+'
  }

  const offsetA = maxOffsetIndexNeeded(origin, template.spacingYM, bounds)
  for (let k = -offsetA; k <= offsetA; k++) {
    const linePoint: Point = {
      x: origin.x + k * template.spacingYM * perpDir.x,
      y: origin.y + k * template.spacingYM * perpDir.y,
    }
    const clipped = clipLineToBounds(linePoint, primaryDir, bounds)
    if (clipped) {
      lines.push({
        family: 'axis-a',
        polarity: polarityForIndex(k),
        reinforced: k % template.vibratoryBase === 0,
        points: clipped,
      })
    }
  }

  const offsetB = maxOffsetIndexNeeded(origin, template.spacingXM, bounds)
  for (let k = -offsetB; k <= offsetB; k++) {
    const linePoint: Point = {
      x: origin.x + k * template.spacingXM * primaryDir.x,
      y: origin.y + k * template.spacingXM * primaryDir.y,
    }
    const clipped = clipLineToBounds(linePoint, perpDir, bounds)
    if (clipped) {
      lines.push({
        family: 'axis-b',
        polarity: polarityForIndex(k),
        reinforced: k % template.vibratoryBase === 0,
        points: clipped,
      })
    }
  }

  return lines
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/geometry/gridGeneration.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Thread `originPolarity` through `createGridForPlan`**

```typescript
// src/domain/createGridForPlan.ts — add a parameter and pass it through
export async function createGridForPlan(
  planId: string,
  template: GridTemplate,
  originClicked: Point,
  originPolarity: '+' | '-',
  radiusM: number = DEFAULT_GRID_RADIUS_M
) {
  const origin: Point = {
    x: originClicked.x + template.originOffsetX,
    y: originClicked.y + template.originOffsetY,
  }

  const bounds: BoundingBox = {
    minX: origin.x - radiusM,
    maxX: origin.x + radiusM,
    minY: origin.y - radiusM,
    maxY: origin.y + radiusM,
  }
  const generated = generateTheoreticalLines(template, origin, bounds, originPolarity)

  const instance = await createGridInstance({
    planId,
    templateSnapshot: template,
    originX: origin.x,
    originY: origin.y,
  })
  const lines = await createGridLines(
    generated.map((l) => ({
      gridInstanceId: instance.id,
      family: l.family,
      polarity: l.polarity,
      reinforced: l.reinforced,
      theoreticalPoints: l.points,
    }))
  )

  return { instance, lines }
}
```

Update both existing tests in `createGridForPlan.test.ts` to pass `'+'` as the new
`originPolarity` argument (fourth positional argument, before `radiusM`'s default) —
this reproduces the previous behavior exactly, so no other assertion in either test
needs to change.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/domain/createGridForPlan.test.ts && npx tsc -b --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/geometry/gridGeneration.ts src/geometry/gridGeneration.test.ts src/domain/createGridForPlan.ts src/domain/createGridForPlan.test.ts
git commit -m "Fix polarity: anchor from a Laurent-sensed reference line, not a hardcoded parity"
```

---

### Task 26: `FeltPoint` — the "ressenti terrain" data layer

**What this is:** a point Laurent taps on the map **while actively searching for a
named network** (Hartmann, Curry, ...), recorded with zero reference to any
theoretical grid. This is the raw ground truth that Chunk 8's grid calibration will
later fit theoretical lines onto. It is deliberately a separate, simpler concept than
`GridLine`: no template, no theoretical/adjusted distinction, just "at this point, I
felt network X." Map rendering/placement UI for this is Chunk 8's job (alongside the
rest of the map's layer system) — this task is the data layer only.

**Files:**
- Create: `supabase/migrations/0009_felt_point.sql`
- Modify: `src/domain/types.ts` (add `FeltPoint`)
- Create: `src/data/feltPointsRepo.ts`
- Test: `src/data/feltPointsRepo.test.ts`

- [ ] **Step 1: Migration**

```sql
-- supabase/migrations/0009_felt_point.sql
create table felt_point (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plan(id) on delete cascade,
  network_name text not null,
  x double precision not null,
  y double precision not null,
  created_at timestamptz not null default now()
);
create index felt_point_plan_id_idx on felt_point(plan_id);
```

- [ ] **Step 2: Apply it**

Run: `npx supabase db push`

- [ ] **Step 3: Add the `FeltPoint` type**

```typescript
// src/domain/types.ts — add
export interface FeltPoint {
  id: string
  planId: string
  /** Free text, not a foreign key to GridTemplate — Laurent may search for a
   * network before its GridTemplate row exists, or use a name not yet templated. */
  networkName: string
  x: number
  y: number
  createdAt: string
}
```

- [ ] **Step 4: Write failing tests for `feltPointsRepo`**

```typescript
// src/data/feltPointsRepo.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFeltPoint, listFeltPointsForPlan } from './feltPointsRepo'
import { supabase } from '../lib/supabaseClient'
import { createSupabaseChainMock } from '../test/supabaseMock'

vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))

describe('feltPointsRepo', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a felt point', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: {
        id: 'fp1', plan_id: 'p1', network_name: 'Hartmann',
        x: 1.2, y: -3.4, created_at: '2026-07-16T10:00:00Z',
      },
      error: null,
    })
    vi.mocked(supabase).from = from

    const point = await createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 1.2, y: -3.4 })

    expect(from).toHaveBeenCalledWith('felt_point')
    expect(chain.insert).toHaveBeenCalledWith({
      plan_id: 'p1', network_name: 'Hartmann', x: 1.2, y: -3.4,
    })
    expect(point.networkName).toBe('Hartmann')
  })

  it('throws a descriptive French error when creation fails', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from

    await expect(
      createFeltPoint({ planId: 'p1', networkName: 'Hartmann', x: 0, y: 0 })
    ).rejects.toThrow("Impossible d'enregistrer le point ressenti : network down")
  })

  it('lists felt points scoped to a plan', async () => {
    const { from, chain } = createSupabaseChainMock({
      data: [
        { id: 'fp1', plan_id: 'p1', network_name: 'Hartmann', x: 0, y: 0, created_at: '2026-07-16T10:00:00Z' },
        { id: 'fp2', plan_id: 'p1', network_name: 'Curry', x: 1, y: 1, created_at: '2026-07-16T10:05:00Z' },
      ],
      error: null,
    })
    vi.mocked(supabase).from = from

    const points = await listFeltPointsForPlan('p1')

    expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
    expect(points).toHaveLength(2)
    expect(points.map((p) => p.networkName)).toEqual(['Hartmann', 'Curry'])
  })
})
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx vitest run src/data/feltPointsRepo.test.ts`
Expected: FAIL — `Cannot find module './feltPointsRepo'`

- [ ] **Step 6: Implement `feltPointsRepo`**

```typescript
// src/data/feltPointsRepo.ts
import { supabase } from '../lib/supabaseClient'
import type { FeltPoint } from '../domain/types'

export interface CreateFeltPointInput {
  planId: string
  networkName: string
  x: number
  y: number
}

interface FeltPointRow {
  id: string
  plan_id: string
  network_name: string
  x: number
  y: number
  created_at: string
}

function mapRowToFeltPoint(row: FeltPointRow): FeltPoint {
  return {
    id: row.id,
    planId: row.plan_id,
    networkName: row.network_name,
    x: row.x,
    y: row.y,
    createdAt: row.created_at,
  }
}

export async function createFeltPoint(input: CreateFeltPointInput): Promise<FeltPoint> {
  const { data, error } = await supabase
    .from('felt_point')
    .insert({ plan_id: input.planId, network_name: input.networkName, x: input.x, y: input.y })
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer le point ressenti : ${error.message}`)
  return mapRowToFeltPoint(data as FeltPointRow)
}

export async function listFeltPointsForPlan(planId: string): Promise<FeltPoint[]> {
  const { data, error } = await supabase.from('felt_point').select().eq('plan_id', planId)

  if (error) throw new Error(`Impossible de charger les points ressentis : ${error.message}`)
  return (data as FeltPointRow[]).map(mapRowToFeltPoint)
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/data/feltPointsRepo.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0009_felt_point.sql src/domain/types.ts src/data/feltPointsRepo.ts src/data/feltPointsRepo.test.ts
git commit -m "Add FeltPoint: raw field-sensing data layer, independent of any theoretical grid"
```

---

### Task 27: Cadastral parcel lookup + selection ("la base c'est d'avoir un fond de carte propre avec la délimitation du terrain")

**⚠️ External API uncertainty, same treatment as the IGN WMTS orthophoto URL
(Chunk 3, Task 9) and Leaflet.DistortableImage (Chunk 4):** neither of us can browse
IGN's current WFS documentation live. The endpoint, `TYPENAME`, and GeoJSON property
names below (`numero`, `section`) are a best-effort guess at IGN Géoplateforme's
cadastre WFS shape, **not confirmed**. Isolate this uncertainty in one small module
(`cadastreService.ts`) so it's a single place to fix if wrong — the parsing logic
itself is fully tested against a controlled, hand-written GeoJSON fixture, so that
part is verified regardless of whether the live endpoint details are exactly right.

**Files:**
- Create: `src/data/cadastreService.ts`
- Test: `src/data/cadastreService.test.ts`
- Create: `supabase/migrations/0010_mission_parcel_refs.sql`
- Modify: `src/domain/types.ts` (add `Mission.parcelRefs`)
- Modify: `src/data/missionsRepo.ts` + `.test.ts` (add `setSelectedParcels`)

**Blast radius:** `parcelRefs` is a new nullable-by-default (empty array) field on
`Mission` — following Chunk 6's precedent, add `parcelRefs: []` to every existing
`Mission` fixture across the plan (`missionsRepo.test.ts`, `MissionForm.test.tsx`,
`MissionWorkspace.test.tsx`'s `missionWithOrigin` and inline `MissionForm` mock).

- [ ] **Step 1: Write failing tests for parcel parsing**

```typescript
// src/data/cadastreService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchParcelsInBounds } from './cadastreService'

const sampleGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { numero: '1167', section: 'AB' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.35, 48.85],
            [2.351, 48.85],
            [2.351, 48.851],
            [2.35, 48.851],
            [2.35, 48.85],
          ],
        ],
      },
    },
  ],
}

describe('fetchParcelsInBounds', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('parses parcel features into id/section/ringsLatLng', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleGeoJson),
    } as Response)

    const parcels = await fetchParcelsInBounds({ minLat: 48.85, maxLat: 48.86, minLng: 2.35, maxLng: 2.36 })

    expect(parcels).toHaveLength(1)
    expect(parcels[0].id).toBe('1167')
    expect(parcels[0].section).toBe('AB')
    expect(parcels[0].ringsLatLng[0][0]).toEqual({ lat: 48.85, lng: 2.35 })
  })

  it('throws a descriptive French error when the request fails', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    await expect(
      fetchParcelsInBounds({ minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 })
    ).rejects.toThrow('Impossible de charger les parcelles cadastrales : 500')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/cadastreService.test.ts`
Expected: FAIL — `Cannot find module './cadastreService'`

- [ ] **Step 3: Implement `cadastreService`**

```typescript
// src/data/cadastreService.ts
import type { LatLng } from '../geometry/localCoordinates'

export interface CadastralParcel {
  id: string
  section: string
  ringsLatLng: LatLng[][]
}

export interface LatLngBounds {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

// ⚠️ VERIFY against https://geoservices.ign.fr/documentation/donnees/vecteur/cadastre
// before relying on this — endpoint, TYPENAME, and property names are a best-effort
// guess, not confirmed against live IGN Géoplateforme docs.
const CADASTRE_WFS_URL = 'https://data.geopf.fr/wfs/ows'
const PARCEL_TYPE_NAME = 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle'

function parseParcelFeature(feature: {
  properties?: Record<string, unknown>
  geometry: { coordinates: number[][][] }
}): CadastralParcel {
  const props = feature.properties ?? {}
  const ringsLatLng: LatLng[][] = feature.geometry.coordinates.map((ring) =>
    ring.map(([lng, lat]) => ({ lat, lng }))
  )
  return {
    id: String(props.numero ?? 'inconnu'),
    section: String(props.section ?? ''),
    ringsLatLng,
  }
}

export async function fetchParcelsInBounds(bounds: LatLngBounds): Promise<CadastralParcel[]> {
  const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat},EPSG:4326`
  const url =
    `${CADASTRE_WFS_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature` +
    `&TYPENAME=${PARCEL_TYPE_NAME}&OUTPUTFORMAT=application/json&BBOX=${bbox}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Impossible de charger les parcelles cadastrales : ${response.status}`)
  }
  const geojson = (await response.json()) as {
    features: Array<{ properties?: Record<string, unknown>; geometry: { coordinates: number[][][] } }>
  }
  return geojson.features.map(parseParcelFeature)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/data/cadastreService.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Migration + type + repo for selected parcels**

```sql
-- supabase/migrations/0010_mission_parcel_refs.sql
alter table mission add column parcel_refs text[] not null default '{}';
```

```typescript
// src/domain/types.ts — modify Mission
export interface Mission {
  // ...existing fields...
  parcelRefs: string[]
}
```

Add `parcelRefs: []` to every existing `Mission` fixture in `missionsRepo.test.ts`,
`MissionForm.test.tsx`, and `MissionWorkspace.test.tsx` (both the inline
`MissionForm` mock and `missionWithOrigin`), and `parcel_refs: []` to every
`MissionRow`-shaped DB row literal in `missionsRepo.test.ts`.

```typescript
// src/data/missionsRepo.ts — modify MissionRow/mapRowToMission, add:
export async function setSelectedParcels(missionId: string, parcelRefs: string[]): Promise<Mission> {
  const { data, error } = await supabase
    .from('mission')
    .update({ parcel_refs: parcelRefs })
    .eq('id', missionId)
    .select()
    .single()

  if (error) throw new Error(`Impossible d'enregistrer les parcelles sélectionnées : ${error.message}`)
  return mapRowToMission(data as MissionRow)
}
```

- [ ] **Step 6: Write a failing test for `setSelectedParcels`, run it, then run it green**

Follow the same pattern as `setMissionOrigin`/`setGlobalAssessment`'s tests
(Chunk 4 Task 13, Chunk 6 Task 23) — mock the `.update().eq().select().single()`
chain, assert `chain.eq` called with `('id', missionId)`, assert the mapped
`parcelRefs` on the returned `Mission`.

Run: `npx vitest run src/data/missionsRepo.test.ts`
Expected: PASS (6 tests — 5 from before + this one)

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc -b --noEmit`

```bash
git add src/data/cadastreService.ts src/data/cadastreService.test.ts supabase/migrations/0010_mission_parcel_refs.sql src/domain/types.ts src/data/missionsRepo.ts src/data/missionsRepo.test.ts src/components/MissionForm.test.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "Add cadastral parcel lookup (WFS) and mission parcel selection"
```

---

**Chunk 7 exit criteria:** `npx vitest run` and `npx tsc -b --noEmit` both pass. The
polarity bug is fixed (anchored on a sensed reference line). `FeltPoint` and cadastral
parcel data layers exist and are tested, ready for Chunk 8 to render on the map.

**Note on chunk count:** what was originally sketched as a single "Chunk 7" (map
foundation + rendering + layers + editing + orthogonality) turned out too large once
Laurent's field-workflow clarifications were incorporated — it's now split into this
chunk (data foundations, no rendering) plus **Chunk 8** (map rendering + layer
panel) and **Chunk 9** (compass/guide-line tool + interactive editing + orthogonality
assist UI), keeping each chunk within the plan's established size range. The
previously-numbered "Chunk 8" (pathogenic crossing detection) and "Chunk 9"
(FreeformNetwork + phenomena + QA) shift to **Chunk 10** and **Chunk 11**.

---

## Chunk 8: Map rendering — grid lines, felt points, layer panel

**Renders what Chunk 7 built, read-only for now** — no dragging/editing yet
(Chunk 9). The one behavior that matters methodologically: **`FeltPoint`s are
visible by default; every theoretical `GridInstance` layer starts hidden**, toggled
on only by an explicit action in the layer panel.

### Task 28: `listGridInstancesForPlan` / `listGridLinesForInstance` + rendering layers

**Files:**
- Modify: `src/data/gridInstancesRepo.ts` + `.test.ts` (add `listGridInstancesForPlan`)
- Modify: `src/data/gridLinesRepo.ts` + `.test.ts` (add `listGridLinesForInstance`)
- Create: `src/components/NetworkLinesLayer.tsx`
- Test: `src/components/NetworkLinesLayer.test.tsx`
- Create: `src/components/FeltPointsLayer.tsx`
- Test: `src/components/FeltPointsLayer.test.tsx`

- [ ] **Step 1: Write failing tests for the two list functions**

```typescript
// append to src/data/gridInstancesRepo.test.ts
it('lists grid instances scoped to a plan', async () => {
  const { from, chain } = createSupabaseChainMock({
    data: [{ id: 'gi1', plan_id: 'p1', template_snapshot: hartmann, origin_x: 0, origin_y: 0 }],
    error: null,
  })
  vi.mocked(supabase).from = from

  const instances = await listGridInstancesForPlan('p1')

  expect(chain.eq).toHaveBeenCalledWith('plan_id', 'p1')
  expect(instances).toHaveLength(1)
})
```

```typescript
// append to src/data/gridLinesRepo.test.ts
it('lists grid lines scoped to a grid instance', async () => {
  const { from, chain } = createSupabaseChainMock({
    data: [
      {
        id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
        theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
        adjusted_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      },
    ],
    error: null,
  })
  vi.mocked(supabase).from = from

  const lines = await listGridLinesForInstance('gi1')

  expect(chain.eq).toHaveBeenCalledWith('grid_instance_id', 'gi1')
  expect(lines).toHaveLength(1)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/gridInstancesRepo.test.ts src/data/gridLinesRepo.test.ts`
Expected: FAIL — the two new functions don't exist yet

- [ ] **Step 3: Implement the two list functions**

```typescript
// src/data/gridInstancesRepo.ts — add
export async function listGridInstancesForPlan(planId: string): Promise<GridInstance[]> {
  const { data, error } = await supabase.from('grid_instance').select().eq('plan_id', planId)
  if (error) throw new Error(`Impossible de charger les instances de grille : ${error.message}`)
  return (data as GridInstanceRow[]).map(mapRowToGridInstance)
}
```

```typescript
// src/data/gridLinesRepo.ts — add
export async function listGridLinesForInstance(gridInstanceId: string): Promise<GridLine[]> {
  const { data, error } = await supabase.from('grid_line').select().eq('grid_instance_id', gridInstanceId)
  if (error) throw new Error(`Impossible de charger les lignes de grille : ${error.message}`)
  return (data as GridLineRow[]).map(mapRowToGridLine)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/data/gridInstancesRepo.test.ts src/data/gridLinesRepo.test.ts`
Expected: PASS (2 tests in each file)

- [ ] **Step 5: Write failing tests for `NetworkLinesLayer`**

```tsx
// src/components/NetworkLinesLayer.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { NetworkLinesLayer } from './NetworkLinesLayer'
import type { GridLine } from '../domain/types'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }

const lines: GridLine[] = [
  {
    id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a', polarity: '+', reinforced: true,
    theoreticalPoints: [{ x: 0, y: -10 }, { x: 0, y: 10 }],
    adjustedPoints: [{ x: 0, y: -10 }, { x: 0, y: 10 }],
  },
  {
    id: 'gl2', gridInstanceId: 'gi1', family: 'axis-a', polarity: '-', reinforced: false,
    theoreticalPoints: [{ x: 2.5, y: -10 }, { x: 2.5, y: 10 }],
    adjustedPoints: [{ x: 2.5, y: -10 }, { x: 2.5, y: 10 }],
  },
]

describe('NetworkLinesLayer', () => {
  it('renders one polyline per line, styled by polarity and reinforced state', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <NetworkLinesLayer lines={lines} templateSnapshot={{ color: '#d32f2f' }} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const paths = container.querySelectorAll('path.leaflet-interactive')
    expect(paths).toHaveLength(2)
    // gl1: polarity '+' (solid, no dashArray), reinforced (thicker stroke)
    expect(paths[0].getAttribute('stroke')).toBe('#d32f2f')
    expect(paths[0].getAttribute('stroke-width')).toBe('4')
    expect(paths[0].hasAttribute('stroke-dasharray')).toBe(false)
    // gl2: polarity '-' (dashed), not reinforced (thinner stroke)
    expect(paths[1].getAttribute('stroke-width')).toBe('2')
    expect(paths[1].getAttribute('stroke-dasharray')).toBe('6, 4')
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <NetworkLinesLayer lines={lines} templateSnapshot={{ color: '#d32f2f' }} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/components/NetworkLinesLayer.test.tsx`
Expected: FAIL — `Cannot find module './NetworkLinesLayer'`

- [ ] **Step 7: Implement `NetworkLinesLayer`**

```tsx
// src/components/NetworkLinesLayer.tsx
import { Polyline } from 'react-leaflet'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { GridLine, GridTemplate } from '../domain/types'

export interface NetworkLinesLayerProps {
  lines: GridLine[]
  templateSnapshot: Pick<GridTemplate, 'color'>
  missionOrigin: LatLng
  visible: boolean
}

export function NetworkLinesLayer({ lines, templateSnapshot, missionOrigin, visible }: NetworkLinesLayerProps) {
  if (!visible) return null

  return (
    <>
      {lines.map((line) => (
        <Polyline
          key={line.id}
          positions={line.adjustedPoints.map((p) => {
            const latlng = localToLatLng(p, missionOrigin)
            return [latlng.lat, latlng.lng] as [number, number]
          })}
          pathOptions={{
            color: templateSnapshot.color,
            dashArray: line.polarity === '-' ? '6, 4' : undefined,
            weight: line.reinforced ? 4 : 2,
          }}
        />
      ))}
    </>
  )
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/components/NetworkLinesLayer.test.tsx`
Expected: PASS (2 tests)

If Leaflet/jsdom friction shows up here (same category anticipated since Chunk 3
Task 9 — `MapContainer` needing a non-zero layout box to render `Polyline` paths):
apply the same `src/test/setup.ts` fallback referenced there, don't treat it as a
logic bug in `NetworkLinesLayer`.

- [ ] **Step 9: Write failing tests for `FeltPointsLayer`**

```tsx
// src/components/FeltPointsLayer.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { FeltPointsLayer } from './FeltPointsLayer'
import type { FeltPoint } from '../domain/types'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }
const points: FeltPoint[] = [
  { id: 'fp1', planId: 'p1', networkName: 'Hartmann', x: 1, y: 1, createdAt: '2026-07-16T10:00:00Z' },
  { id: 'fp2', planId: 'p1', networkName: 'Curry', x: -1, y: -1, createdAt: '2026-07-16T10:01:00Z' },
]

describe('FeltPointsLayer', () => {
  it('renders one marker per point, colored by its network', () => {
    const colorForNetwork = (name: string) => (name === 'Hartmann' ? '#d32f2f' : '#f2c230')
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltPointsLayer points={points} colorForNetwork={colorForNetwork} missionOrigin={missionOrigin} visible />
      </MapContainer>
    )
    const markers = container.querySelectorAll('path.leaflet-interactive')
    expect(markers).toHaveLength(2)
    expect(markers[0].getAttribute('stroke')).toBe('#d32f2f')
    expect(markers[1].getAttribute('stroke')).toBe('#f2c230')
  })

  it('renders nothing when visible is false', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <FeltPointsLayer points={points} colorForNetwork={() => '#000'} missionOrigin={missionOrigin} visible={false} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `npx vitest run src/components/FeltPointsLayer.test.tsx`
Expected: FAIL — `Cannot find module './FeltPointsLayer'`

- [ ] **Step 11: Implement `FeltPointsLayer`**

```tsx
// src/components/FeltPointsLayer.tsx
import { CircleMarker } from 'react-leaflet'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { FeltPoint } from '../domain/types'

export interface FeltPointsLayerProps {
  points: FeltPoint[]
  colorForNetwork: (networkName: string) => string
  missionOrigin: LatLng
  visible: boolean
}

export function FeltPointsLayer({ points, colorForNetwork, missionOrigin, visible }: FeltPointsLayerProps) {
  if (!visible) return null

  return (
    <>
      {points.map((point) => {
        const latlng = localToLatLng(point, missionOrigin)
        return (
          <CircleMarker
            key={point.id}
            center={[latlng.lat, latlng.lng]}
            radius={5}
            pathOptions={{ color: colorForNetwork(point.networkName), fillOpacity: 0.9 }}
          />
        )
      })}
    </>
  )
}
```

- [ ] **Step 12: Run tests to verify they pass, then type-check**

Run: `npx vitest run src/components/FeltPointsLayer.test.tsx && npx tsc -b --noEmit`
Expected: PASS (2 tests); no type errors.

- [ ] **Step 13: Commit**

```bash
git add src/data/gridInstancesRepo.ts src/data/gridInstancesRepo.test.ts src/data/gridLinesRepo.ts src/data/gridLinesRepo.test.ts src/components/NetworkLinesLayer.tsx src/components/NetworkLinesLayer.test.tsx src/components/FeltPointsLayer.tsx src/components/FeltPointsLayer.test.tsx
git commit -m "Add list repo functions and read-only map rendering for grid lines and felt points"
```

---

### Task 29: `LayerPanel` + `SiteMapView` composition, wired into `MissionWorkspace`

**Files:**
- Modify: `src/components/MapView.tsx` + `.test.tsx` (accept `children`, so layer
  components can be nested inside the `MapContainer` they need for react-leaflet's
  map context)
- Create: `src/components/LayerPanel.tsx`
- Test: `src/components/LayerPanel.test.tsx`
- Create: `src/components/SiteMapView.tsx`
- Test: `src/components/SiteMapView.test.tsx`
- Modify: `src/pages/MissionWorkspace.tsx` + `.test.tsx` (replace the bare `<MapView
  center={...} />` in the `ready-no-interior` phase with `<SiteMapView ... />`)

- [ ] **Step 1: Write a failing test for `MapView` accepting children**

```typescript
// append to src/components/MapView.test.tsx
it('renders children inside the map container', () => {
  render(
    <MapView center={[48.8566, 2.3522]}>
      <div data-testid="child-layer" />
    </MapView>
  )
  expect(screen.getByTestId('child-layer')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/MapView.test.tsx`
Expected: FAIL — `MapView` doesn't accept/render `children` yet

- [ ] **Step 3: Add `children` support to `MapView`**

```tsx
// src/components/MapView.tsx — modify MapViewProps and the component
import type { ReactNode } from 'react'

export interface MapViewProps {
  center: [number, number]
  zoom?: number
  onMapClick?: (latlng: { lat: number; lng: number }) => void
  children?: ReactNode
}

export function MapView({ center, zoom = 18, onMapClick, children }: MapViewProps) {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
      <TileLayer url={IGN_ORTHOPHOTO_WMTS_URL} attribution="&copy; IGN-F/Géoportail" maxZoom={20} />
      {onMapClick && <ClickHandler onMapClick={onMapClick} />}
      {children}
    </MapContainer>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/MapView.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Write failing tests for `LayerPanel`**

```tsx
// src/components/LayerPanel.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LayerPanel } from './LayerPanel'

describe('LayerPanel', () => {
  it('shows "Ressenti terrain" checked by default, grid layers unchecked by default', () => {
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Ressenti terrain')).toBeChecked()
    expect(screen.getByLabelText('Hartmann')).not.toBeChecked()
  })

  it('respects explicit visibility overrides', () => {
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{ 'felt-points': false, gi1: true }}
        onToggle={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Ressenti terrain')).not.toBeChecked()
    expect(screen.getByLabelText('Hartmann')).toBeChecked()
  })

  it('calls onToggle with the layer id when a checkbox is clicked', () => {
    const onToggle = vi.fn()
    render(
      <LayerPanel
        gridLayers={[{ id: 'gi1', label: 'Hartmann', color: '#d32f2f' }]}
        visibility={{}}
        onToggle={onToggle}
      />
    )
    fireEvent.click(screen.getByLabelText('Hartmann'))
    expect(onToggle).toHaveBeenCalledWith('gi1')
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/components/LayerPanel.test.tsx`
Expected: FAIL — `Cannot find module './LayerPanel'`

- [ ] **Step 7: Implement `LayerPanel`**

```tsx
// src/components/LayerPanel.tsx
export const FELT_POINTS_LAYER_ID = 'felt-points'

export interface LayerEntry {
  id: string
  label: string
  color: string
}

export interface LayerPanelProps {
  gridLayers: LayerEntry[]
  visibility: Record<string, boolean>
  onToggle: (id: string) => void
}

export function LayerPanel({ gridLayers, visibility, onToggle }: LayerPanelProps) {
  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={visibility[FELT_POINTS_LAYER_ID] ?? true}
          onChange={() => onToggle(FELT_POINTS_LAYER_ID)}
        />
        Ressenti terrain
      </label>
      {gridLayers.map((layer) => (
        <label key={layer.id}>
          <input
            type="checkbox"
            checked={visibility[layer.id] ?? false}
            onChange={() => onToggle(layer.id)}
          />
          <span style={{ color: layer.color }}>{layer.label}</span>
        </label>
      ))}
    </div>
  )
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/components/LayerPanel.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 9: Write failing tests for `SiteMapView`**

```tsx
// src/components/SiteMapView.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SiteMapView } from './SiteMapView'
import * as gridInstancesRepo from '../data/gridInstancesRepo'
import * as gridLinesRepo from '../data/gridLinesRepo'
import * as feltPointsRepo from '../data/feltPointsRepo'

vi.mock('../data/gridInstancesRepo')
vi.mock('../data/gridLinesRepo')
vi.mock('../data/feltPointsRepo')

vi.mock('./MapView', () => ({
  MapView: ({ children }: { children?: React.ReactNode }) => <div data-testid="map-view">{children}</div>,
}))
vi.mock('./NetworkLinesLayer', () => ({
  NetworkLinesLayer: ({ visible, templateSnapshot }: { visible: boolean; templateSnapshot: { name?: string } }) =>
    visible ? <div data-testid={`lines-${templateSnapshot.name ?? 'unknown'}`} /> : null,
}))
vi.mock('./FeltPointsLayer', () => ({
  FeltPointsLayer: ({ visible }: { visible: boolean }) => (visible ? <div data-testid="felt-points" /> : null),
}))

const hartmannInstance = {
  id: 'gi1', planId: 'p1',
  templateSnapshot: { id: 't0', name: 'Hartmann', spacingXM: 2, spacingYM: 2.5, angleTrueNorthDeg: 0, originOffsetX: 0, originOffsetY: 0, color: '#d32f2f', vibratoryBase: 7 },
  originX: 0, originY: 0,
}

describe('SiteMapView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads instances/lines/felt points, shows felt points by default and grid layers hidden by default', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([hartmannInstance])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)

    expect(await screen.findByTestId('felt-points')).toBeInTheDocument()
    expect(screen.queryByTestId('lines-Hartmann')).not.toBeInTheDocument()
  })

  it('toggling the Hartmann layer in the panel shows its lines', async () => {
    vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([hartmannInstance])
    vi.mocked(gridLinesRepo.listGridLinesForInstance).mockResolvedValue([])
    vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

    render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)

    await screen.findByTestId('felt-points')
    fireEvent.click(await screen.findByLabelText('Hartmann'))

    await waitFor(() => expect(screen.getByTestId('lines-Hartmann')).toBeInTheDocument())
  })
})
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `npx vitest run src/components/SiteMapView.test.tsx`
Expected: FAIL — `Cannot find module './SiteMapView'`

- [ ] **Step 11: Implement `SiteMapView`**

```tsx
// src/components/SiteMapView.tsx
import { useEffect, useState } from 'react'
import { MapView } from './MapView'
import { NetworkLinesLayer } from './NetworkLinesLayer'
import { FeltPointsLayer } from './FeltPointsLayer'
import { LayerPanel, FELT_POINTS_LAYER_ID, type LayerEntry } from './LayerPanel'
import { listGridInstancesForPlan } from '../data/gridInstancesRepo'
import { listGridLinesForInstance } from '../data/gridLinesRepo'
import { listFeltPointsForPlan } from '../data/feltPointsRepo'
import type { GridInstance, GridLine, FeltPoint } from '../domain/types'
import type { LatLng } from '../geometry/localCoordinates'

export interface SiteMapViewProps {
  planId: string
  missionOrigin: LatLng
}

export function SiteMapView({ planId, missionOrigin }: SiteMapViewProps) {
  const [instances, setInstances] = useState<GridInstance[]>([])
  const [linesByInstance, setLinesByInstance] = useState<Record<string, GridLine[]>>({})
  const [feltPoints, setFeltPoints] = useState<FeltPoint[]>([])
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [loadedInstances, loadedPoints] = await Promise.all([
          listGridInstancesForPlan(planId),
          listFeltPointsForPlan(planId),
        ])
        setInstances(loadedInstances)
        setFeltPoints(loadedPoints)
        const entries = await Promise.all(
          loadedInstances.map(
            async (instance) => [instance.id, await listGridLinesForInstance(instance.id)] as const
          )
        )
        setLinesByInstance(Object.fromEntries(entries))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
    load()
  }, [planId])

  function toggleLayer(id: string) {
    const currentlyVisible = visibility[id] ?? id === FELT_POINTS_LAYER_ID
    setVisibility((prev) => ({ ...prev, [id]: !currentlyVisible }))
  }

  function colorForNetwork(networkName: string): string {
    const match = instances.find((i) => i.templateSnapshot.name === networkName)
    return match?.templateSnapshot.color ?? '#888888'
  }

  if (error) return <p role="alert">{error}</p>

  const gridLayers: LayerEntry[] = instances.map((instance) => ({
    id: instance.id,
    label: instance.templateSnapshot.name,
    color: instance.templateSnapshot.color,
  }))

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapView center={[missionOrigin.lat, missionOrigin.lng]}>
        <FeltPointsLayer
          points={feltPoints}
          colorForNetwork={colorForNetwork}
          missionOrigin={missionOrigin}
          visible={visibility[FELT_POINTS_LAYER_ID] ?? true}
        />
        {instances.map((instance) => (
          <NetworkLinesLayer
            key={instance.id}
            lines={linesByInstance[instance.id] ?? []}
            templateSnapshot={instance.templateSnapshot}
            missionOrigin={missionOrigin}
            visible={visibility[instance.id] ?? false}
          />
        ))}
      </MapView>
      <LayerPanel gridLayers={gridLayers} visibility={visibility} onToggle={toggleLayer} />
    </div>
  )
}
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `npx vitest run src/components/SiteMapView.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 13: Wire `SiteMapView` into `MissionWorkspace`'s `ready-no-interior` phase**

```tsx
// src/pages/MissionWorkspace.tsx — modify the 'ready-no-interior' case:
import { SiteMapView } from '../components/SiteMapView'

    case 'ready-no-interior': {
      const { originLat, originLng } = phase.mission
      return (
        <div>
          <SiteMapView
            planId={/* the mission's exterior Plan id — see note below */ phase.mission.id}
            missionOrigin={{ lat: originLat!, lng: originLng! }}
          />
          <label>
            Importer un plan intérieur (optionnel)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleInteriorFileChosen(e.target.files[0])}
            />
          </label>
        </div>
      )
    }
```

**⚠️ Gap surfaced while wiring this up:** `SiteMapView` needs a `planId` (the
exterior `Plan`'s id, not the `Mission`'s id) to load grid instances/felt points
scoped to that plan — but `MissionWorkspace`'s `WorkspacePhase` union has never
stored the exterior `Plan` object returned by `createPlan` in Chunk 3's
`handleMissionCreated`; it's created and immediately discarded. Fix this now,
since it's a one-line change with an outsized effect if left for later:

```typescript
// src/pages/MissionWorkspace.tsx — modify WorkspacePhase to carry the exterior plan:
type WorkspacePhase =
  | { name: 'creating-mission' }
  | { name: 'creating-exterior-plan'; mission: Mission }
  | { name: 'global-assessment'; mission: Mission; exteriorPlan: Plan }
  | { name: 'setting-origin'; mission: Mission; exteriorPlan: Plan }
  | { name: 'ready-no-interior'; mission: Mission; exteriorPlan: Plan }
  | { name: 'calibrating-interior'; mission: Mission; exteriorPlan: Plan; imageUrl: string }
  | { name: 'error'; message: string }
```

```typescript
// modify handleMissionCreated to keep the created Plan:
  async function handleMissionCreated(mission: Mission) {
    setPhase({ name: 'creating-exterior-plan', mission })
    try {
      const exteriorPlan = await createPlan({ missionId: mission.id, kind: 'exterieur' })
      setPhase({ name: 'global-assessment', mission, exteriorPlan })
    } catch (err) {
      setPhase({ name: 'error', message: messageOf(err) })
    }
  }
```

Every other phase transition (`handleGlobalAssessmentSaved`, `handleOriginClick`,
`handleInteriorFileChosen`, `handleInteriorCalibrated`) needs `exteriorPlan:
phase.exteriorPlan` added to the object it passes to the next `setPhase` call, and
the `ready-no-interior` case above becomes:

```tsx
      <SiteMapView planId={phase.exteriorPlan.id} missionOrigin={{ lat: originLat!, lng: originLng! }} />
```

- [ ] **Step 14: Update `MissionWorkspace.test.tsx` for the carried `exteriorPlan`**

Every existing test's `plansRepo.createPlan` mock resolution already returns a full
`Plan` object (`{ id: 'p1', missionId: 'm1', kind: 'exterieur', ... }`) — no mock
value needs to change. Add `vi.mock('./SiteMapView', ...)` (a simple
`<div data-testid="site-map-view" />` stub) alongside the file's other component
mocks. **Both** existing tests that assert `screen.findByTestId('map-view')` while
in the `ready-no-interior` phase need updating to assert `site-map-view` instead:
the origin-setting test ("records the mission origin on map click...") and the
interior-calibration test ("saves an interior Plan once calibration completes...",
which returns to `ready-no-interior` after calibrating) — not just one of them.

- [ ] **Step 15: Run the full suite and type-check**

Run: `npx vitest run && npx tsc -b --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 16: Manually verify in the browser**

Run: `npm run dev`. Walk through: create mission → global assessment → set origin.
Expected: the map shows with a "Ressenti terrain" checkbox already checked (no felt
points yet, so nothing visible) and, once a `GridInstance` exists for this plan
(created programmatically for now — Chunk 9 wires up the UI to trigger this), its
checkbox in the layer panel starts unchecked; checking it reveals the grid lines.

- [ ] **Step 17: Commit**

```bash
git add src/components/MapView.tsx src/components/MapView.test.tsx src/components/LayerPanel.tsx src/components/LayerPanel.test.tsx src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "Add LayerPanel + SiteMapView, wire into MissionWorkspace, carry exteriorPlan through phases"
```

---

**Chunk 8 exit criteria:** `npx vitest run` and `npx tsc -b --noEmit` both pass.
Once a mission reaches the map phase, felt points render by default and every grid
layer starts hidden, toggle-able via the layer panel — the methodological ordering
Laurent required is now structurally enforced (a grid instance simply isn't visible
until someone deliberately checks its box), not just a UI convention to remember.
Interactive editing, the compass/guide-line tool, and the orthogonality assist UI
are Chunk 9.

---

## Chunk 9: Guide-line tool, interactive grid editing, orthogonality assist UI

### Task 30: Guide-line tool (transient directional aid, self-contained in `SiteMapView`)

**What this is:** a gray, dashed, non-persisted reference line Laurent places at his
current position on the map, oriented along a bearing (N/S for Hartmann, 45° for
Curry, or a custom angle) — purely a walking aid while doing blind ressenti search,
never stored as mission data. It lives entirely inside `SiteMapView` (which already
owns the map and isn't juggling a competing `onMapClick` user — origin-setting's
click handler belongs to a different, earlier `WorkspacePhase` and a different
`MapView` instance entirely), so no new prop threading through `MissionWorkspace` is
needed.

**Files:**
- Create: `src/geometry/guideLine.ts`
- Test: `src/geometry/guideLine.test.ts`
- Create: `src/components/GuideLineLayer.tsx` (the actual `Polyline` rendering,
  extracted into its own component — same reason `NetworkLinesLayer` and
  `FeltPointsLayer` are separate components rather than inlined into
  `SiteMapView`: it needs a real `<MapContainer>` to render, and `SiteMapView`'s own
  tests mock `MapView` down to a plain `<div>` with no real Leaflet context, so
  anything rendering a real `Polyline`/`CircleMarker` directly inside
  `SiteMapView`'s JSX would crash in that test file. Mocking `GuideLineLayer` itself
  in `SiteMapView.test.tsx` sidesteps that, exactly as already done for the other
  two layers.)
- Test: `src/components/GuideLineLayer.test.tsx`
- Modify: `src/components/SiteMapView.tsx` + `.test.tsx` (add the guide-line
  controls and click-to-place state; render `<GuideLineLayer>` rather than a raw
  `<Polyline>`)

- [ ] **Step 1: Write failing tests for the pure endpoint math**

```typescript
// src/geometry/guideLine.test.ts
import { describe, it, expect } from 'vitest'
import { computeGuideLineEndpoints } from './guideLine'

describe('computeGuideLineEndpoints', () => {
  it('extends a N/S (0°) line symmetrically through the anchor', () => {
    const [a, b] = computeGuideLineEndpoints({ x: 5, y: 5 }, 0, 60)
    expect(a).toEqual({ x: 5, y: -55 })
    expect(b).toEqual({ x: 5, y: 65 })
  })

  it('extends a 45° line symmetrically through the anchor', () => {
    const [a, b] = computeGuideLineEndpoints({ x: 0, y: 0 }, 45, Math.SQRT2 * 10)
    expect(a.x).toBeCloseTo(-10)
    expect(a.y).toBeCloseTo(-10)
    expect(b.x).toBeCloseTo(10)
    expect(b.y).toBeCloseTo(10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/geometry/guideLine.test.ts`
Expected: FAIL — `Cannot find module './guideLine'`

- [ ] **Step 3: Implement `computeGuideLineEndpoints`**

```typescript
// src/geometry/guideLine.ts
import { bearingUnitVector } from './gridGeneration'
import type { Point } from '../domain/types'

/**
 * A long segment through `anchor` at `bearingDeg`, `halfLengthM` in each
 * direction — enough to look like a line crossing the visible map area for a
 * typical residential-scale mission. Purely a visual walking aid (§Chunk 9
 * intro); never persisted.
 */
export function computeGuideLineEndpoints(
  anchor: Point,
  bearingDeg: number,
  halfLengthM = 60
): [Point, Point] {
  const dir = bearingUnitVector(bearingDeg)
  return [
    { x: anchor.x - dir.x * halfLengthM, y: anchor.y - dir.y * halfLengthM },
    { x: anchor.x + dir.x * halfLengthM, y: anchor.y + dir.y * halfLengthM },
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/geometry/guideLine.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write failing tests for `GuideLineLayer`**

```tsx
// src/components/GuideLineLayer.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { GuideLineLayer } from './GuideLineLayer'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }

describe('GuideLineLayer', () => {
  it('renders a gray dashed line through the anchor when anchor and bearing are set', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <GuideLineLayer anchor={{ x: 0, y: 0 }} bearingDeg={0} missionOrigin={missionOrigin} />
      </MapContainer>
    )
    const path = container.querySelector('path.leaflet-interactive')
    expect(path?.getAttribute('stroke')).toBe('#888888')
    expect(path?.getAttribute('stroke-dasharray')).toBe('4, 6')
  })

  it('renders nothing when anchor is null', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <GuideLineLayer anchor={null} bearingDeg={0} missionOrigin={missionOrigin} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })

  it('renders nothing when bearingDeg is null', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <GuideLineLayer anchor={{ x: 0, y: 0 }} bearingDeg={null} missionOrigin={missionOrigin} />
      </MapContainer>
    )
    expect(container.querySelectorAll('path.leaflet-interactive')).toHaveLength(0)
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/components/GuideLineLayer.test.tsx`
Expected: FAIL — `Cannot find module './GuideLineLayer'`

- [ ] **Step 7: Implement `GuideLineLayer`**

```tsx
// src/components/GuideLineLayer.tsx
import { Polyline } from 'react-leaflet'
import { computeGuideLineEndpoints } from '../geometry/guideLine'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { Point } from '../domain/types'

export interface GuideLineLayerProps {
  anchor: Point | null
  bearingDeg: number | null
  missionOrigin: LatLng
}

export function GuideLineLayer({ anchor, bearingDeg, missionOrigin }: GuideLineLayerProps) {
  if (anchor === null || bearingDeg === null) return null

  return (
    <Polyline
      positions={computeGuideLineEndpoints(anchor, bearingDeg).map((p) => {
        const latlng = localToLatLng(p, missionOrigin)
        return [latlng.lat, latlng.lng] as [number, number]
      })}
      pathOptions={{ color: '#888888', dashArray: '4, 6', weight: 1 }}
    />
  )
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/components/GuideLineLayer.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 9: Write failing tests for the guide-line controls in `SiteMapView`**

```tsx
// append to src/components/SiteMapView.test.tsx

// Extend the file's existing top-of-file MapView mock (do not add a second
// vi.mock('./MapView', ...) call — replace the one already there, since Vitest
// only honors the first mock factory per module per file) to also forward
// onMapClick via a test button, same pattern already used in
// MissionWorkspace.test.tsx (Chunk 4, Task 13):
vi.mock('./MapView', () => ({
  MapView: ({ children, onMapClick }: { children?: React.ReactNode; onMapClick?: (l: { lat: number; lng: number }) => void }) => (
    <div data-testid="map-view">
      {children}
      {onMapClick && (
        <button onClick={() => onMapClick({ lat: 48.8567, lng: 2.3523 })}>simulate-map-click</button>
      )}
    </div>
  ),
}))

// Mock GuideLineLayer the same way NetworkLinesLayer/FeltPointsLayer are already
// mocked in this file — it needs a real MapContainer to render for real (covered
// by its own test, Step 5 above), which this file's mocked MapView doesn't provide.
vi.mock('./GuideLineLayer', () => ({
  GuideLineLayer: ({ anchor, bearingDeg }: { anchor: { x: number; y: number } | null; bearingDeg: number | null }) =>
    anchor !== null && bearingDeg !== null ? <div data-testid="guide-line" /> : null,
}))

it('places a guide line at the clicked point once a bearing preset and "placer" are active', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

  render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)
  await screen.findByTestId('map-view')

  fireEvent.click(screen.getByRole('button', { name: 'N/S' }))
  fireEvent.click(screen.getByRole('button', { name: /placer/i }))
  fireEvent.click(screen.getByText('simulate-map-click'))

  expect(await screen.findByTestId('guide-line')).toBeInTheDocument()
})

it('does not place a guide line from a map click when "placer" is not active', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

  render(<SiteMapView planId="p1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} />)
  await screen.findByTestId('map-view')

  fireEvent.click(screen.getByRole('button', { name: 'N/S' }))
  // no "Placer" click this time — onMapClick shouldn't even be wired up
  expect(screen.queryByText('simulate-map-click')).not.toBeInTheDocument()
})
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `npx vitest run src/components/SiteMapView.test.tsx`
Expected: FAIL — no guide-line controls exist yet

- [ ] **Step 11: Add the guide-line controls and placement state to `SiteMapView`**

```tsx
// src/components/SiteMapView.tsx — add imports, state, and JSX
import { GuideLineLayer } from './GuideLineLayer'
import { latLngToLocal } from '../geometry/localCoordinates'

// ... inside SiteMapView, add state:
const [guideLineBearing, setGuideLineBearing] = useState<number | null>(null)
const [guideLineAnchor, setGuideLineAnchor] = useState<Point | null>(null)
const [placingGuideLine, setPlacingGuideLine] = useState(false)

function handleGuideLineMapClick(latlng: { lat: number; lng: number }) {
  setGuideLineAnchor(latLngToLocal(latlng, missionOrigin))
  setPlacingGuideLine(false)
}

// ... in the JSX, add controls (outside <MapView>, e.g. alongside <LayerPanel>):
<div>
  <button onClick={() => setGuideLineBearing(0)}>N/S</button>
  <button onClick={() => setGuideLineBearing(90)}>E/O</button>
  <button onClick={() => setGuideLineBearing(45)}>45°</button>
  <button onClick={() => setPlacingGuideLine(true)} disabled={guideLineBearing === null}>
    Placer ici
  </button>
</div>

// ... pass onMapClick to MapView only while actively placing, and render the layer:
<MapView
  center={[missionOrigin.lat, missionOrigin.lng]}
  onMapClick={placingGuideLine ? handleGuideLineMapClick : undefined}
>
  {/* ...existing FeltPointsLayer / NetworkLinesLayer children... */}
  <GuideLineLayer anchor={guideLineAnchor} bearingDeg={guideLineBearing} missionOrigin={missionOrigin} />
</MapView>
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `npx vitest run src/components/SiteMapView.test.tsx`
Expected: PASS (4 tests — the 2 from Chunk 8, Task 29 plus this task's 2 new ones)

- [ ] **Step 13: Type-check and commit**

Run: `npx tsc -b --noEmit`

```bash
git add src/geometry/guideLine.ts src/geometry/guideLine.test.ts src/components/GuideLineLayer.tsx src/components/GuideLineLayer.test.tsx src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Add guide-line tool: transient directional aid for blind field search"
```

---

### Task 31: Interactive `GridLine` editing — drag, undo, reset-to-theoretical

**⚠️ External API uncertainty, same treatment as Leaflet.DistortableImage (Chunk 4)
and the IGN endpoints (Chunk 3/7):** this task uses `@geoman-io/leaflet-geoman-free`
(named in this plan's header stack list) to make polyline vertices draggable on the
map. Neither of us can browse its current docs live, and its exact event names/API
(`layer.pm.enable()`, the shape of drag-end events, whether react-leaflet needs a
wrapper hook) are not confirmed. This task isolates that uncertainty to one thin
"glue" function (Step 5) and makes everything around it — what happens to the data
when a vertex moves, undo, reset — pure, tested logic that doesn't depend on Geoman
being wired correctly to prove itself out.

**Calibration direction, per Laurent's explicit correction earlier in this project:
dragging a vertex fits the theoretical line onto sensed reality — it is never the
other way around.** There is no code difference this implies (a drag is a drag
either way), but the UI copy/labels in Step 6 reflect this framing deliberately
("caler sur le ressenti", not "ajuster la grille").

**Files:**
- Modify: `src/data/gridLinesRepo.ts` + `.test.ts` (add `updateAdjustedPoints`)
- Create: `src/geometry/lineEditing.ts`
- Test: `src/geometry/lineEditing.test.ts`
- Create: `src/components/EditableNetworkLine.tsx`
- Test: `src/components/EditableNetworkLine.test.tsx`

- [ ] **Step 1: Write a failing test for `updateAdjustedPoints`**

```typescript
// append to src/data/gridLinesRepo.test.ts
it('updates a single line\'s adjusted points', async () => {
  const { from, chain } = createSupabaseChainMock({
    data: {
      id: 'gl1', grid_instance_id: 'gi1', family: 'axis-a', polarity: '+', reinforced: false,
      theoretical_points: [{ x: 0, y: -3 }, { x: 0, y: 3 }],
      adjusted_points: [{ x: 0.3, y: -3 }, { x: 0, y: 3 }],
    },
    error: null,
  })
  vi.mocked(supabase).from = from

  const line = await updateAdjustedPoints('gl1', [{ x: 0.3, y: -3 }, { x: 0, y: 3 }])

  expect(chain.eq).toHaveBeenCalledWith('id', 'gl1')
  expect(chain.update).toHaveBeenCalledWith({ adjusted_points: [{ x: 0.3, y: -3 }, { x: 0, y: 3 }] })
  expect(line.adjustedPoints).toEqual([{ x: 0.3, y: -3 }, { x: 0, y: 3 }])
})
```

- [ ] **Step 2: Run test to verify it fails, then implement, then verify it passes**

Run: `npx vitest run src/data/gridLinesRepo.test.ts`
Expected: FAIL, then implement:

```typescript
// src/data/gridLinesRepo.ts — add
export async function updateAdjustedPoints(lineId: string, adjustedPoints: Point[]): Promise<GridLine> {
  const { data, error } = await supabase
    .from('grid_line')
    .update({ adjusted_points: adjustedPoints })
    .eq('id', lineId)
    .select()
    .single()

  if (error) throw new Error(`Impossible de mettre à jour la ligne : ${error.message}`)
  return mapRowToGridLine(data as GridLineRow)
}
```

Run: `npx vitest run src/data/gridLinesRepo.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 3: Write failing tests for the pure vertex-drag/reset logic**

```typescript
// src/geometry/lineEditing.test.ts
import { describe, it, expect } from 'vitest'
import { applyVertexDrag, resetToTheoretical } from './lineEditing'
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

describe('resetToTheoretical', () => {
  it('overwrites adjustedPoints with a copy of theoreticalPoints', () => {
    const dragged = applyVertexDrag(baseLine, 0, { x: 0.4, y: -3 })
    const reset = resetToTheoretical(dragged)
    expect(reset.adjustedPoints).toEqual(dragged.theoreticalPoints)
    expect(reset.adjustedPoints).not.toBe(reset.theoreticalPoints) // a copy, not the same array reference
  })
})
```

- [ ] **Step 4: Run test to verify it fails, then implement, then verify it passes**

```typescript
// src/geometry/lineEditing.ts
import type { GridLine, Point } from '../domain/types'

export function applyVertexDrag(line: GridLine, pointIndex: number, newPoint: Point): GridLine {
  const adjustedPoints = [...line.adjustedPoints]
  adjustedPoints[pointIndex] = newPoint
  return { ...line, adjustedPoints }
}

export function resetToTheoretical(line: GridLine): GridLine {
  return { ...line, adjustedPoints: [...line.theoreticalPoints] }
}
```

Run: `npx vitest run src/geometry/lineEditing.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: The Geoman "glue" — isolated, uncertain, thin**

```tsx
// src/components/EditableNetworkLine.tsx
import { useEffect, useRef } from 'react'
import { Polyline, useMap } from 'react-leaflet'
import type { Layer } from 'leaflet'
import { localToLatLng, latLngToLocal, type LatLng } from '../geometry/localCoordinates'
import { applyVertexDrag } from '../geometry/lineEditing'
import type { GridLine } from '../domain/types'

export interface EditableNetworkLineProps {
  line: GridLine
  color: string
  missionOrigin: LatLng
  editable: boolean
  onChanged: (updated: GridLine) => void
}

/**
 * ⚠️ The `pm.enable()` call and `pm:markerdragend` event name below are a
 * best-effort guess at leaflet-geoman-free's actual API — VERIFY against
 * https://github.com/geoman-io/leaflet-geoman before relying on this. If the
 * event/method names are wrong, the surrounding logic (applyVertexDrag,
 * onChanged, the repo update, undo) is unaffected — only this glue needs
 * correcting.
 */
export function EditableNetworkLine({ line, color, missionOrigin, editable, onChanged }: EditableNetworkLineProps) {
  const layerRef = useRef<Layer & { pm?: { enable: () => void; disable: () => void } }>(null)
  useMap() // ensures this only ever renders inside a MapContainer

  useEffect(() => {
    const layer = layerRef.current
    if (!layer?.pm) return
    if (editable) layer.pm.enable()
    else layer.pm.disable()
  }, [editable])

  useEffect(() => {
    const layer = layerRef.current as unknown as {
      on: (event: string, handler: (e: { target: { getLatLngs: () => { lat: number; lng: number }[] } }) => void) => void
      off: (event: string) => void
    } | null
    if (!layer) return

    function handleDragEnd(e: { target: { getLatLngs: () => { lat: number; lng: number }[] } }) {
      const latlngs = e.target.getLatLngs()
      latlngs.forEach((latlng, index) => {
        const point = latLngToLocal(latlng, missionOrigin)
        onChanged(applyVertexDrag(line, index, point))
      })
    }

    layer.on('pm:markerdragend', handleDragEnd)
    return () => layer.off('pm:markerdragend')
  }, [line, missionOrigin, onChanged])

  return (
    <Polyline
      ref={layerRef}
      positions={line.adjustedPoints.map((p) => {
        const latlng = localToLatLng(p, missionOrigin)
        return [latlng.lat, latlng.lng] as [number, number]
      })}
      pathOptions={{
        color,
        dashArray: line.polarity === '-' ? '6, 4' : undefined,
        weight: line.reinforced ? 4 : 2,
      }}
    />
  )
}
```

**This component is not unit-tested against real Geoman behavior** (that would
require either a real browser environment or faking Geoman's internals in a way
that proves nothing) — its only test (Step 6) verifies it renders without crashing
and that `editable`/`color`/dash/weight props reach the underlying `Polyline`
correctly, i.e. the part that doesn't depend on Geoman actually being present.

- [ ] **Step 6: Write a smoke test for `EditableNetworkLine`**

```tsx
// src/components/EditableNetworkLine.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { EditableNetworkLine } from './EditableNetworkLine'
import type { GridLine } from '../domain/types'

const line: GridLine = {
  id: 'gl1', gridInstanceId: 'gi1', family: 'axis-a', polarity: '-', reinforced: true,
  theoreticalPoints: [{ x: 0, y: -10 }, { x: 0, y: 10 }],
  adjustedPoints: [{ x: 0, y: -10 }, { x: 0, y: 10 }],
}

describe('EditableNetworkLine', () => {
  it('renders without crashing and applies color/dash/weight from the line', () => {
    const { container } = render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <EditableNetworkLine
          line={line}
          color="#d32f2f"
          missionOrigin={{ lat: 48.8566, lng: 2.3522 }}
          editable={false}
          onChanged={vi.fn()}
        />
      </MapContainer>
    )
    const path = container.querySelector('path.leaflet-interactive')
    expect(path?.getAttribute('stroke')).toBe('#d32f2f')
    expect(path?.getAttribute('stroke-width')).toBe('4')
    expect(path?.getAttribute('stroke-dasharray')).toBe('6, 4')
  })
})
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/components/EditableNetworkLine.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 8: Wire `EditableNetworkLine` + undo + reset into `SiteMapView`**

Replace `NetworkLinesLayer`'s usage for the currently-visible-and-editable instance
with a mapping over `EditableNetworkLine`, add an "Éditer" toggle per grid layer in
`LayerPanel` (or a simpler single global "Mode édition" toggle — since Laurent
works on one network at a time in the field, a single toggle affecting whichever
layer is currently visible is simpler and matches his actual workflow; don't build
per-layer edit toggles unless a real need for editing multiple layers at once shows
up), plus:

```typescript
// inside SiteMapView, add an undo stack (session-local, not persisted) and reset:
const [undoStack, setUndoStack] = useState<Record<string, GridLine[]>>({}) // per gridInstanceId

function handleLineChanged(instanceId: string, updated: GridLine) {
  setUndoStack((prev) => ({
    ...prev,
    [instanceId]: [...(prev[instanceId] ?? []), linesByInstance[instanceId].find((l) => l.id === updated.id)!],
  }))
  setLinesByInstance((prev) => ({
    ...prev,
    [instanceId]: prev[instanceId].map((l) => (l.id === updated.id ? updated : l)),
  }))
  updateAdjustedPoints(updated.id, updated.adjustedPoints).catch((err) =>
    setError(err instanceof Error ? err.message : String(err))
  )
}

function handleUndo(instanceId: string) {
  const stack = undoStack[instanceId]
  if (!stack || stack.length === 0) return
  const previous = stack[stack.length - 1]
  setUndoStack((prev) => ({ ...prev, [instanceId]: prev[instanceId].slice(0, -1) }))
  setLinesByInstance((prev) => ({
    ...prev,
    [instanceId]: prev[instanceId].map((l) => (l.id === previous.id ? previous : l)),
  }))
  updateAdjustedPoints(previous.id, previous.adjustedPoints).catch((err) =>
    setError(err instanceof Error ? err.message : String(err))
  )
}

function handleResetLine(instanceId: string, lineId: string) {
  const line = linesByInstance[instanceId]?.find((l) => l.id === lineId)
  if (!line) return
  handleLineChanged(instanceId, resetToTheoretical(line))
}
```

This task doesn't write a full end-to-end test for the undo/reset wiring inside
`SiteMapView` (its test file is already substantial) — Step 9's manual browser
check is the verification for this step. If a future chunk needs to change this
logic, consider extracting it into its own tested module first.

- [ ] **Step 9: Manually verify in the browser**

Run: `npm run dev`. Reach a mission with a generated `GridInstance` (create one
programmatically via the browser console using the repo functions, until a "create
grid" UI exists — that UI isn't part of this plan yet, see the note at the end of
this chunk). Toggle its layer visible, toggle edit mode, drag a vertex.
Expected: no crash; the dragged point persists after a page reload; "Annuler"
reverts the last drag; "Réinitialiser" restores the theoretical position for that
line.

- [ ] **Step 10: Type-check and commit**

Run: `npx tsc -b --noEmit`

```bash
git add src/data/gridLinesRepo.ts src/data/gridLinesRepo.test.ts src/geometry/lineEditing.ts src/geometry/lineEditing.test.ts src/components/EditableNetworkLine.tsx src/components/EditableNetworkLine.test.tsx src/components/SiteMapView.tsx
git commit -m "Add interactive GridLine editing: drag (Geoman), undo, reset-to-theoretical"
```

---

### Task 32: Orthogonality assist UI

**Reuses, doesn't reimplement:** all the math already exists and is already tested
— `getOrthogonalitySuggestion` (Chunk 2, Task 7). This task is UI-only: show its
result as a preview after Laurent adjusts a line, let him accept or dismiss.

**Files:**
- Create: `src/components/OrthogonalitySuggestion.tsx`
- Test: `src/components/OrthogonalitySuggestion.test.tsx`
- Modify: `src/components/SiteMapView.tsx` (wire it into `handleLineChanged`)

- [ ] **Step 1: Write failing tests for `OrthogonalitySuggestion`**

```tsx
// src/components/OrthogonalitySuggestion.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MapContainer } from 'react-leaflet'
import { OrthogonalitySuggestion } from './OrthogonalitySuggestion'

const missionOrigin = { lat: 48.8566, lng: 2.3522 }

describe('OrthogonalitySuggestion', () => {
  it('shows the deviation and a preview line, and calls onAccept with the suggested points', () => {
    const onAccept = vi.fn()
    const onDismiss = vi.fn()
    render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <OrthogonalitySuggestion
          linePoints={[{ x: 0, y: -10 }, { x: 0.8, y: 10 }]}
          family="axis-a"
          template={{ angleTrueNorthDeg: 0 }}
          missionOrigin={missionOrigin}
          onAccept={onAccept}
          onDismiss={onDismiss}
        />
      </MapContainer>
    )

    expect(screen.getByText(/écart/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /redresser/i }))
    expect(onAccept).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ x: expect.any(Number) })])
    )
  })

  it('calls onDismiss without changing anything when ignored', () => {
    const onDismiss = vi.fn()
    render(
      <MapContainer center={[48.8566, 2.3522]} zoom={18}>
        <OrthogonalitySuggestion
          linePoints={[{ x: 0, y: -10 }, { x: 0.8, y: 10 }]}
          family="axis-a"
          template={{ angleTrueNorthDeg: 0 }}
          missionOrigin={missionOrigin}
          onAccept={vi.fn()}
          onDismiss={onDismiss}
        />
      </MapContainer>
    )
    fireEvent.click(screen.getByRole('button', { name: /ignorer/i }))
    expect(onDismiss).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/OrthogonalitySuggestion.test.tsx`
Expected: FAIL — `Cannot find module './OrthogonalitySuggestion'`

- [ ] **Step 3: Implement `OrthogonalitySuggestion`**

```tsx
// src/components/OrthogonalitySuggestion.tsx
import { Polyline } from 'react-leaflet'
import { getOrthogonalitySuggestion } from '../geometry/orthogonality'
import { localToLatLng, type LatLng } from '../geometry/localCoordinates'
import type { GridLineFamily, GridTemplate, Point } from '../domain/types'

export interface OrthogonalitySuggestionProps {
  linePoints: Point[]
  family: GridLineFamily
  template: Pick<GridTemplate, 'angleTrueNorthDeg'>
  missionOrigin: LatLng
  onAccept: (suggestedPoints: Point[]) => void
  onDismiss: () => void
}

export function OrthogonalitySuggestion({
  linePoints,
  family,
  template,
  missionOrigin,
  onAccept,
  onDismiss,
}: OrthogonalitySuggestionProps) {
  const { deviationDeg, suggestedPoints } = getOrthogonalitySuggestion(linePoints, family, template)

  return (
    <>
      <Polyline
        positions={suggestedPoints.map((p) => {
          const latlng = localToLatLng(p, missionOrigin)
          return [latlng.lat, latlng.lng] as [number, number]
        })}
        pathOptions={{ color: '#888888', dashArray: '2, 6', weight: 2 }}
      />
      <div>
        <p>Écart à l'orthogonal théorique : {deviationDeg.toFixed(1)}°</p>
        <button onClick={() => onAccept(suggestedPoints)}>Redresser</button>
        <button onClick={onDismiss}>Ignorer</button>
      </div>
    </>
  )
}
```

**Note:** the `<div>` with the deviation text and buttons is rendered as a sibling
of the `<Polyline>` inside the `MapContainer` tree — Leaflet tolerates plain DOM
children mixed with layer components (they just don't participate in map panning),
which is fine for a small floating info box. If this causes layout issues once
placed in the real app shell (Step 4), move the text/buttons out via a portal or
lift them to `SiteMapView`'s own JSX (outside `MapView`) instead, passing the
computed `deviationDeg`/`suggestedPoints` up — a presentation detail to settle
during Step 4, not a change to `getOrthogonalitySuggestion`'s usage.

- [ ] **Step 4: Run tests to verify they pass, wire into `SiteMapView`, type-check, and commit**

Run: `npx vitest run src/components/OrthogonalitySuggestion.test.tsx`
Expected: PASS (2 tests)

Wire it into `SiteMapView`. Three concrete additions to the file (Task 31, Step 8
already added `handleLineChanged`/`handleUndo`/`handleResetLine` — this extends
`handleLineChanged` and adds one new piece of state):

```typescript
// src/components/SiteMapView.tsx — add this state alongside the undo stack from Task 31:
const [awaitingOrthogonalityReview, setAwaitingOrthogonalityReview] = useState<string | null>(null)

// modify handleLineChanged (Task 31, Step 8) to also flag the line for review:
function handleLineChanged(instanceId: string, updated: GridLine) {
  setUndoStack((prev) => ({
    ...prev,
    [instanceId]: [...(prev[instanceId] ?? []), linesByInstance[instanceId].find((l) => l.id === updated.id)!],
  }))
  setLinesByInstance((prev) => ({
    ...prev,
    [instanceId]: prev[instanceId].map((l) => (l.id === updated.id ? updated : l)),
  }))
  updateAdjustedPoints(updated.id, updated.adjustedPoints).catch((err) =>
    setError(err instanceof Error ? err.message : String(err))
  )
  setAwaitingOrthogonalityReview(updated.id) // NEW — triggers the suggestion below
}
```

```tsx
// in the JSX, inside the instances.map(...) that already renders EditableNetworkLine
// (Task 31, Step 8) — for the specific instance/line matching awaitingOrthogonalityReview:
{instances.map((instance) => {
  const reviewedLine = linesByInstance[instance.id]?.find((l) => l.id === awaitingOrthogonalityReview)
  return (
    <div key={instance.id}>
      {/* ...existing EditableNetworkLine mapping... */}
      {reviewedLine && (
        <OrthogonalitySuggestion
          linePoints={reviewedLine.adjustedPoints}
          family={reviewedLine.family}
          template={{ angleTrueNorthDeg: instance.templateSnapshot.angleTrueNorthDeg }}
          missionOrigin={missionOrigin}
          onAccept={(suggestedPoints) => {
            handleLineChanged(instance.id, { ...reviewedLine, adjustedPoints: suggestedPoints })
            setAwaitingOrthogonalityReview(null)
          }}
          onDismiss={() => setAwaitingOrthogonalityReview(null)}
        />
      )}
    </div>
  )
})}
```

Note `family`/`template` are deliberately sourced from two different objects:
`family` is a field on the `GridLine` itself (`reviewedLine.family`), never on
`GridTemplate` — only `angleTrueNorthDeg` (needed for the suggestion math) comes
from the instance's `templateSnapshot`.

Run: `npx tsc -b --noEmit`

```bash
git add src/components/OrthogonalitySuggestion.tsx src/components/OrthogonalitySuggestion.test.tsx src/components/SiteMapView.tsx
git commit -m "Add orthogonality assist UI, wired after each GridLine adjustment"
```

---

**Chunk 9 exit criteria:** `npx vitest run` and `npx tsc -b --noEmit` both pass.
Laurent can place a transient compass-aligned guide line while searching blind, then
(separately, once he toggles a grid layer visible) drag its lines to fit his sensed
reality, undo a drag, reset a line to its theoretical position, and accept or
dismiss an orthogonality straightening suggestion after each adjustment.

**What's still missing from a complete field workflow, carried forward explicitly:**
there is still no UI to actually *create* a `GridInstance` (pick a template, click an
origin, indicate the reference line's sensed polarity) — `createGridForPlan`
(Chunk 5/7) is fully built and tested but only ever called programmatically in this
plan so far. This is a real gap, not an oversight: it needs its own small task once
the felt-point-first calibration flow (Chunk 7's `FeltPoint`s feeding into where the
origin should go) is designed in enough detail to avoid building a UI that gets
immediately reworked. Flag this to Laurent before starting Chunk 10.

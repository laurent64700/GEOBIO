# Felt Segment + Network Color Resolution — Design

**Status:** Approved by Laurent (2026-07-20), pending spec-document-reviewer pass.

## 1. Context / motivation

Two related gaps surfaced during real field testing of the rod-marker/ArUco detection
pipeline (see `docs/superpowers/specs/2026-07-16-rod-marker-detection-design.md` and its
plan, already implemented and field-tested with 4/4 markers detected at Hamming distance
0 on a real dappled-shade photo):

1. **Orientation is currently lost.** Each rod carries 2 ArUco markers (one per
   extremity, sharing a `rod_number` in the `rod_marker` table). Today,
   `mapDetectionsToPoints` (`src/vision/arucoMapping.ts`) treats every detected marker as
   an independent point and creates one `FeltPoint` per marker — the fact that two
   markers belong to the same physical rod, and therefore encode a *direction* (the
   sensed line's orientation at that spot), is discarded. `rod_marker.rod_number` is
   stored but read nowhere downstream.

2. **Network color resolution is incomplete.** `colorForNetwork` (`SiteMapView.tsx:363`)
   only resolves a color by matching an *active `GridInstance` on this plan*. Any
   network without a currently-generated grid — which is every network when doing
   rod-based field readings without first generating a theoretical grid, and *always*
   true for non-grid categories (Eau, Failles) — falls back to a flat grey `#888888`.
   With Laurent's real rod inventory (Hartmann, Curry, Eau, Peyré, Failles — 70 rods,
   140 markers, already seeded into `rod_marker`), this produces an unreadable grey
   point cloud instead of a network-legible map.

Both problems block the same practical goal: being able to look at the map after a
field session and visually read "2 red points + a red line = Hartmann" instead of an
undifferentiated cloud.

## 2. Network color resolution

`colorForNetwork(networkName: string): string` changes from a single lookup (active
`GridInstance` only) to a 4-step resolution chain, each step falling through to the
next only if no match is found:

1. **Active `GridInstance` on this plan** (current behavior, unchanged) — lets a
   per-mission override win if one is ever introduced later.
2. **`GridTemplate` by name** (new) — `listGridTemplates()` (`gridTemplatesRepo.ts`,
   already implemented, already fetches all 5 seeded templates regardless of
   instantiation) is fetched once alongside `instances`/`linesByInstance` in
   `SiteMapView`'s existing load effect. This covers Hartmann (`#d32f2f`), Curry
   (`#f2c230`), Palm (`#4a90c4`), Peyré (`#8e5fb3`), Wissmann (`#2d6a4f`) — the 5
   confirmed networks from `0005_seed_confirmed_networks.sql` — **without requiring a
   grid to be generated on the plan**.
3. **Free-standing category color table** (new) — a plain constant map in code (not a
   database table; these are a small, code-owned set, not user-editable data) for
   networks that have no `GridTemplate` because they aren't theoretical-grid networks:
   ```typescript
   // src/domain/networkColors.ts
   export const NON_GRID_NETWORK_COLORS: Record<string, string> = {
     Eau: '#00acc1',
     Failles: '#795548',
   }
   ```
   Confirmed with Laurent: cyan for Eau (distinct from Palm's steel blue), brown for
   Failles (distinct from every existing network/layer color: Hartmann red, Curry
   yellow, Palm blue, Peyré/Bagua purple, Wissmann green, and the orange `#e65100`
   planned — not yet implemented — for pathogenic crossings). Failles brown vs.
   Hartmann red is the closest pair under a protanopia (red-weak) simulation; if that
   ever proves hard to tell apart in the field, differentiate by stroke style (e.g.
   dashed) rather than hue, rather than hunting for a third color.
4. **Grey `#888888`** — final fallback for a genuinely unrecognized name, unchanged.

**Refactor for testability:** this resolution chain is extracted into a pure function
(proposed name `resolveNetworkColor(networkName, instances, templates): string` in
`src/domain/networkColors.ts`, colocated with the constant map above) rather than
staying an inline closure in `SiteMapView`. `SiteMapView`'s `colorForNetwork` becomes a
thin wrapper calling it with the component's current `instances`/`templates` state.
This makes the 4-step chain directly unit-testable without mounting `SiteMapView`.

**Scope note:** this fix benefits `FeltPointsLayer` immediately (already consumes
`colorForNetwork` as a prop) with no changes to that component — only `SiteMapView`'s
resolution logic and its one new data fetch change.

## 3. `FeltSegment` — a new domain concept for rod orientation

**Decision (confirmed with Laurent):** when a rod's two markers are both detected in
the same photo, store one `FeltSegment` (a positioned, oriented reading) instead of two
independent `FeltPoint`s. When only one marker of a rod is detected (occlusion, shadow,
etc.), fall back to a single `FeltPoint`, exactly as today — no data is ever lost.

**Explicitly out of scope for this iteration (YAGNI, confirmed with Laurent):**
- No automatic angular comparison between a felt segment and the nearest theoretical
  grid line. The segment is rendered as-is; Laurent reads the visual deviation himself.
  (If wanted later, this would reuse the bearing-comparison math already built for
  `src/geometry/orthogonality.ts`'s grid-editing assist — flagged here for a future
  spec, not designed now.)
- No physical-length validation (comparing measured A–B distance to a known rod
  length). `rod_marker` has no length column and none is added here.
- No cross-photo pairing. Two markers of the same rod detected in two different photos
  remain two independent `FeltPoint`s — pairing only happens within a single detection
  run over a single photo.

### 3.1 Data model

New table, next migration number after the already-applied `0014_mission_photo_calibration.sql`:

```sql
-- supabase/migrations/0015_felt_segment.sql
create table felt_segment (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plan(id) on delete cascade,
  network_name text not null,
  ax double precision not null,
  ay double precision not null,
  bx double precision not null,
  by double precision not null,
  created_at timestamptz not null default now()
);
create index felt_segment_plan_id_idx on felt_segment(plan_id);
```

`double precision` for geometry columns matches the established convention (see
`felt_point`, `grid_line.adjusted_points`, etc.) — `numeric` is reserved for the
unrelated 0-10/Bovis global-assessment sliders. Point A/B are stored as 4 flat columns
(`ax,ay,bx,by`), mirroring how `felt_point` stores `x,y` as flat columns rather than a
nested structure.

Domain type (`src/domain/types.ts`, alongside `FeltPoint`):

```typescript
export interface FeltSegment {
  id: string
  planId: string
  networkName: string
  pointA: Point
  pointB: Point
  createdAt: string
}
```

Repo `src/data/feltSegmentsRepo.ts` — exact structural mirror of
`src/data/feltPointsRepo.ts`: `createFeltSegment`, `deleteFeltSegment`,
`listFeltSegmentsForPlan`, same French error-message convention
(`Impossible d'enregistrer/de supprimer/de charger le segment ressenti : ${error.message}`),
same snake_case↔camelCase row mapping, same `createSupabaseChainMock`-based test
pattern (not GeoJSON fixtures).

### 3.2 Pairing at detection time

`src/vision/arucoMapping.ts` gains a pairing step. `RecognizedPoint` gains a `markerId`
field (currently `{ networkName, x, y }`, becomes `{ markerId, networkName, x, y }`) —
needed both for the dedup step below and for the deterministic ordering rule. The
lookup map used by `mapDetectionsToPoints` changes from `Map<markerId, networkName>` to
`Map<markerId, { networkName, rodNumber }>`, threading `rodNumber` through from
`RodMarker` (stored today, read nowhere downstream).

**Dedup before pairing:** a detector can return the same `markerId` more than once in a
single frame (misread/duplicate detection). Before grouping, recognized points are
deduplicated by `markerId`, keeping the first occurrence — this makes a group of more
than 2 recognized points structurally impossible, since each rod has exactly 2 distinct
marker IDs by construction (`rod_marker` never assigns the same `marker_id` twice).

Deduplicated points are then grouped by `(networkName, rodNumber)`. For each group:
- **2 recognized points** → one `FeltSegment` candidate: `pointA`/`pointB` are the two
  points sorted by `markerId` — order doesn't carry meaning today since nothing
  consumes directionality yet beyond "a line exists between these two points," but a
  deterministic order keeps re-runs stable and avoids flicker if the same photo is
  re-detected.
- **1 recognized point** → one `FeltPoint` candidate, exactly today's behavior.

`RodDetectionPanel.handleDetect` creates both kinds via `Promise.all` (extending the
existing single `Promise.all(recognized.map(...))` to also create segments), and the
summary message becomes more informative:
`"12 marqueurs détectés, 10 reconnus (4 tiges complètes, 2 points isolés)."`

### 3.3 Rendering — `FeltSegmentsLayer`

New component `src/components/FeltSegmentsLayer.tsx`, same family and shape as
`FeltPointsLayer`/`BaguaLayer`: `if (!visible) return null`, map segments through
`localToLatLng` for both endpoints, render a react-leaflet `Polyline` colored via
`colorForNetwork(segment.networkName)`. (A third sibling layer, `PathogenicCrossingsLayer`,
is planned in a parallel spec/plan — see the sequencing note below — but does not exist
in the codebase yet; it is not something to copy from directly.)

Wiring, following the exact established 2-file pattern (`LayerPanel.tsx` +
`SiteMapView.tsx`, already done twice in this codebase for felt points and Bagua):
- `LayerPanel.tsx`: new `FELT_SEGMENTS_LAYER_ID = 'felt-segments'`, checkbox defaulting
  to visible (`?? true`, matching `FELT_POINTS_LAYER_ID` — this is real field data
  Laurent wants to see by default, unlike the derived/auxiliary Bagua layer which
  defaults hidden).
- `SiteMapView.tsx`: fetch `feltSegments` in the existing plan-keyed load effect
  (alongside grid instances/lines/felt points), render `<FeltSegmentsLayer>` inside
  `<MapView>` alongside the existing layers, mock it in `SiteMapView.test.tsx` the same
  way `BaguaLayer`/`FeltPointsLayer` already are (a real `Polyline` needs a real Leaflet
  context this file's mocked `MapView` doesn't provide).

**Sequencing note:** a separate, already-approved plan
(`docs/superpowers/plans/2026-07-21-pathogenic-crossing-detection-plan.md`) also adds a
new layer by modifying these same two files (`LayerPanel.tsx` + `SiteMapView.tsx`),
independently of this spec. Whichever of the two implementation plans is executed
second will need to merge/rebase past the other's edits to these files — a normal merge,
not a design conflict, but worth flagging at execution time rather than being a surprise.

## 4. Testing

- `src/domain/networkColors.test.ts` — the extracted `resolveNetworkColor` pure
  function: active instance wins over template, template wins over the free-standing
  table, free-standing table wins over grey, unknown name falls all the way to grey.
- `src/data/feltSegmentsRepo.test.ts` — mirror of `feltPointsRepo.test.ts`.
- `src/vision/arucoMapping.test.ts` (extended) — pairing: 2 detections same
  `(networkName, rodNumber)` → 1 segment; 1 detection → 1 point; 2 different rods (same
  network, different `rodNumber`, or same `rodNumber`, different network) → 2 separate
  results, not merged; a duplicate detection of the same `markerId` within one photo is
  deduped before pairing (does not produce a 3-point group or a zero-length segment).
- `src/components/FeltSegmentsLayer.test.tsx` — mirror of `FeltPointsLayer.test.tsx`
  (renders one polyline per segment, nothing when `visible=false`, nothing when empty).
- `SiteMapView.test.tsx` — extend the existing rod-detection-adjacent integration test
  (or add one) confirming a plan with no grid instances still shows correct colors for
  Hartmann/Curry/Peyré points via the template fallback, and that Eau/Failles points
  get their free-standing colors.

## 5. Files touched (summary for the implementation plan)

- Create: `supabase/migrations/0015_felt_segment.sql`
- Create: `src/domain/networkColors.ts` (+ `.test.ts`)
- Modify: `src/domain/types.ts` (add `FeltSegment`)
- Create: `src/data/feltSegmentsRepo.ts` (+ `.test.ts`)
- Modify: `src/vision/arucoMapping.ts` (+ `.test.ts`) — pairing logic
- Modify: `src/components/RodDetectionPanel.tsx` (+ `.test.tsx`) — create segments,
  richer summary message
- Create: `src/components/FeltSegmentsLayer.tsx` (+ `.test.tsx`)
- Modify: `src/components/LayerPanel.tsx` (+ `.test.tsx`) — `FELT_SEGMENTS_LAYER_ID`
- Modify: `src/components/SiteMapView.tsx` (+ `.test.tsx`) — fetch templates + segments,
  wire `resolveNetworkColor`, render `FeltSegmentsLayer`

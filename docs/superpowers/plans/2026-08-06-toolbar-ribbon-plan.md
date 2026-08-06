# Ruban d'outils fixe + menus Fichier/Modifier/Affichage — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed horizontal toolbar (Undo/Redo, guide-line, reserved Placer/Tracer slots) and a File/Edit/View menu bar to GEOBIO's terrain screen, replacing several controls currently buried in collapsed accordions.

**Architecture:** New `Toolbar`/`MenuBar` components rendered by `MissionWorkspace.tsx` above `SiteMapView`. Most menu actions call functions that already exist; a handful of small, targeted additions are needed (a controllable `Accordion` section, an exposed manual sync trigger, a new mission-duplication function, and 2 new navigation callbacks threaded from `App.tsx`). Everything not explicitly touched below (Grille/Réseaux, Calques' own content, the bilan global bar, all placement pickers) keeps working exactly as today.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, `@radix-ui/react-dropdown-menu` (new dependency).

**Spec:** `docs/superpowers/specs/2026-08-06-toolbar-ribbon-design.md` — read it first for the full rationale behind every decision below.

---

## Chunk 1: Foundation (dependency, Accordion control, sync exposure, mission duplication, navigation plumbing)

### Task 1: Add `@radix-ui/react-dropdown-menu`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the dependency**

Run: `npm install @radix-ui/react-dropdown-menu`

- [ ] **Step 2: Verify the build still succeeds**

Run: `npm run build`
Expected: succeeds with no TypeScript errors (confirms the new dependency's types resolve cleanly against React 19).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @radix-ui/react-dropdown-menu"
```

---

### Task 2: `Accordion.tsx` — externally controllable sections

**Files:**
- Modify: `src/components/Accordion.tsx`
- Test: `src/components/Accordion.test.tsx` (new file — none exists today)

Today, `AccordionSection.defaultOpen` is only ever read once, as the native
`<details>` element's initial `open` attribute — there's no way to open/close a
section from outside once rendered. "Basculer Calques" (the Affichage menu item)
needs exactly this, for the "Calques" section specifically. Add an *optional*
controlled mode per section: if a section provides `open`/`onToggle`, the
`<details>` becomes controlled for that section only; sections without them keep
today's uncontrolled `defaultOpen` behavior unchanged.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/Accordion.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Accordion } from './Accordion'

describe('Accordion', () => {
  it('renders an uncontrolled section open per defaultOpen, with no regression when open/onToggle are absent', () => {
    render(
      <Accordion
        sections={[
          { id: 'a', title: 'A', defaultOpen: true, content: <p>content-a</p> },
          { id: 'b', title: 'B', defaultOpen: false, content: <p>content-b</p> },
        ]}
      />
    )
    const detailsA = screen.getByText('A').closest('details')
    const detailsB = screen.getByText('B').closest('details')
    expect(detailsA).toHaveAttribute('open')
    expect(detailsB).not.toHaveAttribute('open')
  })

  it('renders a controlled section open/closed per its open prop, ignoring defaultOpen', () => {
    render(
      <Accordion
        sections={[
          { id: 'a', title: 'A', defaultOpen: false, open: true, onToggle: vi.fn(), content: <p>content-a</p> },
        ]}
      />
    )
    expect(screen.getByText('A').closest('details')).toHaveAttribute('open')
  })

  it('calls onToggle with the new open state when a controlled section is clicked, and does not change on its own', () => {
    const onToggle = vi.fn()
    render(
      <Accordion
        sections={[
          { id: 'a', title: 'A', defaultOpen: false, open: true, onToggle, content: <p>content-a</p> },
        ]}
      />
    )
    const details = screen.getByText('A').closest('details') as HTMLDetailsElement
    fireEvent.toggle(details)
    expect(onToggle).toHaveBeenCalledWith(false)
    // Controlled: still reflects the `open` prop (true), not the DOM's own toggle,
    // since the parent hasn't re-rendered with a new `open` value in this test.
    expect(details).toHaveAttribute('open')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/Accordion.test.tsx`
Expected: FAIL — `open`/`onToggle` aren't recognized props yet, and the controlled section won't reopen after `fireEvent.toggle` forces the DOM's own `open` state.

- [ ] **Step 3: Implement**

```tsx
// src/components/Accordion.tsx
import type { ReactNode } from 'react'

export interface AccordionSection {
  id: string
  title: string
  defaultOpen: boolean
  content: ReactNode
  // Optional controlled-mode pair. When BOTH are provided, this section's
  // open/closed state is driven by `open` (not `defaultOpen`), and toggling
  // it calls `onToggle` with the new desired state instead of letting the
  // native <details> manage its own state. Sections that omit these keep the
  // existing uncontrolled behavior (defaultOpen as an initial value only).
  open?: boolean
  onToggle?: (open: boolean) => void
}

export interface AccordionProps {
  sections: AccordionSection[]
}

// Native <details>/<summary>: independent open/close per section (not
// single-open) is the simplest correct behavior and needs no state of our
// own — see spec §12, "par défaut technique le plus simple : indépendant,
// comme <details> HTML natif". Controlled sections (open/onToggle both set)
// are the one exception, added 2026-08 for "Basculer Calques" (toolbar-ribbon
// spec §4/§6) — React reconciles a controlled <details open> back to the
// `open` prop's value on every render, overriding the DOM's own toggle,
// exactly like a controlled <input>.
export function Accordion({ sections }: AccordionProps) {
  return (
    <div>
      {sections.map((section) => {
        const isControlled = section.open !== undefined && section.onToggle !== undefined
        return (
          <details
            key={section.id}
            open={isControlled ? section.open : section.defaultOpen}
            onToggle={
              isControlled
                ? (e) => section.onToggle!((e.target as HTMLDetailsElement).open)
                : undefined
            }
          >
            <summary>{section.title}</summary>
            {section.content}
          </details>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/Accordion.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/Accordion.tsx src/components/Accordion.test.tsx
git commit -m "feat: support externally-controlled Accordion sections"
```

---

### Task 3: `useOfflineSync.ts` — expose a manual sync trigger

**Files:**
- Modify: `src/hooks/useOfflineSync.ts`
- Modify: `src/hooks/useOfflineSync.test.ts`

`attemptFlush` already does everything "Enregistrer" needs (respects the
in-flight guard, refreshes the count) — it just isn't exposed. Expose it as
`flushNow`. Per spec §7: `flushPendingMutations()`'s `listPendingMutations()` call
is unprotected and can reject; `attemptFlush`'s `try/finally` does NOT swallow
that rejection (only guarantees the `finally` cleanup runs) — so `flushNow` CAN
reject, and callers (Task 9, "Enregistrer") must handle that themselves.

- [ ] **Step 1: Write the failing test**

Read `src/hooks/useOfflineSync.test.ts` first to match its existing mocking
conventions (it mocks `../offline/connectivity` and `../offline/pendingMutations`/
`../offline/sync`), then add:

```ts
// appended to src/hooks/useOfflineSync.test.ts
it('exposes flushNow, which calls flushPendingMutations and refreshes pendingCount', async () => {
  vi.mocked(isOnlineNow).mockResolvedValue(false) // keep the mount-time auto-flush from firing, isolate this test to the manual trigger
  vi.mocked(listPendingMutations).mockResolvedValue([{ id: 1 } as never])
  vi.mocked(flushPendingMutations).mockResolvedValue(undefined)

  const { result } = renderHook(() => useOfflineSync())
  await waitFor(() => expect(result.current.pendingCount).toBe(1))

  vi.mocked(listPendingMutations).mockResolvedValue([]) // simulate the queue draining
  await act(async () => {
    await result.current.flushNow()
  })

  expect(flushPendingMutations).toHaveBeenCalled()
  expect(result.current.pendingCount).toBe(0)
})

it('propagates a flushNow rejection to the caller (listPendingMutations failing mid-flush is not swallowed)', async () => {
  vi.mocked(isOnlineNow).mockResolvedValue(false)
  vi.mocked(listPendingMutations).mockResolvedValueOnce([])
  const { result } = renderHook(() => useOfflineSync())
  await waitFor(() => expect(result.current.pendingCount).toBe(0))

  vi.mocked(flushPendingMutations).mockRejectedValue(new Error('boom'))
  await expect(result.current.flushNow()).rejects.toThrow('boom')
})
```

(Add `renderHook, waitFor, act` to the existing `@testing-library/react` import
if not already present; check the file's current imports before assuming.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/hooks/useOfflineSync.test.ts`
Expected: FAIL — `result.current.flushNow` is `undefined`.

- [ ] **Step 3: Implement**

In `src/hooks/useOfflineSync.ts`, change only the return type and statement:

```ts
export function useOfflineSync(): { pendingCount: number; flushNow: () => Promise<void> } {
```

```ts
  return { pendingCount, flushNow: attemptFlush }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/hooks/useOfflineSync.test.ts`
Expected: PASS, including all pre-existing tests in the file (no regression).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOfflineSync.ts src/hooks/useOfflineSync.test.ts
git commit -m "feat: expose flushNow (manual sync trigger) from useOfflineSync"
```

---

### Task 4: `missionsRepo.ts` — `duplicateMission`

**Files:**
- Modify: `src/data/missionsRepo.ts`
- Modify: `src/data/missionsRepo.test.ts`

**Scope decision for this plan** (spec §4 explicitly left "quelle profondeur de
copie exactement" open): duplicate the **mission shell** — address, mission date,
declination, parcel refs, building footprint — plus a fresh **empty** exterior
plan (`kind: 'exterieur'`). It deliberately does **not** copy origin lat/lng, the
5 cause values/Bovis rate, or any survey data (felt points/segments/phenomena/
context objects/grids/freeform traces/photos) from the source mission — the
plausible real use case is "same site, new visit" (a follow-up survey), not "an
exact clone of one specific day's readings," and a full deep copy across 8 entity
types is a much larger feature than this phase's "reorganize existing controls"
scope. **This is a product judgment call, not purely technical — flag it to
Laurent for confirmation during/after implementation review**, since the spec
didn't get his explicit sign-off on this specific depth.

- [ ] **Step 1: Write the failing test**

```ts
// appended to src/data/missionsRepo.test.ts — match the file's existing
// supabase-mocking pattern (check the top of the file for its exact shape
// before writing this, likely a chained `.from().insert().select().single()`
// mock builder already used by the createMission tests).
describe('duplicateMission', () => {
  it('creates a new mission copying address/date/declination/parcels/footprint, and a fresh empty exterior plan', async () => {
    const source: Mission = {
      id: 'm1', address: '12 rue des Lilas', missionDate: '2026-08-06',
      declinationDeg: 1.5, originLat: 48.85, originLng: 2.35,
      causeArchitectural: 3, causeElectromagnetique: 2, causeGeobiologique: 7,
      causeParanormale: 0, causeAutres: 0, bovisRate: 8000,
      parcelRefs: ['ABC-123'], buildingFootprint: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
    }
    const created: Mission = { ...source, id: 'm2', originLat: null, originLng: null,
      causeArchitectural: null, causeElectromagnetique: null, causeGeobiologique: null,
      causeParanormale: null, causeAutres: null, bovisRate: null }
    // mock supabase .from('mission').insert(...).select().single() to resolve `created`
    // mock supabase .from('plan').insert(...).select().single() to resolve a fresh exterior Plan for m2

    const result = await duplicateMission(source)

    expect(result.mission.address).toBe('12 rue des Lilas')
    expect(result.mission.id).toBe('m2')
    expect(result.mission.originLat).toBeNull() // not copied
    expect(result.mission.causeGeobiologique).toBeNull() // not copied
    expect(result.mission.parcelRefs).toEqual(['ABC-123']) // copied
    expect(result.mission.buildingFootprint).toEqual(source.buildingFootprint) // copied
    expect(result.exteriorPlan.kind).toBe('exterieur')
    expect(result.exteriorPlan.missionId).toBe('m2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/data/missionsRepo.test.ts`
Expected: FAIL — `duplicateMission` is not exported yet.

- [ ] **Step 3: Implement**

In `src/data/missionsRepo.ts`, add (needs `createPlan` imported from
`./plansRepo` — check `src/data/plansRepo.ts`'s exact `CreatePlanInput` shape
before writing this, it takes at minimum `missionId`/`kind`):

```ts
export async function duplicateMission(source: Mission): Promise<{ mission: Mission; exteriorPlan: Plan }> {
  const mission = await createMission({
    address: source.address,
    missionDate: source.missionDate,
    declinationDeg: source.declinationDeg,
  })
  // parcelRefs/buildingFootprint aren't part of CreateMissionInput (createMission
  // only accepts address/missionDate/declinationDeg) — set them via the existing
  // setters, matching how the rest of this file already builds up a Mission
  // incrementally after creation (see setSelectedParcels/setBuildingFootprint).
  const withParcels = source.parcelRefs.length > 0
    ? await setSelectedParcels(mission.id, source.parcelRefs)
    : mission
  const final = source.buildingFootprint !== null
    ? await setBuildingFootprint(withParcels.id, source.buildingFootprint)
    : withParcels
  const exteriorPlan = await createPlan({ missionId: final.id, kind: 'exterieur' })
  return { mission: final, exteriorPlan }
}
```

Add `import { createPlan } from './plansRepo'` and `import type { Plan } from '../domain/types'` at the top.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/data/missionsRepo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/missionsRepo.ts src/data/missionsRepo.test.ts
git commit -m "feat: add duplicateMission (mission shell + fresh empty exterior plan)"
```

---

### Task 5: Navigation plumbing — `App.tsx` → `MissionWorkspace.tsx`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/MissionWorkspace.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/pages/MissionWorkspace.test.tsx`

Today `MissionWorkspace` has no way to tell `App` "go back to the mission list" or
"start a new mission" — `MissionWorkspaceProps` only has `initialResumePhase`.
"Mes missions"/"Quitter la mission"/"Nouvelle mission" (Fichier menu, Task 9) need
this. Add 2 callback props, threaded through to wherever `Toolbar` ends up (Task
6) — for this task, just wire the plumbing and prove it with a temporary no-op
call site (a button), which Task 6+9 will replace with the real Toolbar/MenuBar.

- [ ] **Step 1: Write the failing test**

```tsx
// appended to src/App.test.tsx — match the file's existing mocking of
// listMissions/MissionWorkspace before writing this.
it('passes onNavigateToMissionList/onNavigateToNewMission to MissionWorkspace, and they update AppPhase', async () => {
  // ... render App in the 'resuming' phase (reuse this file's existing setup
  // for that), then grab the props MissionWorkspace was called with (via the
  // mocked component, same pattern the file already uses elsewhere) and:
  props.onNavigateToMissionList()
  // assert MissionList is now rendered (re-fetches or reuses the cached list —
  // check this file's existing 'mission-list' phase test for the expected
  // fetch/no-fetch behavior before deciding)
})
```

Given this file's exact mocking setup isn't in front of you, read
`src/App.test.tsx` in full before writing this test — match its conventions
exactly rather than guessing the shape.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/App.test.tsx`
Expected: FAIL — `onNavigateToMissionList` is `undefined` on the props `MissionWorkspace` receives.

- [ ] **Step 3: Implement**

In `src/App.tsx`, add 2 handlers and pass them down:

```tsx
  async function handleNavigateToMissionList() {
    try {
      const missions = await listMissions()
      setPhase({ name: 'mission-list', missions })
    } catch (err) {
      setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  function handleNavigateToNewMission() {
    setPhase({ name: 'creating' })
  }
```

```tsx
        {phase.name === 'creating' && (
          <MissionWorkspace
            onNavigateToMissionList={handleNavigateToMissionList}
            onNavigateToNewMission={handleNavigateToNewMission}
          />
        )}
        {phase.name === 'resuming' && (
          <MissionWorkspace
            initialResumePhase={phase.resumePhase}
            onNavigateToMissionList={handleNavigateToMissionList}
            onNavigateToNewMission={handleNavigateToNewMission}
          />
        )}
```

In `src/pages/MissionWorkspace.tsx`:

```ts
export interface MissionWorkspaceProps {
  initialResumePhase?: ResumePhase
  onNavigateToMissionList: () => void
  onNavigateToNewMission: () => void
}

export function MissionWorkspace({ initialResumePhase, onNavigateToMissionList, onNavigateToNewMission }: MissionWorkspaceProps) {
```

Do not wire these into the render tree yet beyond accepting them as props (Task
6/9 does that) — just confirm they compile and are accepted, so this task stays
small and independently testable/committable.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/App.test.tsx src/pages/MissionWorkspace.test.tsx`
Expected: PASS — including a likely-needed update to `MissionWorkspace.test.tsx`'s
existing render calls, which will now fail TypeScript's required-props check
unless every render call in that file passes the 2 new (non-optional) props. Add
no-op `vi.fn()` values to each existing render call in that test file as needed.

- [ ] **Step 5: Run the full suite to check for stranded call sites**

Run: `npm test -- --run`
Expected: PASS. Any other file constructing `<MissionWorkspace>` directly (grep
for `<MissionWorkspace` across `src/` first) needs the same 2 new props added.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "feat: thread onNavigateToMissionList/onNavigateToNewMission from App to MissionWorkspace"
```

---

## Chunk 2: Toolbar shell — relocate Undo/Redo and Ligne guide, reserved slots

### Task 6: `Toolbar.tsx` — skeleton, mounted in `MissionWorkspace`

**Files:**
- Create: `src/components/Toolbar.tsx`
- Create: `src/components/Toolbar.test.tsx`
- Modify: `src/pages/MissionWorkspace.tsx`
- Modify: `src/pages/MissionWorkspace.test.tsx`

Start with an empty structural shell (just the fixed-position wrapper + visual
separators), mounted in the `ready-no-interior` case only (spec §3). Later tasks
in this chunk fill in real content; Chunk 3/4 add the menu bar.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/Toolbar.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Toolbar } from './Toolbar'

describe('Toolbar', () => {
  it('renders as a fixed top toolbar', () => {
    render(<Toolbar>{/* children filled in by later tasks */}</Toolbar>)
    // A basic smoke test for now — asserts the wrapper renders; later tasks in
    // this chunk add assertions on actual content (UndoRedoControls, guide-line).
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/Toolbar.test.tsx`
Expected: FAIL — `Toolbar.tsx` doesn't exist.

- [ ] **Step 3: Implement**

```tsx
// src/components/Toolbar.tsx
import type { ReactNode } from 'react'

export interface ToolbarProps {
  children: ReactNode
}

// Fixed-height, full-width, top-of-screen bar — spec §3 ("ruban Paint"). Height
// is a named constant (not just a magic number here) because Sidebar.tsx (Task
// 7) needs the exact same value to offset its own top position and avoid
// overlapping this bar.
export const TOOLBAR_HEIGHT_PX = 48

const TOOLBAR_STYLE = {
  position: 'fixed' as const,
  top: 0,
  left: 0,
  right: 0,
  height: TOOLBAR_HEIGHT_PX,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 8px',
  background: 'white',
  borderBottom: '1px solid #ccc',
  zIndex: 1100, // above Sidebar's zIndex: 1000 (Sidebar.tsx) so nothing overlaps it
}

export function Toolbar({ children }: ToolbarProps) {
  return (
    <div role="toolbar" style={TOOLBAR_STYLE}>
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/Toolbar.test.tsx`
Expected: PASS

- [ ] **Step 5: Mount it in `MissionWorkspace.tsx`'s `ready-no-interior` case**

In `src/pages/MissionWorkspace.tsx`, import `Toolbar` and wrap the existing
`ready-no-interior` return value's outer `<div style={FLEX_COLUMN_FULL_HEIGHT_STYLE}>`
content with `<Toolbar>{/* empty for now */}</Toolbar>` as its first child (sibling
of `NonBlockingErrorBanner`, before it).

```tsx
import { Toolbar } from '../components/Toolbar'
```

```tsx
        <div style={FLEX_COLUMN_FULL_HEIGHT_STYLE}>
          <Toolbar />
          <NonBlockingErrorBanner error={nonBlockingError} />
```

(`Toolbar`'s `children` prop will need to become optional, or pass `null` —
prefer making `children?: ReactNode` since later tasks fill it progressively.)

- [ ] **Step 6: Run the full suite**

Run: `npm test -- --run`
Expected: PASS. `MissionWorkspace.test.tsx`'s `ready-no-interior` tests should
still pass (Toolbar renders nothing visible yet beyond an empty bar); if any
snapshot/structural assertion breaks, update it to account for the new wrapper.

- [ ] **Step 7: Commit**

```bash
git add src/components/Toolbar.tsx src/components/Toolbar.test.tsx src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "feat: add empty Toolbar shell, mount in MissionWorkspace's ready-no-interior phase"
```

---

### Task 7: `Sidebar.tsx` — offset below the new Toolbar

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/Sidebar.test.tsx` (add a test if none checks positioning today — check first)

- [ ] **Step 1: Implement**

```tsx
// src/components/Sidebar.tsx
import { TOOLBAR_HEIGHT_PX } from './Toolbar'

const SIDEBAR_STYLE = {
  position: 'absolute' as const,
  top: TOOLBAR_HEIGHT_PX, // was 0 — leaves room for the fixed Toolbar above it
  left: 0,
  bottom: 0,
  width: 280,
  overflowY: 'auto' as const,
  background: 'white',
  borderRight: '1px solid #ccc',
  zIndex: 1000,
}
```

- [ ] **Step 2: Run the full suite**

Run: `npm test -- --run`
Expected: PASS — this is a pure style-value change, no behavioral assertions
should reference the literal `top` value unless a test specifically inspects
inline styles (grep `Sidebar.test.tsx` for `top` first to check).

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "fix: offset Sidebar below the new fixed Toolbar"
```

---

### Task 8: Relocate `UndoRedoControls` into `Toolbar`

**Files:**
- Modify: `src/components/SiteMapView.tsx`
- Modify: `src/pages/MissionWorkspace.tsx`
- Modify: `src/components/SiteMapView.test.tsx`

`UndoRedoControls` needs `planId` and `onChanged` (currently `SiteMapView`'s
internal `loadAll`) — both only exist inside `SiteMapView`, not
`MissionWorkspace`. `MissionWorkspace` already has `planId` in scope
(`phase.exteriorPlan.id`, in the `ready-no-interior` case), so `UndoRedoControls`
moves there directly. `onChanged` is the only real gap: `SiteMapView`'s `loadAll`
is internal, not reachable from outside. Rather than a portal (real complexity
for what should be simple, and this component has no local-state coupling to
`SiteMapView` the way the guide-line panel does in Task 9), add a `reloadKey`
prop to `SiteMapView`: a number that, when changed, re-triggers the existing
mount `useEffect(() => { loadAll() }, [planId])` by adding `reloadKey` to that
effect's dependency array. `MissionWorkspace` bumps a `reloadKey` state value as
`UndoRedoControls`'s new `onChanged`. This keeps `SiteMapView` self-contained (no
portal, no ref plumbing) at the cost of one new prop.

- [ ] **Step 1: Write the failing test for `SiteMapView`'s new `reloadKey` prop**

```tsx
// appended to src/components/SiteMapView.test.tsx
it('re-runs loadAll when reloadKey changes, even if planId does not', async () => {
  const { rerender } = render(<SiteMapView {...baseProps} reloadKey={0} />)
  await waitFor(() => expect(listFeltPointsForPlan).toHaveBeenCalledTimes(1))
  rerender(<SiteMapView {...baseProps} reloadKey={1} />)
  await waitFor(() => expect(listFeltPointsForPlan).toHaveBeenCalledTimes(2))
})
```

(Match this file's existing `baseProps`/mock conventions — read the top of
`SiteMapView.test.tsx` before writing this, don't guess the mock shape.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/SiteMapView.test.tsx`
Expected: FAIL — `reloadKey` isn't a recognized prop, and the effect doesn't
depend on it yet.

- [ ] **Step 3: Implement in `SiteMapView.tsx`**

Remove `UndoRedoControls` from the `pinned` block entirely (delete the import too
if nothing else in the file uses it). Add `reloadKey` to `SiteMapViewProps` and
to the mount effect's dependency array:

```tsx
export interface SiteMapViewProps {
  // ...existing props...
  reloadKey?: number
}
```

```tsx
  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadKey is a
    // deliberate external re-trigger (bumped by MissionWorkspace after an
    // undo/redo, since UndoRedoControls now lives in Toolbar, outside this
    // component — see Task 8 of the toolbar-ribbon plan); missionId is
    // intentionally excluded, same reasoning as before.
  }, [planId, reloadKey])
```

- [ ] **Step 4: Implement in `MissionWorkspace.tsx`**

```tsx
import { UndoRedoControls } from '../components/UndoRedoControls'
```

```tsx
  const [reloadKey, setReloadKey] = useState(0)
```

```tsx
        <div style={FLEX_COLUMN_FULL_HEIGHT_STYLE}>
          <Toolbar>
            <UndoRedoControls planId={phase.exteriorPlan.id} onChanged={() => setReloadKey((k) => k + 1)} />
          </Toolbar>
          <NonBlockingErrorBanner error={nonBlockingError} />
          <div style={MAP_WRAPPER_STYLE}>
            <SiteMapView
              planId={phase.exteriorPlan.id}
              missionId={phase.mission.id}
              missionOrigin={{ lat: originLat!, lng: originLng! }}
              initialBuildingFootprint={phase.mission.buildingFootprint}
              fitBounds={phase.fitBounds}
              reloadKey={reloadKey}
            />
          </div>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/components/SiteMapView.test.tsx src/pages/MissionWorkspace.test.tsx`
Expected: PASS. `SiteMapView.test.tsx` almost certainly has an existing test
asserting `UndoRedoControls` renders inside it — that assertion must be removed/
updated, not left to fail.

- [ ] **Step 6: Run the full suite**

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "feat: move UndoRedoControls into Toolbar via a reloadKey prop on SiteMapView"
```

---

### Task 9: Relocate the "Ligne guide" section into `Toolbar`

**Files:**
- Modify: `src/components/SiteMapView.tsx`
- Modify: `src/components/SiteMapView.test.tsx`

The `ligne-guide` accordion section (`SiteMapView.tsx:842-907` per the spec's
verified inventory) has 8 elements: N/S, E/O, 45°, 135°, a custom-angle input,
and **Valider**/**Placer ici**/**Effacer** buttons — all driven by state/handlers
already local to `SiteMapView` (`guideLineBearing`, `customBearingInput`,
`handleSelectBearing`, etc. — read the current section's exact JSX before
touching it, this task moves it, not rewrites its logic).

Same constraint as Task 8: this content lives inside `SiteMapView`, but must
render inside `Toolbar`, which is now a sibling one level up in
`MissionWorkspace`. Unlike `UndoRedoControls` (a small, independent component),
the guide-line controls are deeply wired into `SiteMapView`'s own local state —
lifting all of it to `MissionWorkspace` would be a much bigger, riskier change.
**Use a portal here** (the approach considered and set aside in Task 8, but
appropriate now): render the guide-line control panel through
`ReactDOM.createPortal` into a DOM node that `Toolbar` exposes via a ref.

- [ ] **Step 1: `Toolbar.tsx` exposes a named slot**

```tsx
// src/components/Toolbar.tsx
import { type ReactNode } from 'react'

export interface ToolbarProps {
  children?: ReactNode
  /** DOM node other components portal secondary content into (e.g. the
   * guide-line control panel, which stays logically owned/stateful inside
   * SiteMapView but must render inside this fixed bar — see Task 9 of the
   * toolbar-ribbon plan). */
  guideLineSlotRef?: React.Ref<HTMLDivElement>
}

export function Toolbar({ children, guideLineSlotRef }: ToolbarProps) {
  return (
    <div role="toolbar" style={TOOLBAR_STYLE}>
      {children}
      <div ref={guideLineSlotRef} />
    </div>
  )
}
```

- [ ] **Step 2: `MissionWorkspace.tsx` owns the ref, passes the node down to `SiteMapView`**

```tsx
  const guideLineSlotRef = useRef<HTMLDivElement>(null)
```

```tsx
          <Toolbar guideLineSlotRef={guideLineSlotRef}>
            <UndoRedoControls planId={phase.exteriorPlan.id} onChanged={() => setReloadKey((k) => k + 1)} />
          </Toolbar>
```

```tsx
            <SiteMapView
              // ...existing props...
              guideLineSlotEl={guideLineSlotRef.current}
            />
```

- [ ] **Step 3: `SiteMapView.tsx` portals the guide-line panel into that node, removes the accordion section**

```tsx
import { createPortal } from 'react-dom'
```

```tsx
export interface SiteMapViewProps {
  // ...existing props...
  guideLineSlotEl: HTMLDivElement | null
}
```

Remove the `{ id: 'ligne-guide', ... }` entry from `Sidebar`'s `sections` array.
In its place, render (near the component's other portal-free JSX, order doesn't
matter since it's portaled away):

```tsx
      {guideLineSlotEl && createPortal(
        <div>
          {/* the exact same 8 elements/JSX previously inside the ligne-guide
              accordion section's `content` — moved verbatim, not rewritten */}
        </div>,
        guideLineSlotEl
      )}
```

- [ ] **Step 4: Update tests**

`SiteMapView.test.tsx` needs a `guideLineSlotEl` value in every render call
(a plain `document.createElement('div')` is enough) for the guide-line assertions
to keep finding the controls — Testing Library's `screen` queries the whole
document, so a portaled node is still found by `screen.getByRole(...)` etc. even
though it's not a DOM descendant of the component under test. Existing guide-line
tests should keep passing once this element is supplied; if any test specifically
asserts the controls are *inside* a `Sidebar`/`Accordion` DOM ancestor, that
assertion needs to change (they're no longer there).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/components/SiteMapView.test.tsx src/pages/MissionWorkspace.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full suite**

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/Toolbar.tsx src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "feat: portal the guide-line control panel into Toolbar, remove its accordion section"
```

---

### Task 10: Reserved Placer/Tracer/Imprimer placeholder buttons

**Files:**
- Modify: `src/components/Toolbar.tsx`
- Modify: `src/components/Toolbar.test.tsx`

Per spec §5: visible, disabled, with a tooltip — so Phase 2 doesn't have to
reshuffle the bar's layout again.

- [ ] **Step 1: Write the failing test**

```tsx
// appended to src/components/Toolbar.test.tsx
it('renders disabled Placer and Tracer placeholders with a tooltip', () => {
  render(<Toolbar />)
  const placer = screen.getByRole('button', { name: /placer/i })
  const tracer = screen.getByRole('button', { name: /tracer/i })
  expect(placer).toBeDisabled()
  expect(tracer).toBeDisabled()
  expect(placer).toHaveAttribute('title', expect.stringMatching(/bientôt disponible/i))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/Toolbar.test.tsx`
Expected: FAIL — no such buttons exist yet.

- [ ] **Step 3: Implement**

```tsx
export function Toolbar({ children, guideLineSlotRef }: ToolbarProps) {
  return (
    <div role="toolbar" style={TOOLBAR_STYLE}>
      {children}
      <div ref={guideLineSlotRef} />
      <button disabled title="Bientôt disponible (Phase 2)">Placer</button>
      <button disabled title="Bientôt disponible (Phase 2)">Tracer</button>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/Toolbar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Toolbar.tsx src/components/Toolbar.test.tsx
git commit -m "feat: add reserved, disabled Placer/Tracer buttons to Toolbar"
```

(The "Imprimer" placeholder is added in Task 11 alongside the rest of the
Fichier menu, since it lives in `MenuBar`, not `Toolbar` directly.)

---

## Chunk 2 review checkpoint

Dispatch `plan-document-reviewer` for Chunk 1 + Chunk 2 together before
continuing to Chunk 3 — this is the natural boundary where the toolbar
skeleton is fully functional (Undo/Redo + guide-line relocated, reserved
slots visible) but before the menu bar (a separately reviewable unit) begins.

---

## Chunk 3: `MenuBar` — Fichier menu

### Task 11: `MenuBar.tsx` skeleton + Fichier menu

**Files:**
- Create: `src/components/MenuBar.tsx`
- Create: `src/components/MenuBar.test.tsx`
- Modify: `src/components/Toolbar.tsx`
- Modify: `src/pages/MissionWorkspace.tsx`

**Files (context needed before writing):** read `src/components/MissionForm.tsx`'s
`onCreated` prop and `src/pages/MissionWorkspace.tsx`'s `creating-mission` case to
confirm exactly how a mission gets created today, so "Nouvelle mission" wires
correctly (it should call `onNavigateToNewMission`, from Task 5 — that remounts
`MissionWorkspace` fresh into `creating-mission`, which already renders
`MissionForm`; no new creation logic needed here).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/MenuBar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MenuBar } from './MenuBar'

const baseProps = {
  onNavigateToMissionList: vi.fn(),
  onNavigateToNewMission: vi.fn(),
  onShowMissionInfo: vi.fn(),
  onSaveNow: vi.fn().mockResolvedValue(undefined),
  onDuplicateMission: vi.fn().mockResolvedValue(undefined),
  onQuitMission: vi.fn(),
}

describe('MenuBar — Fichier', () => {
  it('calls onNavigateToNewMission when "Nouvelle mission" is clicked', async () => {
    render(<MenuBar {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /nouvelle mission/i }))
    expect(baseProps.onNavigateToNewMission).toHaveBeenCalled()
  })

  it('calls onNavigateToMissionList when "Mes missions" is clicked', async () => {
    render(<MenuBar {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /mes missions/i }))
    expect(baseProps.onNavigateToMissionList).toHaveBeenCalled()
  })

  it('calls onSaveNow when "Enregistrer" is clicked, and reports an error if it rejects', async () => {
    const onSaveNow = vi.fn().mockRejectedValue(new Error('sync failed'))
    render(<MenuBar {...baseProps} onSaveNow={onSaveNow} />)
    fireEvent.click(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /^enregistrer$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('sync failed')
  })

  it('calls onDuplicateMission when "Enregistrer sous" is clicked', async () => {
    render(<MenuBar {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /enregistrer sous/i }))
    expect(baseProps.onDuplicateMission).toHaveBeenCalled()
  })

  it('renders "Imprimer" disabled with a tooltip', async () => {
    render(<MenuBar {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /fichier/i }))
    const item = await screen.findByRole('menuitem', { name: /imprimer/i })
    expect(item).toHaveAttribute('aria-disabled', 'true')
  })

  it('calls onQuitMission when "Quitter la mission" is clicked', async () => {
    render(<MenuBar {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: /fichier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /quitter la mission/i }))
    expect(baseProps.onQuitMission).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/MenuBar.test.tsx`
Expected: FAIL — `MenuBar.tsx` doesn't exist.

- [ ] **Step 3: Implement**

```tsx
// src/components/MenuBar.tsx
import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

export interface MenuBarProps {
  onNavigateToMissionList: () => void
  onNavigateToNewMission: () => void
  onShowMissionInfo: () => void
  onSaveNow: () => Promise<void>
  onDuplicateMission: () => Promise<void>
  onQuitMission: () => void
}

// Radix's DropdownMenu is headless (no visual styling of its own — see
// toolbar-ribbon spec §6 for why it was chosen over a full ribbon library).
// Fichier's content/behavior is per spec §4. Modifier/Affichage are added in
// Chunk 4 (Task 12/13) as siblings of this same top-level <DropdownMenu.Root>
// pattern — copy this structure, don't invent a new one per menu.
export function MenuBar({
  onNavigateToMissionList,
  onNavigateToNewMission,
  onShowMissionInfo,
  onSaveNow,
  onDuplicateMission,
  onQuitMission,
}: MenuBarProps) {
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSaveNow() {
    setSaveError(null)
    try {
      await onSaveNow()
    } catch (err) {
      // Best-effort action (spec §7) — a dismissible inline message, never a
      // page-blocking error; the OfflineIndicator badge already shows the
      // real synced/pending state regardless of whether this succeeded.
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDuplicate() {
    try {
      await onDuplicateMission()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {saveError && (
        <p role="alert">
          {saveError}
          <button onClick={() => setSaveError(null)}>Fermer</button>
        </p>
      )}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button>Fichier</button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item onSelect={onNavigateToNewMission}>Nouvelle mission</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={onNavigateToMissionList}>Mes missions</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={onShowMissionInfo}>Infos de la mission</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={handleSaveNow}>Enregistrer</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={handleDuplicate}>Enregistrer sous</DropdownMenu.Item>
            <DropdownMenu.Item disabled title="Génération de rapport pas encore disponible">Imprimer</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={onQuitMission}>Quitter la mission</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/MenuBar.test.tsx`
Expected: PASS

- [ ] **Step 5: Mount `MenuBar` in `Toolbar`, wire real handlers in `MissionWorkspace`**

`Toolbar.tsx`: add `menuBar?: ReactNode` prop (rendered first, before `children`)
— keep `Toolbar` itself menu-agnostic, `MissionWorkspace` supplies the actual
`<MenuBar>` element, consistent with how `children`/`guideLineSlotRef` already
work.

`MissionWorkspace.tsx`:

```tsx
import { MenuBar } from '../components/MenuBar'
import { duplicateMission } from '../data/missionsRepo'
```

```tsx
          <Toolbar
            guideLineSlotRef={guideLineSlotRef}
            menuBar={
              <MenuBar
                onNavigateToMissionList={onNavigateToMissionList}
                onNavigateToNewMission={onNavigateToNewMission}
                onShowMissionInfo={() => { /* Task after this one may add a real modal; a minimal window.alert-free placeholder is fine here, not yet specified beyond "opens" per spec §4 */ }}
                onSaveNow={flushNow}
                onDuplicateMission={async () => {
                  const { mission } = await duplicateMission(phase.mission)
                  onNavigateToMissionList() // simplest correct behavior: land back on the list, showing the new duplicate — no separate "jump straight into the new mission" requirement was specified
                }}
                onQuitMission={onNavigateToMissionList}
              />
            }
          >
```

`flushNow` needs `useOfflineSync()` called inside `MissionWorkspace` — check
whether it's already called there or only in `App.tsx`/elsewhere before adding a
duplicate subscription; if only in `App.tsx`, either lift its result down as a
prop or call `useOfflineSync()` again here (the hook's internal state is
independent per call site, but a 2nd `mount`-triggered flush attempt is harmless
per its own in-flight guard — confirm this reasoning holds by re-reading
`useOfflineSync.ts`'s doc comment before deciding either way).

- [ ] **Step 6: Run the full suite**

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/MenuBar.tsx src/components/MenuBar.test.tsx src/components/Toolbar.tsx src/pages/MissionWorkspace.tsx
git commit -m "feat: add MenuBar with Fichier menu, wire into Toolbar/MissionWorkspace"
```

---

## Chunk 4: Modifier + Affichage menus, final wiring, verification

### Task 12: `MenuBar` — Modifier menu

**Files:**
- Modify: `src/components/MenuBar.tsx`
- Modify: `src/components/MenuBar.test.tsx`

Per spec §4: Annuler/Refaire (duplicate access to the same undo/redo already in
`Toolbar` — needs `planId` passed down to call `undo(planId)`/`redo(planId)` from
`src/offline/actionHistory.ts` directly, same functions `UndoRedoControls` already
wraps) + "Supprimer l'élément sélectionné" **disabled** in this phase (per this
plan's Task-writing-time scope decision — no global "selected element" concept
exists, and introducing one is out of scope for a toolbar reorganization; flag
this to Laurent as a scope note, same as the `duplicateMission` depth decision in
Task 4).

- [ ] **Step 1: Write the failing tests**

```tsx
// appended to src/components/MenuBar.test.tsx
describe('MenuBar — Modifier', () => {
  it('calls undo(planId) when "Annuler" is clicked', async () => {
    render(<MenuBar {...baseProps} planId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: /modifier/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /^annuler$/i }))
    expect(actionHistory.undo).toHaveBeenCalledWith('p1')
  })

  it('renders "Supprimer l\'élément sélectionné" disabled', async () => {
    render(<MenuBar {...baseProps} planId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: /modifier/i }))
    expect(await screen.findByRole('menuitem', { name: /supprimer l'élément/i })).toHaveAttribute('aria-disabled', 'true')
  })
})
```

(Add `vi.mock('../offline/actionHistory')` and `import * as actionHistory from
'../offline/actionHistory'` at the top of the test file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/MenuBar.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

Add `planId: string` to `MenuBarProps`, import `undo, redo` from
`'../offline/actionHistory'`, add a 2nd `<DropdownMenu.Root>` next to Fichier's:

```tsx
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild><button>Modifier</button></DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item onSelect={() => undo(planId)}>Annuler</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => redo(planId)}>Refaire</DropdownMenu.Item>
            <DropdownMenu.Item disabled title="Pas encore disponible — aucune sélection globale n'existe aujourd'hui">
              Supprimer l'élément sélectionné
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
```

- [ ] **Step 4: Run tests, update `MissionWorkspace.tsx`'s `<MenuBar>` call site to pass `planId`**

Run: `npm test -- --run src/components/MenuBar.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/MenuBar.tsx src/components/MenuBar.test.tsx src/pages/MissionWorkspace.tsx
git commit -m "feat: add Modifier menu (Annuler/Refaire, reserved Supprimer)"
```

---

### Task 13: `MenuBar` — Affichage menu

**Files:**
- Modify: `src/components/MenuBar.tsx`
- Modify: `src/components/MenuBar.test.tsx`
- Modify: `src/components/SiteMapView.tsx`
- Modify: `src/pages/MissionWorkspace.tsx`

Per spec §4: Zoom +/− (duplicate of the map's own existing Leaflet control — a
thin wrapper calling the map instance's `zoomIn()`/`zoomOut()`, needs a map-ref
plumbed down; check `src/components/MapView.tsx` for whether it already exposes
one before adding a new mechanism), "Basculer Calques" (uses Task 2's new
controlled-Accordion support — lift "is Calques open" state into `SiteMapView`),
"Mode édition" (2nd trigger for the existing `editMode` checkbox, per spec §4's
clarified wording — checkbox stays in place), "Recentrer sur les parcelles" and
"Fond de carte" **disabled** (deferred per spec §4's "Note de portée").

- [ ] **Step 1: Write the failing tests**

```tsx
// appended to src/components/MenuBar.test.tsx
describe('MenuBar — Affichage', () => {
  it('calls onToggleCalques when "Basculer Calques" is clicked', async () => {
    render(<MenuBar {...baseProps} planId="p1" onToggleCalques={vi.fn()} onToggleEditMode={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /affichage/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /basculer calques/i }))
    expect(baseProps.onToggleCalques).toHaveBeenCalled()
  })

  it('calls onToggleEditMode when "Mode édition" is clicked', async () => {
    const onToggleEditMode = vi.fn()
    render(<MenuBar {...baseProps} planId="p1" onToggleCalques={vi.fn()} onToggleEditMode={onToggleEditMode} />)
    fireEvent.click(screen.getByRole('button', { name: /affichage/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /mode édition/i }))
    expect(onToggleEditMode).toHaveBeenCalled()
  })

  it('renders "Recentrer sur les parcelles" and "Fond de carte" disabled', async () => {
    render(<MenuBar {...baseProps} planId="p1" onToggleCalques={vi.fn()} onToggleEditMode={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /affichage/i }))
    expect(await screen.findByRole('menuitem', { name: /recentrer/i })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: /fond de carte/i })).toHaveAttribute('aria-disabled', 'true')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/MenuBar.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `MenuBar`'s Affichage menu**

Add `onToggleCalques: () => void` and `onToggleEditMode: () => void` to
`MenuBarProps`. Zoom +/− needs a map instance — if `MapView.tsx` doesn't already
expose a ref/imperative handle, add `onZoomIn`/`onZoomOut` callback props to
`MenuBarProps` too instead of reaching for the map directly from here (keeps
`MenuBar` map-library-agnostic, consistent with it being a pure presentation
component elsewhere in this plan).

```tsx
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild><button>Affichage</button></DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item onSelect={onZoomIn}>Zoom +</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={onZoomOut}>Zoom −</DropdownMenu.Item>
            <DropdownMenu.Item disabled title="Bientôt disponible">Recentrer sur les parcelles</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={onToggleCalques}>Basculer Calques</DropdownMenu.Item>
            <DropdownMenu.Item disabled title="Bientôt disponible">Fond de carte</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={onToggleEditMode}>Mode édition</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
```

Both `calquesOpen` and `editMode` are triggered from `MenuBar`, which is a
`MissionWorkspace` child, not a `SiteMapView` child — so both pieces of state
move up to `MissionWorkspace` and get threaded down to `SiteMapView` as fully
controlled props. This is simpler to reason about than giving `SiteMapView` a
dual controlled/uncontrolled mode for its own internal state (unlike
`Accordion`'s Task 2 duality, which exists because `Accordion` has many
sections and only one needs external control — here there's exactly one owner
of each flag, so full lifting is the more direct fix). `editMode` currently
lives entirely inside `SiteMapView` (`SiteMapView.tsx:166`) — every internal
reference to it becomes a prop reference instead of local state.

- [ ] **Step 4: `MissionWorkspace.tsx` — own `calquesOpen` and `editMode`**

```tsx
  const [calquesOpen, setCalquesOpen] = useState(false) // matches the Calques section's current defaultOpen value — check it before assuming false
  const [editMode, setEditMode] = useState(false) // matches SiteMapView.tsx:166's current initial value
```

Pass both down, plus their setters, to `SiteMapView` and to `MenuBar`:

```tsx
            <SiteMapView
              // ...existing props...
              calquesOpen={calquesOpen}
              onToggleCalques={() => setCalquesOpen((v) => !v)}
              editMode={editMode}
              onEditModeChange={setEditMode}
            />
```

```tsx
              <MenuBar
                // ...existing props...
                onToggleCalques={() => setCalquesOpen((v) => !v)}
                onToggleEditMode={() => setEditMode((v) => !v)}
              />
```

- [ ] **Step 5: `SiteMapView.tsx` — accept both as controlled props**

Remove the internal `const [editMode, setEditMode] = useState(false)` (line 166)
entirely; add `editMode: boolean` and `onEditModeChange: (v: boolean) => void` to
`SiteMapViewProps`, and update the checkbox (`SiteMapView.tsx:711-715`) to read
`checked={editMode}`/`onChange={(e) => onEditModeChange(e.target.checked)}`. Add
`calquesOpen: boolean`/`onToggleCalques: () => void` to `SiteMapViewProps`, and
pass `open={calquesOpen}`/`onToggle={() => onToggleCalques()}` on the "Calques"
section's entry in `Sidebar`'s `sections` array (Task 2's controlled mode).

- [ ] **Step 6: Run tests, fix fallout**

Run: `npm test -- --run`
Expected: PASS. This task moves state ownership across 2 components — every
existing `SiteMapView.test.tsx` test that renders the component now needs
`editMode`/`onEditModeChange`/`calquesOpen`/`onToggleCalques` in its props
(TypeScript will point at every stranded call site); budget extra time versus
other tasks in this plan for this mechanical-but-widespread update.

- [ ] **Step 7: Commit**

```bash
git add src/components/MenuBar.tsx src/components/MenuBar.test.tsx src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx src/pages/MissionWorkspace.tsx
git commit -m "feat: add Affichage menu (zoom, Basculer Calques, Mode édition, reserved items)"
```

---

### Task 14: Final full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the complete test suite**

Run: `npm test -- --run`
Expected: PASS, every test file, no skips.

- [ ] **Step 2: Run the TypeScript build**

Run: `npm run build`
Expected: succeeds with zero TypeScript errors — the only point in this whole
plan that type-checks the full tree (same reasoning as the undo-redo plan's own
final build-check step: `vitest` transpiles without type-checking, so a stale
call site elsewhere in the app could pass every test and still fail here).

- [ ] **Step 3: Manual smoke check in the running app**

Not automatable — a quick pass in the browser: open a mission, confirm the
Toolbar renders at the top (Undo/Redo, guide-line button, disabled Placer/Tracer,
Fichier/Modifier/Affichage menus all visible without opening any accordion),
click through each menu once, confirm nothing throws in the console. Use the
`superpowers:` verification workflow available in this environment
(`preview_start` + browser tools) rather than asking Laurent to check manually.

- [ ] **Step 4: Commit any final fixes found during manual verification, if needed**

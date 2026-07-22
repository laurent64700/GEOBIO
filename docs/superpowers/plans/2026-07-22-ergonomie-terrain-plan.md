# Ergonomie terrain — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace GEOBIO's 4 floating corner panels with one functional sidebar, add the
missing manual "point ressenti" placement tool, evolve the guide line and compass, add a
permanent global-assessment bar, geocode mission addresses, let Laurent resume an
existing mission, and package the app for one-click launch — so Laurent can run a real
field test the week of 2026-07-27.

**Architecture:** 8 ordered chunks, one per package from the design spec, each
independently committed/tested/shippable. Chunk 1 (sidebar shell) is foundational; Chunk
2 (felt-point tool) fills its pinned band; Chunk 3 (guide-line constraint) depends on
Chunk 2's `placementMode.kind === 'felt-point'`. Chunk 7 (mission list/resume) depends on
Chunk 6 (geocoding) having already added the required `mapCenter` field to
`WorkspacePhase`'s `'setting-origin'` variant — Chunk 7's `MissionWorkspace` prop wiring
constructs that variant and needs the field to already exist. Chunks 4, 5, 8, and 6
itself are independent of each other and of Chunks 1-3.

**Tech Stack:** Same as the rest of GEOBIO — Vite, React, TypeScript, react-leaflet,
Vitest + Testing Library, Supabase. No new dependencies except a plain `fetch` call to
the free BAN geocoding API (Chunk 6) — no SDK needed, same pattern as
`cadastreService.ts`'s IGN WFS calls.

**Spec:** `docs/superpowers/specs/2026-07-22-ergonomie-terrain-design.md` — read it for
full rationale; this plan implements it section by section (§3→Chunk 1, §4→Chunk 2,
§5→Chunk 3, §6→Chunk 4, §7→Chunk 5, §8→Chunk 6, §9→Chunk 7, §10→Chunk 8).

**Worktree:** To be created via superpowers:using-git-worktrees before starting Task 1,
branch `feature/ergonomie-terrain`, based on `master` at the commit that adds this plan
file. Baseline before starting: full suite green, `tsc -b --noEmit` clean (verify as
Task 0 below).

---

## Chunk 0: Baseline verification

### Task 0: Confirm clean baseline in the new worktree

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite and typecheck**

Run: `node_modules/.bin/vitest.cmd run && node_modules/.bin/tsc.cmd -b --noEmit`
Expected: all tests pass (276 at last count on `master`), `tsc` clean. If either fails,
STOP and escalate — do not build on a broken baseline.

---

## Chunk 1: Panneau latéral (Sidebar shell)

**Goal:** Replace the 4 `OverlayPanel` corners in `SiteMapView.tsx` with one `Sidebar`
component: a pinned top band (empty for now — Chunk 2 fills it) + a collapsible accordion
holding the same panels that exist today, unchanged. Pure relocation, zero behavior
change to any child component.

### Task 1: Create `Accordion` and `Sidebar` shell components

**Files:**
- Create: `src/components/Accordion.tsx` + `src/components/Accordion.test.tsx`
- Create: `src/components/Sidebar.tsx` + `src/components/Sidebar.test.tsx`

- [ ] **Step 1: Write failing tests for `Accordion`**

```tsx
// src/components/Accordion.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Accordion } from './Accordion'

describe('Accordion', () => {
  it('renders each section title as a toggle and its content', () => {
    render(
      <Accordion
        sections={[
          { id: 'a', title: 'Section A', defaultOpen: true, content: <p>Content A</p> },
          { id: 'b', title: 'Section B', defaultOpen: false, content: <p>Content B</p> },
        ]}
      />
    )
    expect(screen.getByText('Content A')).toBeVisible()
    // A native <details> without `open` still renders its children in the DOM
    // (just visually hidden) — assert closed via the <details> element's own
    // `open` attribute rather than by absence from the DOM.
    const detailsB = screen.getByText('Section B').closest('details')
    expect(detailsB).not.toHaveAttribute('open')
  })

  it('toggling a section open/closed does not affect other sections (independent, not single-open)', () => {
    render(
      <Accordion
        sections={[
          { id: 'a', title: 'Section A', defaultOpen: true, content: <p>Content A</p> },
          { id: 'b', title: 'Section B', defaultOpen: false, content: <p>Content B</p> },
        ]}
      />
    )
    const summaryB = screen.getByText('Section B')
    fireEvent.click(summaryB)
    const detailsA = screen.getByText('Section A').closest('details')
    const detailsB = summaryB.closest('details')
    expect(detailsA).toHaveAttribute('open')
    expect(detailsB).toHaveAttribute('open')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/components/Accordion.test.tsx`
Expected: FAIL — `Cannot find module './Accordion'`

- [ ] **Step 3: Implement `Accordion`**

```tsx
// src/components/Accordion.tsx
import type { ReactNode } from 'react'

export interface AccordionSection {
  id: string
  title: string
  defaultOpen: boolean
  content: ReactNode
}

export interface AccordionProps {
  sections: AccordionSection[]
}

// Native <details>/<summary>: independent open/close per section (not
// single-open) is the simplest correct behavior and needs no state of our
// own — see spec §12, "par défaut technique le plus simple : indépendant,
// comme <details> HTML natif".
export function Accordion({ sections }: AccordionProps) {
  return (
    <div>
      {sections.map((section) => (
        <details key={section.id} open={section.defaultOpen}>
          <summary>{section.title}</summary>
          {section.content}
        </details>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/components/Accordion.test.tsx`
Expected: PASS

- [ ] **Step 5: Write a failing test for `Sidebar`**

```tsx
// src/components/Sidebar.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('renders the pinned band content and the accordion sections', () => {
    render(
      <Sidebar
        pinned={<p>Pinned content</p>}
        sections={[{ id: 'x', title: 'X', defaultOpen: true, content: <p>Section X content</p> }]}
      />
    )
    expect(screen.getByText('Pinned content')).toBeInTheDocument()
    expect(screen.getByText('Section X content')).toBeVisible()
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/components/Sidebar.test.tsx`
Expected: FAIL — `Cannot find module './Sidebar'`

- [ ] **Step 7: Implement `Sidebar`**

```tsx
// src/components/Sidebar.tsx
import type { ReactNode } from 'react'
import { Accordion, type AccordionSection } from './Accordion'

export interface SidebarProps {
  pinned: ReactNode
  sections: AccordionSection[]
}

// Full-height, fixed-width, left-hand column — replaces the 4 corner
// OverlayPanels in SiteMapView.tsx (spec §3). Plain functional chrome only,
// no visual polish (Laurent: "fonctionnel pur, comme Paint").
const SIDEBAR_STYLE = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  bottom: 0,
  width: 280,
  overflowY: 'auto' as const,
  background: 'white',
  borderRight: '1px solid #ccc',
  zIndex: 1000,
}

const PINNED_STYLE = {
  padding: 8,
  borderBottom: '2px solid #ccc',
}

export function Sidebar({ pinned, sections }: SidebarProps) {
  return (
    <div style={SIDEBAR_STYLE}>
      <div style={PINNED_STYLE}>{pinned}</div>
      <Accordion sections={sections} />
    </div>
  )
}
```

- [ ] **Step 8: Run to verify it passes, then typecheck**

Run: `node_modules/.bin/vitest.cmd run src/components/Sidebar.test.tsx src/components/Accordion.test.tsx`
Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: both PASS, tsc clean.

- [ ] **Step 9: Commit**

```bash
git add src/components/Accordion.tsx src/components/Accordion.test.tsx src/components/Sidebar.tsx src/components/Sidebar.test.tsx
git commit -m "Add Accordion and Sidebar shell components (spec §3, no wiring yet)"
```

### Task 2: Wire `Sidebar` into `SiteMapView.tsx`, replacing the 4 `OverlayPanel` corners

**Files:**
- Modify: `src/components/SiteMapView.tsx`
- Modify: `src/components/SiteMapView.test.tsx`

**Scope, exactly per spec §3:**
- Pinned band: empty placeholder for now (`<p>Point ressenti — à venir (Chunk 2)</p>`),
  Chunk 2 replaces it with the real `FeltPointPicker`.
- Accordion sections, in this order, each `defaultOpen: false` except the first:
  1. **Ressenti terrain** — actually lives in the pinned band, not a section (see
     above) — do not create a "Ressenti terrain" accordion section, the pinned band IS
     that content once Chunk 2 lands.
  2. **Grille / Réseaux** (`defaultOpen: true` — the next most-used tool after point
     ressenti) — `GridCreationPanel` (with its `GRID_CREATION_WRAPPER_STYLE` wrapper,
     unchanged) + the existing bottom-left edit-mode card (checkbox +
     Annuler/Réinitialiser), moved here verbatim.
  3. **Calques** — `LayerPanel`, unchanged props.
  4. **Phénomènes** — `PhenomenonPicker`, unchanged props.
  5. **Tracés eau/faille** — the "Tracer l'eau"/"Tracer une faille" buttons +
     conditional `FreeformMetadataForm` block, unchanged.
  6. **Ligne guide** — the guide-line controls card, unchanged (Chunk 3 modifies its
     internals later, not this task).
  7. **Bâtiment** — the conditional building-status card, unchanged, still only
     rendered when `buildingFootprint !== null || buildingSearchExhausted || buildingError !== null`.
  8. **Bagua** — `BaguaLegendCollapsed`, still only rendered when the Bagua layer is
     visible.
- The orthogonality-review card (`reviewTarget`/`reviewSuggestion`) is **not** moved
  into the sidebar — keep it as a small floating `OverlayPanel corner="bottom-right"`
  directly on the map, exactly as it renders today (simplest correct choice per spec §3
  and §12 — this card is transient/contextual, not a tool to browse).
- Delete the `OverlayPanel` import usages for `top-left`/`top-right`/`bottom-left`
  entirely; keep `OverlayPanel`/its import only for the remaining `bottom-right`
  orthogonality card.

- [ ] **Step 1: Read the current full render return of `SiteMapView.tsx` in the worktree**

Before editing, re-read `src/components/SiteMapView.tsx`'s return statement in full (it
was last read as part of this plan's research at lines ~520-769 on `master`, but always
re-verify against the actual worktree state before editing — other chunks may have
landed first if executed out of order). Confirm every corner's exact current JSX so
nothing is dropped or altered while moving it.

- [ ] **Step 2: Update `SiteMapView.test.tsx`'s existing assertions that reference now-removed structural details**

Search `SiteMapView.test.tsx` for any test that asserts on the OLD 4-corner
`OverlayPanel` layout structurally (as opposed to just querying by role/label, which
should keep working unchanged since the underlying buttons/inputs aren't renamed). Most
existing tests query by accessible role/name/label and should be unaffected by this pure
relocation — if you find one that isn't, note it, fix its query, and list it in your
final report. Do not weaken any assertion's actual behavioral check to make it pass.

**One test needs a substantive rewrite, not just a selector fix — find it by name:**
`'stacks the orthogonality panel and the Bagua legend in a single bottom-right overlay
when both are visible'` (around line 681). It's a regression test for the OLD
requirement that the orthogonality-review card and the Bagua legend share one
`bottom-right` `OverlayPanel` wrapper (asserts both via `toContainElement` plus an
exact-count-1 check on absolutely-positioned bottom+right divs). Once Bagua moves into
the sidebar accordion (this task), that premise is gone — the scenario it guards against
(two overlapping bottom-right `OverlayPanel` siblings) can no longer happen once Bagua
isn't in that corner at all. Rewrite it to assert only that the orthogonality card
renders inside the lone remaining `bottom-right` `OverlayPanel`; drop the Bagua-presence
assertion here (Bagua's presence in the sidebar accordion is covered by wherever this
task's new sidebar-content tests land, not by this test).

- [ ] **Step 3: Replace the 3 relocated `OverlayPanel` usages with one `<Sidebar>` in `SiteMapView.tsx`**

Build the `sections` array as described above, each `content` being the exact JSX
currently inside that corner (verbatim, just moved). Example shape (fill in the real
JSX from Step 1, this is the skeleton only):

```tsx
<Sidebar
  pinned={<p>Point ressenti — à venir (Chunk 2)</p>}
  sections={[
    {
      id: 'grille',
      title: 'Grille / Réseaux',
      defaultOpen: true,
      content: (
        <>
          <div style={GRID_CREATION_WRAPPER_STYLE}>
            <GridCreationPanel
              key={gridCreationKey}
              pendingOrigin={pendingGridOrigin}
              onOriginRequested={handleGridOriginRequested}
              onGenerate={handleGenerateGrid}
            />
          </div>
          <div style={CARD_CHROME_STYLE}>
            {/* exact edit-mode checkbox + Annuler/Réinitialiser JSX from today's bottom-left corner */}
          </div>
        </>
      ),
    },
    {
      id: 'calques',
      title: 'Calques',
      defaultOpen: false,
      content: <LayerPanel gridLayers={gridLayers} visibility={visibility} onToggle={toggleLayer} />,
    },
    {
      id: 'phenomenes',
      title: 'Phénomènes',
      defaultOpen: false,
      content: (
        <PhenomenonPicker
          activeKind={placementMode?.kind === 'phenomenon' ? placementMode.phenomenonKind : null}
          onSelectKind={handleSelectPhenomenonKind}
        />
      ),
    },
    {
      id: 'freeform',
      title: 'Tracés eau/faille',
      defaultOpen: false,
      content: (
        <>
          {/* exact "Tracer l'eau"/"Tracer une faille" buttons JSX */}
          {pendingFreeformTrace && (
            <div style={CARD_CHROME_STYLE}>
              {freeformSaveError !== null && (
                <>
                  <p role="alert">{freeformSaveError}</p>
                  <button onClick={() => setFreeformSaveError(null)}>Fermer</button>
                </>
              )}
              <FreeformMetadataForm onSubmit={handleSubmitFreeformMetadata} onCancel={handleCancelFreeformMetadata} />
            </div>
          )}
        </>
      ),
    },
    {
      id: 'ligne-guide',
      title: 'Ligne guide',
      defaultOpen: false,
      content: <div style={CARD_CHROME_STYLE}>{/* exact guide-line controls JSX */}</div>,
    },
    ...(buildingFootprint !== null || buildingSearchExhausted || buildingError !== null
      ? [{
          id: 'batiment',
          title: 'Bâtiment',
          defaultOpen: false,
          content: <div style={CARD_CHROME_STYLE}>{/* exact building-status JSX */}</div>,
        }]
      : []),
    ...((visibility[BAGUA_LAYER_ID] ?? false)
      ? [{
          id: 'bagua',
          title: 'Bagua',
          defaultOpen: false,
          content: <div style={CARD_CHROME_STYLE}><BaguaLegendCollapsed /></div>,
        }]
      : []),
  ]}
/>
```

Keep the map's own `<OverlayPanel corner="bottom-right">` for the orthogonality card,
alongside the new `<Sidebar>` — but its outer visibility condition must change from
today's `{(reviewTarget !== null || (visibility[BAGUA_LAYER_ID] ?? false)) && (...)}` to
just `{reviewTarget !== null && reviewSuggestion !== null && (...)}` (drop the Bagua half
of the condition entirely, along with the Bagua legend JSX that used to live inside this
same wrapper — it moves to the sidebar's Bagua accordion section per Step 3 above).
Today's condition only makes sense because the Bagua card renders inside this same
panel; once it's removed, leaving the old condition would render an empty absolutely-
positioned wrapper whenever the Bagua layer is visible with no pending review — dead,
misleading behavior, not "unchanged."

- [ ] **Step 4: Run the full suite, fix any breakage**

Run: `node_modules/.bin/vitest.cmd run`
Expected: every pre-existing test that queries by role/label still passes unchanged
(this is a pure relocation — if a test fails, it's either a structural assertion from
Step 2 that needs updating, or a real regression to fix, not paper over).

- [ ] **Step 5: Typecheck**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Replace SiteMapView's 4 floating OverlayPanel corners with the Sidebar (spec §3) — pure relocation, zero behavior change"
```

**Chunk 1 exit criteria:** full suite green, `tsc -b --noEmit` clean, `SiteMapView.tsx`
renders one left sidebar (accordion, defaultOpen only on "Grille / Réseaux") instead of 4
floating corners; only the orthogonality-review card remains a floating `OverlayPanel`.

---

## Chunk 2: Outil "placer un point ressenti"

**Goal:** Fill the sidebar's pinned band with a real `FeltPointPicker` (5 network buttons
+ Autre), wire a new `'felt-point'` `PlacementMode` variant into `usePlacementMode.ts`,
and make clicking the map with a network armed create a `FeltPoint`.

### Task 3: Create `FeltPointPicker`

**Files:**
- Create: `src/components/FeltPointPicker.tsx` + `src/components/FeltPointPicker.test.tsx`

- [ ] **Step 1: Write failing tests, mirroring `PhenomenonPicker.test.tsx`'s pattern exactly**

```tsx
// src/components/FeltPointPicker.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeltPointPicker } from './FeltPointPicker'

describe('FeltPointPicker', () => {
  it('calls onSelectNetwork with the clicked network name', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName={null} onSelectNetwork={onSelectNetwork} />)

    fireEvent.click(screen.getByRole('button', { name: 'Hartmann' }))

    expect(onSelectNetwork).toHaveBeenCalledWith('Hartmann')
  })

  it('shows which network is currently active for placement', () => {
    render(<FeltPointPicker activeNetworkName="Curry" onSelectNetwork={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Curry' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking the active network again deselects it (cancels placement mode)', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName="Palm" onSelectNetwork={onSelectNetwork} />)

    fireEvent.click(screen.getByRole('button', { name: 'Palm' }))

    expect(onSelectNetwork).toHaveBeenCalledWith(null)
  })

  it('"Autre" reveals a free-text field; submitting it arms placement with the typed name', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName={null} onSelectNetwork={onSelectNetwork} />)

    fireEvent.click(screen.getByRole('button', { name: 'Autre' }))
    fireEvent.change(screen.getByLabelText(/nom du réseau/i), { target: { value: 'Réseau X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(onSelectNetwork).toHaveBeenCalledWith('Réseau X')
  })

  it('does not submit an empty custom network name', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName={null} onSelectNetwork={onSelectNetwork} />)

    fireEvent.click(screen.getByRole('button', { name: 'Autre' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))

    expect(onSelectNetwork).not.toHaveBeenCalled()
  })

  it('shows "Autre" as pressed and lets a single click deselect an already-armed custom network (no reopened text field)', () => {
    const onSelectNetwork = vi.fn()
    render(<FeltPointPicker activeNetworkName="Réseau X" onSelectNetwork={onSelectNetwork} />)

    const autreButton = screen.getByRole('button', { name: 'Autre' })
    expect(autreButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(autreButton)

    expect(onSelectNetwork).toHaveBeenCalledWith(null)
    expect(screen.queryByLabelText(/nom du réseau/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/components/FeltPointPicker.test.tsx`
Expected: FAIL — `Cannot find module './FeltPointPicker'`

- [ ] **Step 3: Implement `FeltPointPicker`**

```tsx
// src/components/FeltPointPicker.tsx
import { useState } from 'react'

export interface FeltPointPickerProps {
  activeNetworkName: string | null
  onSelectNetwork: (networkName: string | null) => void
}

// The 5 confirmed telluric networks (spec §2/§4 — same table as the guide-line
// constraint in Chunk 3). Free text ("Autre") covers any networkName not in
// this fixed list — FeltPoint.networkName is free text in the domain model,
// not a closed enum (see domain/types.ts's comment on FeltPoint).
const KNOWN_NETWORKS = ['Hartmann', 'Curry', 'Palm', 'Peyré', 'Wissmann']

// Same select/toggle-off pattern as PhenomenonPicker: clicking a network arms
// placement mode for the next map click; clicking the already-active network
// again deselects it (aria-pressed mirrors PhenomenonPicker's convention).
// activeNetworkName is fully controlled by the parent (mirrors placementMode
// in usePlacementMode) — any value not in KNOWN_NETWORKS is treated as an
// armed custom ("Autre") network, so "Autre" can be deselected the same way
// a known network can, not just closed back to an empty text field.
export function FeltPointPicker({ activeNetworkName, onSelectNetwork }: FeltPointPickerProps) {
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [customName, setCustomName] = useState('')

  const isCustomActive = activeNetworkName !== null && !KNOWN_NETWORKS.includes(activeNetworkName)

  function handleSelect(name: string) {
    onSelectNetwork(activeNetworkName === name ? null : name)
  }

  function handleToggleCustom() {
    if (isCustomActive) {
      onSelectNetwork(null)
      return
    }
    setShowCustomInput((v) => !v)
  }

  function handleSubmitCustom() {
    const trimmed = customName.trim()
    if (trimmed === '') return
    onSelectNetwork(trimmed)
    setCustomName('')
    setShowCustomInput(false)
  }

  return (
    <div>
      <p>Placer un point ressenti</p>
      {KNOWN_NETWORKS.map((name) => (
        <button key={name} aria-pressed={activeNetworkName === name} onClick={() => handleSelect(name)}>
          {name}
        </button>
      ))}
      <button aria-pressed={isCustomActive || showCustomInput} onClick={handleToggleCustom}>
        Autre
      </button>
      {showCustomInput && !isCustomActive && (
        <>
          <input
            aria-label="Nom du réseau"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
          <button onClick={handleSubmitCustom}>Valider</button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes, then typecheck**

Run: `node_modules/.bin/vitest.cmd run src/components/FeltPointPicker.test.tsx`
Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: both pass/clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/FeltPointPicker.tsx src/components/FeltPointPicker.test.tsx
git commit -m "Add FeltPointPicker: manual point-ressenti network selector (spec §4), not yet wired"
```

### Task 4: Wire a `'felt-point'` `PlacementMode` variant into `usePlacementMode.ts`

**Files:**
- Modify: `src/hooks/usePlacementMode.ts` + `src/hooks/usePlacementMode.test.ts`

- [ ] **Step 1: Write failing tests in `usePlacementMode.test.ts`**

Follow the exact `renderHook`/`act` pattern already used for the `'phenomenon'` variant
in this file. Add:

```typescript
it('arms felt-point placement mode when a network is selected, and creates a FeltPoint on map click', async () => {
  vi.mocked(feltPointsRepo.createFeltPoint).mockResolvedValue({
    id: 'fp1', planId: 'p1', networkName: 'Hartmann', x: 0, y: 0, createdAt: '2026-07-22T10:00:00Z',
  })
  const onFeltPointCreated = vi.fn()
  const { result } = renderHook(() =>
    usePlacementMode({
      planId: 'p1', missionOrigin: { lat: 48.8566, lng: 2.3522 },
      onPhenomenonCreated: vi.fn(), onFreeformNetworkCreated: vi.fn(),
      onFeltPointCreated, onError: vi.fn(),
    })
  )

  act(() => result.current.handleSelectFeltPointNetwork('Hartmann'))
  expect(result.current.placementMode).toEqual({ kind: 'felt-point', networkName: 'Hartmann' })

  await act(async () => result.current.handleMapClick({ lat: 48.8567, lng: 2.3523 }))

  expect(feltPointsRepo.createFeltPoint).toHaveBeenCalledWith(
    expect.objectContaining({ planId: 'p1', networkName: 'Hartmann' })
  )
  expect(onFeltPointCreated).toHaveBeenCalledWith(expect.objectContaining({ networkName: 'Hartmann' }))
})

it('selecting the same felt-point network again deselects it', () => {
  const { result } = renderHook(() =>
    usePlacementMode({
      planId: 'p1', missionOrigin: { lat: 48.8566, lng: 2.3522 },
      onPhenomenonCreated: vi.fn(), onFreeformNetworkCreated: vi.fn(),
      onFeltPointCreated: vi.fn(), onError: vi.fn(),
    })
  )
  act(() => result.current.handleSelectFeltPointNetwork('Curry'))
  act(() => result.current.handleSelectFeltPointNetwork('Curry'))
  expect(result.current.placementMode).toBeNull()
})

it('routes a failed FeltPoint save through onError', async () => {
  vi.mocked(feltPointsRepo.createFeltPoint).mockRejectedValue(new Error('network down'))
  const onError = vi.fn()
  const { result } = renderHook(() =>
    usePlacementMode({
      planId: 'p1', missionOrigin: { lat: 48.8566, lng: 2.3522 },
      onPhenomenonCreated: vi.fn(), onFreeformNetworkCreated: vi.fn(),
      onFeltPointCreated: vi.fn(), onError,
    })
  )
  act(() => result.current.handleSelectFeltPointNetwork('Palm'))
  await act(async () => result.current.handleMapClick({ lat: 48.8567, lng: 2.3523 }))
  expect(onError).toHaveBeenCalledWith('network down')
})
```

Add `vi.mock('../data/feltPointsRepo')` at the top of the test file (mirroring the
existing `vi.mock('../data/phenomenaRepo')`/`vi.mock('../data/freeformNetworksRepo')`
calls already there) plus `import * as feltPointsRepo from '../data/feltPointsRepo'` for
the `vi.mocked(...)` calls above — **only the namespace import**, matching the existing
pattern for the other two repos in this exact file. Do NOT also add a named
`import { createFeltPoint } from '../data/feltPointsRepo'` — this project's `tsconfig`
has `noUnusedLocals: true`, and the snippets above only ever call
`feltPointsRepo.createFeltPoint` through the namespace import, never the bare name; an
unused named import would fail typecheck and produce a SECOND error in Step 5's
type-check gate below, which must see exactly one error (the missing
`onFeltPointCreated` argument), not two.

- [ ] **Step 2: Run to verify the new tests fail**

Run: `node_modules/.bin/vitest.cmd run src/hooks/usePlacementMode.test.ts`
Expected: FAIL — `onFeltPointCreated`/`handleSelectFeltPointNetwork` don't exist yet.

- [ ] **Step 3: Extend `PlacementMode`, `UsePlacementModeArgs`, and add the new handler**

```typescript
// src/hooks/usePlacementMode.ts — extend the PlacementMode union
export type PlacementMode =
  | { kind: 'grid-origin' }
  | { kind: 'guide-line' }
  | { kind: 'phenomenon'; phenomenonKind: PhenomenonKind }
  | { kind: 'freeform'; freeformKind: FreeformNetworkKind }
  | { kind: 'felt-point'; networkName: string }
  | null
```

```typescript
// src/hooks/usePlacementMode.ts — add the import
import { createFeltPoint } from '../data/feltPointsRepo'
import type { FeltPoint } from '../domain/types'
```

```typescript
// src/hooks/usePlacementMode.ts — extend UsePlacementModeArgs
export interface UsePlacementModeArgs {
  planId: string
  missionOrigin: LatLng
  onPhenomenonCreated: (phenomenon: Phenomenon) => void
  onFreeformNetworkCreated: (network: FreeformNetwork) => void
  onFeltPointCreated: (feltPoint: FeltPoint) => void
  onError: (message: string) => void
}
```

```typescript
// src/hooks/usePlacementMode.ts — inside usePlacementMode(...), destructure
// onFeltPointCreated from the args alongside the others, then add:

function handleSelectFeltPointNetwork(networkName: string | null) {
  if (networkName === null) {
    setPlacementMode(null)
    return
  }
  if (placementMode?.kind === 'felt-point' && placementMode.networkName === networkName) {
    setPlacementMode(null)
    return
  }
  startPlacementMode({ kind: 'felt-point', networkName })
}

async function handlePlaceFeltPoint(local: Point, networkName: string) {
  try {
    const created = await createFeltPoint({ planId, networkName, x: local.x, y: local.y })
    onFeltPointCreated(created)
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err))
  }
}
```

```typescript
// src/hooks/usePlacementMode.ts — extend handleMapClick's if-chain with one
// more branch, following the exact same shape as the 'phenomenon' branch:
if (placementMode?.kind === 'felt-point') {
  const local = latLngToLocal(latlng, missionOrigin)
  handlePlaceFeltPoint(local, placementMode.networkName)
}
```

```typescript
// src/hooks/usePlacementMode.ts — add to the hook's return object
return {
  // ...all existing fields...
  handleSelectFeltPointNetwork,
}
```

- [ ] **Step 4: Run to verify the new tests pass, then run the whole file**

Run: `node_modules/.bin/vitest.cmd run src/hooks/usePlacementMode.test.ts`
Expected: PASS — all tests, old and new.

- [ ] **Step 5: Typecheck**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: FAIL initially — `SiteMapView.tsx`'s `usePlacementMode({...})` call site is
now missing the required `onFeltPointCreated` argument (TypeScript will point at this
exact call). This is expected and fixed in Task 5, not here — do not add a placeholder
no-op in `usePlacementMode.ts` to hide it; leave the type error as the signal that Task
5's wiring is still needed. Confirm the error is EXACTLY this missing-property error and
nothing else before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePlacementMode.ts src/hooks/usePlacementMode.test.ts
git commit -m "Add 'felt-point' PlacementMode variant to usePlacementMode (spec §4) — SiteMapView wiring in next task"
```

### Task 5: Wire `FeltPointPicker` + the new hook variant into `SiteMapView.tsx`'s pinned sidebar band

**Files:**
- Modify: `src/components/SiteMapView.tsx`
- Modify: `src/components/SiteMapView.test.tsx`

- [ ] **Step 1: Write a failing integration test**

```tsx
// append to src/components/SiteMapView.test.tsx
it('places a felt point via FeltPointPicker: select a network, click the map, point is created', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.createFeltPoint).mockResolvedValue({
    id: 'fp1', planId: 'p1', networkName: 'Hartmann', x: 1, y: 1, createdAt: '2026-07-22T10:00:00Z',
  })

  render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Hartmann' }))
  // MapView's test mock (this file's own top-of-file vi.mock('./MapView', ...))
  // renders a plain <div data-testid="map-view"> with NO click handler of its
  // own — onMapClick only fires from a nested
  // <button>simulate-map-click</button>, rendered when onMapClick is truthy.
  // Every other map-click-driven test in this file (e.g. the guide-line
  // placement test) clicks that button, not the outer div — do the same here.
  fireEvent.click(screen.getByText('simulate-map-click'))

  await waitFor(() => expect(feltPointsRepo.createFeltPoint).toHaveBeenCalledWith(
    expect.objectContaining({ planId: 'p1', networkName: 'Hartmann' })
  ))
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: FAIL — no "Hartmann" button rendered yet.

- [ ] **Step 3: Wire `onFeltPointCreated` into the `usePlacementMode` call and replace the pinned-band placeholder**

```typescript
// src/components/SiteMapView.tsx — usePlacementMode call site, add one more callback
const {
  // ...existing destructured fields...
  handleSelectFeltPointNetwork,
} = usePlacementMode({
  planId,
  missionOrigin,
  onPhenomenonCreated: (created) => setPhenomena((prev) => [...prev, created]),
  onFreeformNetworkCreated: (created) => setFreeformNetworks((prev) => [...prev, created]),
  onFeltPointCreated: (created) => setFeltPoints((prev) => [...prev, created]),
  onError: (message) => setError(message),
})
```

```tsx
{/* src/components/SiteMapView.tsx — replace the Chunk 1 placeholder */}
<Sidebar
  pinned={
    <FeltPointPicker
      activeNetworkName={placementMode?.kind === 'felt-point' ? placementMode.networkName : null}
      onSelectNetwork={handleSelectFeltPointNetwork}
    />
  }
  sections={[/* unchanged from Chunk 1 */]}
/>
```

Add `import { FeltPointPicker } from './FeltPointPicker'` at the top of the file.

- [ ] **Step 4: Run the full suite to confirm the new test passes and nothing regressed**

Run: `node_modules/.bin/vitest.cmd run`
Expected: PASS, all tests including the new one.

- [ ] **Step 5: Typecheck**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: clean now (the Task 4 Step 5 error is resolved by this wiring).

- [ ] **Step 6: Commit**

```bash
git add src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Wire FeltPointPicker into SiteMapView's pinned sidebar band (spec §4) — manual point-ressenti placement now works end to end"
```

**Chunk 2 exit criteria:** full suite green, `tsc -b --noEmit` clean, clicking a network
button then the map creates a real `FeltPoint`, visible via the existing (unchanged)
`FeltPointsLayer`.

---

## Chunk 3: Ligne guide contrainte par le réseau actif

**Goal:** When a felt-point network is armed (Chunk 2), the guide-line bearing preset
buttons shown are filtered to that network's known angle family (spec §5). No network
armed → all 4 presets shown, unchanged from today.

### Task 6: Add `allowedBearingsForNetwork` and filter the guide-line preset buttons

**Files:**
- Create: `src/domain/networkBearings.ts` + `src/domain/networkBearings.test.ts`
- Modify: `src/components/SiteMapView.tsx` + `src/components/SiteMapView.test.tsx`

- [ ] **Step 1: Write failing tests for the pure mapping function**

```typescript
// src/domain/networkBearings.test.ts
import { describe, it, expect } from 'vitest'
import { allowedBearingsForNetwork } from './networkBearings'

describe('allowedBearingsForNetwork', () => {
  it.each([
    ['Hartmann', [0, 90]],
    ['Palm', [0, 90]],
    ['Peyré', [0, 90]],
    ['Curry', [45, 135]],
    ['Wissmann', [45, 135]],
  ])('%s allows %j', (network, expected) => {
    expect(allowedBearingsForNetwork(network)).toEqual(expected)
  })

  it('returns null (all bearings allowed) for an unrecognized network name', () => {
    expect(allowedBearingsForNetwork('Réseau inconnu')).toBeNull()
  })

  it('returns null when no network is given', () => {
    expect(allowedBearingsForNetwork(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/domain/networkBearings.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement it**

```typescript
// src/domain/networkBearings.ts
// Angle family per confirmed telluric network (spec §2/§5, source: the same
// table already seeded in supabase/migrations/0005_seed_confirmed_networks.sql
// — Wissmann's 45° is explicitly unconfirmed there, assumed = Curry). Used to
// constrain which guide-line bearing presets are offered while a given
// network is armed for felt-point placement (spec §5) — NOT to auto-set the
// bearing; Laurent still places the anchor and picks among the allowed
// presets himself.
const NETWORK_BEARING_FAMILY: Record<string, [number, number]> = {
  Hartmann: [0, 90],
  Palm: [0, 90],
  Peyré: [0, 90],
  Curry: [45, 135],
  Wissmann: [45, 135],
}

export function allowedBearingsForNetwork(networkName: string | null): [number, number] | null {
  if (networkName === null) return null
  return NETWORK_BEARING_FAMILY[networkName] ?? null
}
```

- [ ] **Step 4: Run to verify it passes, then typecheck**

Run: `node_modules/.bin/vitest.cmd run src/domain/networkBearings.test.ts`
Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: both pass/clean.

- [ ] **Step 5: Commit the pure function separately**

```bash
git add src/domain/networkBearings.ts src/domain/networkBearings.test.ts
git commit -m "Add allowedBearingsForNetwork: maps a telluric network to its bearing family (spec §5), not yet wired"
```

- [ ] **Step 6: Write a failing integration test for the filtered buttons**

```tsx
// append to src/components/SiteMapView.test.tsx
it('shows only N/S and E/O guide-line presets while Hartmann is armed for felt-point placement', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

  render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Hartmann' }))

  expect(screen.getByRole('button', { name: 'N/S' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'E/O' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '45°' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '135°' })).not.toBeInTheDocument()
  // Custom angle field + its Valider button always remain available:
  expect(screen.getByLabelText('Angle personnalisé')).toBeInTheDocument()
})

it('shows only 45° and 135° guide-line presets while Curry is armed', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

  render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Curry' }))

  expect(screen.getByRole('button', { name: '45°' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '135°' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'N/S' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'E/O' })).not.toBeInTheDocument()
})

it('shows all 4 guide-line presets when no felt-point network is armed', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

  render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

  expect(await screen.findByRole('button', { name: 'N/S' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'E/O' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '45°' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '135°' })).toBeInTheDocument()
})
```

Note: these tests query buttons that live inside the "Ligne guide" accordion section
(closed by default per Chunk 1). If the section being closed hides its buttons from the
accessibility tree (native `<details>` does NOT remove closed content from the DOM, so
`getByRole` should still find them — verify this assumption holds; if it doesn't,
default this specific section open for the test or adjust the query, and note which in
your report).

- [ ] **Step 7: Run to verify these 3 tests fail**

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: FAIL — all 4 buttons always render today regardless of armed network.

- [ ] **Step 8: Filter the guide-line preset buttons in `SiteMapView.tsx`**

```typescript
// src/components/SiteMapView.tsx — add the import
import { allowedBearingsForNetwork } from '../domain/networkBearings'
```

```typescript
// src/components/SiteMapView.tsx — compute once near the top of the component body
const armedFeltPointNetwork = placementMode?.kind === 'felt-point' ? placementMode.networkName : null
const allowedBearings = allowedBearingsForNetwork(armedFeltPointNetwork)
```

```tsx
{/* src/components/SiteMapView.tsx — guide-line section content, wrap each
    preset button's render (not its onClick/logic) in a bearing-family check.
    allowedBearings === null means "show everything" (today's behavior). */}
{(allowedBearings === null || allowedBearings.includes(0)) && (
  <button onClick={() => { setGuideLineBearing(0); setCustomBearingInput('') }}>N/S</button>
)}
{(allowedBearings === null || allowedBearings.includes(90)) && (
  <button onClick={() => { setGuideLineBearing(90); setCustomBearingInput('') }}>E/O</button>
)}
{(allowedBearings === null || allowedBearings.includes(45)) && (
  <button onClick={() => { setGuideLineBearing(45); setCustomBearingInput('') }}>45°</button>
)}
{(allowedBearings === null || allowedBearings.includes(135)) && (
  <button onClick={() => { setGuideLineBearing(135); setCustomBearingInput('') }}>135°</button>
)}
{/* custom angle input + its Valider button, and Placer ici/Effacer: unchanged, always rendered */}
```

- [ ] **Step 9: Run the full suite to confirm the 3 new tests pass and nothing regressed**

Run: `node_modules/.bin/vitest.cmd run`
Expected: PASS.

- [ ] **Step 10: Typecheck**

Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Constrain guide-line bearing presets to the armed felt-point network's angle family (spec §5)"
```

**Chunk 3 exit criteria:** full suite green, `tsc -b --noEmit` clean, guide-line presets
shrink to the relevant 2 while a network is armed, all 4 show otherwise; custom
angle+Valider always available.

---

## Chunk 4: Boussole permanente à 8 points cardinaux

**Goal:** A fixed, non-interactive 8-point compass rose in the map's top-right corner,
always visible.

### Task 7: Export `COMPASS_ORDER` from `bagua.ts` and create `CompassIndicator`

**Files:**
- Modify: `src/geometry/bagua.ts`
- Create: `src/components/CompassIndicator.tsx` + `src/components/CompassIndicator.test.tsx`
- Modify: `src/components/SiteMapView.tsx`

- [ ] **Step 1: Export `COMPASS_ORDER`**

```typescript
// src/geometry/bagua.ts — change from module-private to exported
export const COMPASS_ORDER: CompassDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
```

Check every existing usage of `COMPASS_ORDER` inside `bagua.ts` still compiles (it's the
same identifier, just now exported — should be a no-op change for existing callers).

**Also remove the now-stale duplicate this export makes redundant:**
`src/components/SiteMapView.tsx:60-63` has its own local
`const COMPASS_DIRECTIONS: CompassDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']`
with a comment explaining it's "kept in sync manually since that constant isn't
exported" — that comment becomes false the moment this step exports `COMPASS_ORDER`.
Replace `SiteMapView.tsx`'s local constant with
`import { COMPASS_ORDER } from '../geometry/bagua'` (this file already imports the
`CompassDirection` *type* from the same module, so this just adds the value import
alongside it), remove the now-obsolete comment and local `const`, and update
`BaguaLegendCollapsed`'s `.map()` call to iterate `COMPASS_ORDER` instead of
`COMPASS_DIRECTIONS` (or keep the local name `COMPASS_DIRECTIONS` as an import alias —
either is fine, just don't leave a hand-duplicated array next to an exported original of
the same data).

- [ ] **Step 2: Write a failing test for `CompassIndicator`**

```tsx
// src/components/CompassIndicator.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CompassIndicator } from './CompassIndicator'

describe('CompassIndicator', () => {
  it('renders all 8 cardinal direction labels', () => {
    render(<CompassIndicator />)
    for (const label of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/components/CompassIndicator.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement `CompassIndicator`**

```tsx
// src/components/CompassIndicator.tsx
import { COMPASS_ORDER } from '../geometry/bagua'

// Fixed, non-interactive chrome — Leaflet never rotates the map, so "up" is
// always true north; this is a permanent visual reminder, not a live sensor
// (spec §6). N is visually emphasized (bold) as the primary reference.
const WRAPPER_STYLE = {
  width: 64,
  height: 64,
  borderRadius: '50%',
  border: '1px solid #999',
  background: 'white',
  position: 'relative' as const,
  fontSize: 10,
}

// One label per 45° step around the circle, N at the top (angle 0, measured
// clockwise from top) — matches COMPASS_ORDER's own index*45 convention
// already used by bagua.ts's computeBaguaSectors.
function positionFor(index: number) {
  const angleRad = ((index * 45 - 90) * Math.PI) / 180
  const radius = 26
  return {
    position: 'absolute' as const,
    left: `calc(50% + ${radius * Math.cos(angleRad)}px - 6px)`,
    top: `calc(50% + ${radius * Math.sin(angleRad)}px - 6px)`,
  }
}

export function CompassIndicator() {
  return (
    <div style={WRAPPER_STYLE}>
      {COMPASS_ORDER.map((direction, i) => (
        <span key={direction} style={{ ...positionFor(i), fontWeight: direction === 'N' ? 'bold' : 'normal' }}>
          {direction}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run to verify it passes, then typecheck**

Run: `node_modules/.bin/vitest.cmd run src/components/CompassIndicator.test.tsx`
Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: both pass/clean.

- [ ] **Step 6: Write a failing test asserting `CompassIndicator` actually renders inside `SiteMapView`**

Unlike a component-in-isolation test, this confirms the wiring itself — matching the
same TDD-before-wiring approach Chunks 2/3 already use for their own `SiteMapView.tsx`
integration points, rather than relying only on the full-suite rerun in Step 8 (which
would still pass even if this wiring were accidentally omitted).

```tsx
// append to src/components/SiteMapView.test.tsx
it('always renders the permanent compass indicator', async () => {
  vi.mocked(gridInstancesRepo.listGridInstancesForPlan).mockResolvedValue([])
  vi.mocked(feltPointsRepo.listFeltPointsForPlan).mockResolvedValue([])

  render(<SiteMapView planId="p1" missionId="m1" missionOrigin={{ lat: 48.8566, lng: 2.3522 }} initialBuildingFootprint={null} />)

  expect(await screen.findByTestId('compass-indicator')).toBeInTheDocument()
})
```

Run: `node_modules/.bin/vitest.cmd run src/components/SiteMapView.test.tsx`
Expected: FAIL — `compass-indicator` testid doesn't exist yet.

- [ ] **Step 7: Wire it into `SiteMapView.tsx`, top-right of the map**

```tsx
{/* src/components/SiteMapView.tsx — new fixed overlay, top-right, distinct
    from the Sidebar (which is now full-height left) and from the
    bottom-right orthogonality OverlayPanel. Not wrapped in <OverlayPanel> —
    it needs no stacking/scroll behavior, just a fixed corner position. */}
<div data-testid="compass-indicator" style={{ position: 'absolute', top: 8, right: 8, zIndex: 1000 }}>
  <CompassIndicator />
</div>
```

Add `import { CompassIndicator } from './CompassIndicator'`.

- [ ] **Step 8: Run the full suite, typecheck**

Run: `node_modules/.bin/vitest.cmd run && node_modules/.bin/tsc.cmd -b --noEmit`
Expected: all pass, clean (this is additive — no existing test should be affected).

- [ ] **Step 9: Commit**

```bash
git add src/geometry/bagua.ts src/components/CompassIndicator.tsx src/components/CompassIndicator.test.tsx src/components/SiteMapView.tsx src/components/SiteMapView.test.tsx
git commit -m "Add permanent 8-point CompassIndicator, top-right of the map (spec §6)"
```

**Chunk 4 exit criteria:** full suite green, `tsc -b --noEmit` clean, an 8-point compass
is always visible top-right regardless of zoom/pan/layers/placement mode.

---

## Chunk 5: Barre permanente du bilan global

**Goal:** A fixed bottom bar, visible only during `ready-no-interior`, showing the 6
global-assessment sliders pre-filled from the current mission, auto-saving (debounced) on
every change. The initial mandatory `GlobalAssessmentForm` step is untouched.

### Task 8: Extract `CauseSlider` for reuse, add a debounce helper

**Files:**
- Create: `src/hooks/useDebouncedCallback.ts` + `src/hooks/useDebouncedCallback.test.ts`
- Modify: `src/components/GlobalAssessmentForm.tsx` (export `CauseSlider`, no behavior change)

- [ ] **Step 1: Write a failing test for the debounce hook**

```typescript
// src/hooks/useDebouncedCallback.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedCallback } from './useDebouncedCallback'

describe('useDebouncedCallback', () => {
  it('only calls the underlying function once after the delay, with the LAST args, given rapid repeated calls', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(fn, 500))

    act(() => {
      result.current(1)
      result.current(2)
      result.current(3)
    })
    expect(fn).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(500))
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(3)

    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/hooks/useDebouncedCallback.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement it**

```typescript
// src/hooks/useDebouncedCallback.ts
import { useCallback, useEffect, useRef } from 'react'

// Generic debounce for auto-save-on-change UI (spec §7: the global-assessment
// bar auto-saves per slider change, but must not fire a network call on
// every intermediate drag value — only once the user settles).
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number
): (...args: Args) => void {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
  }, [])

  return useCallback((...args: Args) => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => fnRef.current(...args), delayMs)
  }, [delayMs])
}
```

- [ ] **Step 4: Run to verify it passes, then typecheck**

Run: `node_modules/.bin/vitest.cmd run src/hooks/useDebouncedCallback.test.ts`
Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: both pass/clean.

- [ ] **Step 5: Export `CauseSlider` from `GlobalAssessmentForm.tsx` (no behavior change)**

```typescript
// src/components/GlobalAssessmentForm.tsx — add `export` to the existing declaration
export interface CauseSliderProps {
  label: string
  value: number
  onChange: (v: number) => void
}

export function CauseSlider({ label, value, onChange }: CauseSliderProps) {
  // ...exact existing body, unchanged...
}
```

- [ ] **Step 6: Run `GlobalAssessmentForm`'s existing tests to confirm no regression, typecheck**

Run: `node_modules/.bin/vitest.cmd run src/components/GlobalAssessmentForm.test.tsx`
Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: both pass/clean (pure export addition, zero behavior change).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useDebouncedCallback.ts src/hooks/useDebouncedCallback.test.ts src/components/GlobalAssessmentForm.tsx
git commit -m "Add useDebouncedCallback and export CauseSlider for reuse (spec §7 prep, no wiring yet)"
```

### Task 9: Create `GlobalAssessmentBar` and wire it into `MissionWorkspace`'s `ready-no-interior` phase

**Files:**
- Create: `src/components/GlobalAssessmentBar.tsx` + `src/components/GlobalAssessmentBar.test.tsx`
- Modify: `src/pages/MissionWorkspace.tsx` + `src/pages/MissionWorkspace.test.tsx`

- [ ] **Step 1: Write failing tests for `GlobalAssessmentBar`**

```tsx
// src/components/GlobalAssessmentBar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GlobalAssessmentBar } from './GlobalAssessmentBar'

describe('GlobalAssessmentBar', () => {
  const baseValues = {
    causeArchitectural: 3, causeElectromagnetique: 1, causeGeobiologique: 5,
    causeParanormale: 0, causeAutres: 2, bovisRate: 8000,
  }

  it('renders all 6 sliders pre-filled with the current mission values', () => {
    render(<GlobalAssessmentBar values={baseValues} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Architectural')).toHaveValue('3')
    expect(screen.getByLabelText('Géobiologique')).toHaveValue('5')
  })

  it('calls onChange with the full updated value set after a debounce delay following a slider change (no explicit save button)', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    render(<GlobalAssessmentBar values={baseValues} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Architectural'), { target: { value: '7' } })
    expect(onChange).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(600))
    expect(onChange).toHaveBeenCalledWith({ ...baseValues, causeArchitectural: 7 })

    expect(screen.queryByRole('button', { name: /enregistrer/i })).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/components/GlobalAssessmentBar.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `GlobalAssessmentBar`**

```tsx
// src/components/GlobalAssessmentBar.tsx
import { useState } from 'react'
import { CauseSlider } from './GlobalAssessmentForm'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import type { GlobalAssessmentInput } from '../data/missionsRepo'

export interface GlobalAssessmentBarProps {
  values: GlobalAssessmentInput
  onChange: (values: GlobalAssessmentInput) => void
}

const BAR_STYLE = {
  position: 'absolute' as const,
  left: 280, // clears the Sidebar's fixed 280px width (Chunk 1) — not
  // rendered inside SiteMapView itself (spec §7: lives at the
  // MissionWorkspace level, present only during ready-no-interior, absent
  // during calibrating-interior), but still needs to sit beside the sidebar
  // rather than under it when both are visible on the same screen.
  right: 0,
  bottom: 0,
  background: 'white',
  borderTop: '2px solid #ccc',
  display: 'flex',
  gap: 12,
  padding: 8,
  zIndex: 1000,
}

const DEBOUNCE_MS = 500

// Permanent, always-editable duplicate of GlobalAssessmentForm's 6 sliders
// (spec §7) — auto-saves on change (debounced), no explicit save button,
// deliberately separate component from GlobalAssessmentForm (which keeps its
// own one-time "Enregistrer" button for the initial mandatory step).
export function GlobalAssessmentBar({ values, onChange }: GlobalAssessmentBarProps) {
  const [local, setLocal] = useState(values)
  const debouncedOnChange = useDebouncedCallback(onChange, DEBOUNCE_MS)

  function update(field: keyof GlobalAssessmentInput, value: number) {
    const next = { ...local, [field]: value }
    setLocal(next)
    debouncedOnChange(next)
  }

  return (
    <div style={BAR_STYLE}>
      <CauseSlider label="Architectural" value={local.causeArchitectural} onChange={(v) => update('causeArchitectural', v)} />
      <CauseSlider label="Électromagnétique" value={local.causeElectromagnetique} onChange={(v) => update('causeElectromagnetique', v)} />
      <CauseSlider label="Géobiologique" value={local.causeGeobiologique} onChange={(v) => update('causeGeobiologique', v)} />
      <CauseSlider label="Paranormal" value={local.causeParanormale} onChange={(v) => update('causeParanormale', v)} />
      <CauseSlider label="Autres" value={local.causeAutres} onChange={(v) => update('causeAutres', v)} />
      <label>
        Taux vibratoire (Bovis)
        <input
          type="range" min={0} max={180000} step={500}
          value={local.bovisRate}
          onChange={(e) => update('bovisRate', Number(e.target.value))}
        />
        <output>{local.bovisRate}</output>
      </label>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes, then typecheck**

Run: `node_modules/.bin/vitest.cmd run src/components/GlobalAssessmentBar.test.tsx`
Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: both pass/clean.

- [ ] **Step 5: Commit the bar component separately**

```bash
git add src/components/GlobalAssessmentBar.tsx src/components/GlobalAssessmentBar.test.tsx
git commit -m "Add GlobalAssessmentBar: permanent auto-saving duplicate of the 6 global-assessment sliders (spec §7), not yet wired"
```

- [ ] **Step 6: Mock `GlobalAssessmentBar` in the test file, matching every other child component's existing mock convention**

`MissionWorkspace.test.tsx` already mocks every child component it renders
(`MissionForm`, `MapView`, `SiteMapView`, `MissionPhotosGallery`, `PlanCalibrationTool`,
`GlobalAssessmentForm`) with a minimal stub exposing a `simulate-X` button/attribute —
never the real component. Follow that exact convention for `GlobalAssessmentBar` too,
rather than exercising its real debounce timing inside this integration test (the
debounce itself is already covered in isolation by Chunk 5 Task 8's
`useDebouncedCallback.test.ts` and Task 9's own `GlobalAssessmentBar.test.tsx` — this
test only needs to verify `MissionWorkspace`'s wiring, not re-prove the debounce works).

```tsx
// add near the top of src/pages/MissionWorkspace.test.tsx, alongside the
// other vi.mock(...) component stubs
vi.mock('../components/GlobalAssessmentBar', () => ({
  GlobalAssessmentBar: ({
    values,
    onChange,
  }: {
    values: { causeArchitectural: number; causeElectromagnetique: number; causeGeobiologique: number; causeParanormale: number; causeAutres: number; bovisRate: number }
    onChange: (v: typeof values) => void
  }) => (
    <div data-testid="global-assessment-bar" data-bovis-rate={values.bovisRate}>
      <button onClick={() => onChange({ ...values, bovisRate: 12000 })}>simulate-bar-change</button>
    </div>
  ),
}))
```

- [ ] **Step 7: Write the failing test**

```tsx
// append to src/pages/MissionWorkspace.test.tsx
it('renders GlobalAssessmentBar (pre-filled from the mission) during ready-no-interior, and calls setGlobalAssessment on change', async () => {
  vi.mocked(plansRepo.createPlan).mockResolvedValue({
    id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
  })
  vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
  vi.mocked(missionsRepo.setGlobalAssessment)
    .mockResolvedValueOnce(missionAfterGlobalAssessment) // the initial mandatory step
    .mockResolvedValueOnce({ ...missionWithOrigin, bovisRate: 12000 }) // the bar's own change

  render(<MissionWorkspace />)
  await advanceToOriginSetting()
  fireEvent.click(screen.getByText('simulate-map-click'))
  await screen.findByTestId('site-map-view') // confirms ready-no-interior was reached

  const bar = screen.getByTestId('global-assessment-bar')
  expect(bar).toHaveAttribute('data-bovis-rate', '9500') // pre-filled from missionAfterGlobalAssessment

  fireEvent.click(screen.getByText('simulate-bar-change'))

  await waitFor(() =>
    expect(missionsRepo.setGlobalAssessment).toHaveBeenNthCalledWith(
      2,
      'm1',
      expect.objectContaining({ bovisRate: 12000 })
    )
  )
})
```

- [ ] **Step 8: Run to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/pages/MissionWorkspace.test.tsx`
Expected: FAIL — `GlobalAssessmentBar` not rendered yet.

- [ ] **Step 9: Wire `GlobalAssessmentBar` into the `ready-no-interior` case**

```tsx
{/* src/pages/MissionWorkspace.tsx — inside the 'ready-no-interior' case,
    alongside the existing <SiteMapView> and <MissionPhotosGallery> */}
<GlobalAssessmentBar
  values={{
    causeArchitectural: phase.mission.causeArchitectural ?? 0,
    causeElectromagnetique: phase.mission.causeElectromagnetique ?? 0,
    causeGeobiologique: phase.mission.causeGeobiologique ?? 0,
    causeParanormale: phase.mission.causeParanormale ?? 0,
    causeAutres: phase.mission.causeAutres ?? 0,
    bovisRate: phase.mission.bovisRate ?? 0,
  }}
  onChange={async (values) => {
    const updated = await setGlobalAssessment(phase.mission.id, values)
    setPhase({ name: 'ready-no-interior', mission: updated, exteriorPlan: phase.exteriorPlan })
  }}
/>
```

Add `import { GlobalAssessmentBar } from '../components/GlobalAssessmentBar'`. Do NOT
render it in `calibrating-interior` (spec §7 — that case already renders
`PlanCalibrationTool` on its own, unrelated to this bar; leave it untouched).

- [ ] **Step 10: Run the full suite, typecheck**

Run: `node_modules/.bin/vitest.cmd run && node_modules/.bin/tsc.cmd -b --noEmit`
Expected: all pass, clean.

- [ ] **Step 11: Commit**

```bash
git add src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "Wire GlobalAssessmentBar into MissionWorkspace's ready-no-interior phase (spec §7)"
```

**Chunk 5 exit criteria:** full suite green, `tsc -b --noEmit` clean, the 6
global-assessment sliders are permanently visible and editable (auto-saving) during the
survey phase, absent during interior-plan calibration; the initial mandatory
`GlobalAssessmentForm` step is completely unchanged.

---

## Chunk 6: Géocodage de l'adresse

**Goal:** Geocode the mission's address via the BAN API when entering `setting-origin`;
center the map there instead of `DEFAULT_CENTER` on success; silently fall back on
failure.

### Task 10: Add `geocodeAddress` and use it in `MissionWorkspace`

**Files:**
- Create: `src/data/geocodingService.ts` + `src/data/geocodingService.test.ts`
- Modify: `src/pages/MissionWorkspace.tsx` + `src/pages/MissionWorkspace.test.tsx`

- [ ] **Step 1: Write failing tests for `geocodeAddress`**

Read `src/data/cadastreService.ts` first for this codebase's established pattern of
wrapping a `fetch` call to a public geo API — the request-building/response-parsing
shape below mirrors it. One deliberate deviation: `cadastreService.ts`/
`buildingFootprintService.ts` both *throw* on failure and leave catching to the caller,
but `geocodeAddress` below swallows all errors and returns `null` instead — this is
intentional, not an oversight, because spec §8 requires geocoding failure to never block
the flow (silent fallback to `DEFAULT_CENTER`), unlike the building-footprint flow which
surfaces its errors to a dismissible UI card.

```typescript
// src/data/geocodingService.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { geocodeAddress } from './geocodingService'

describe('geocodeAddress', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns lat/lng from the first BAN feature on a successful match', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ geometry: { coordinates: [2.3522, 48.8566] } }], // BAN returns [lng, lat]
      }),
    }))

    const result = await geocodeAddress('10 Rue de Rivoli, 75001 Paris')

    expect(result).toEqual({ lat: 48.8566, lng: 2.3522 })
  })

  it('returns null when the BAN response has no features (no match)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }))
    expect(await geocodeAddress('adresse inexistante xyz')).toBeNull()
  })

  it('returns null (does not throw) on a network/API failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await geocodeAddress('10 Rue de Rivoli, 75001 Paris')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/data/geocodingService.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `geocodeAddress`**

```typescript
// src/data/geocodingService.ts
import type { LatLng } from '../geometry/localCoordinates'

// Free French address geocoding (BAN — Base Adresse Nationale), no API key
// needed, same family of call as cadastreService.ts's IGN WFS requests
// (spec §8). Centers the map only — never sets the mission origin itself
// (that stays a deliberate click on the exact terrain point, per spec §8).
// Returns null on no-match or any failure — the caller falls back to
// DEFAULT_CENTER, this must never throw or block the flow.
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  try {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`
    const response = await fetch(url)
    if (!response.ok) return null
    const data = await response.json()
    const feature = data.features?.[0]
    if (!feature) return null
    const [lng, lat] = feature.geometry.coordinates
    return { lat, lng }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run to verify it passes, then typecheck**

Run: `node_modules/.bin/vitest.cmd run src/data/geocodingService.test.ts`
Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: both pass/clean.

- [ ] **Step 5: Commit the service separately**

```bash
git add src/data/geocodingService.ts src/data/geocodingService.test.ts
git commit -m "Add geocodeAddress via the free BAN API (spec §8), not yet wired"
```

- [ ] **Step 6: Mock `geocodingService` and expose `MapView`'s `center` prop in the test file**

Wiring a real `geocodeAddress` call into `handleGlobalAssessmentSaved` means every
existing test that reaches `setting-origin` via this file's `advanceToOriginSetting()`
helper would otherwise trigger a real, unmocked outbound `fetch` — mock the module, the
same way `vi.mock('../data/plansRepo')`/`vi.mock('../data/missionsRepo')` already do for
this file's other data dependencies.

```typescript
// add near the top of src/pages/MissionWorkspace.test.tsx, alongside the
// other vi.mock(...) data-layer calls
vi.mock('../data/geocodingService')
```

```typescript
// add near the top of the test file, alongside the other `import * as ...` lines
import * as geocodingService from '../data/geocodingService'
```

The existing `MapView` mock (this file's own top-of-file `vi.mock('../components/MapView', ...)`)
only surfaces `onMapClick` on the rendered stub — it has no way to observe what `center`
value it was given. Extend it to also expose `center`:

```tsx
// src/pages/MissionWorkspace.test.tsx — replace the existing MapView mock
vi.mock('../components/MapView', () => ({
  MapView: ({
    center,
    onMapClick,
  }: {
    center: [number, number]
    onMapClick?: (latlng: { lat: number; lng: number }) => void
  }) => (
    <div data-testid="map-view" data-center={`${center[0]},${center[1]}`}>
      {onMapClick && (
        <button onClick={() => onMapClick({ lat: 48.8566, lng: 2.3522 })}>simulate-map-click</button>
      )}
    </div>
  ),
}))
```

Every EXISTING test in this file that already asserts on `map-view`/`simulate-map-click`
must keep passing unchanged after this edit — it's additive (`data-center` is a new
attribute, nothing existing is removed or renamed).

- [ ] **Step 7: Write the failing tests**

```tsx
// append to src/pages/MissionWorkspace.test.tsx
it('centers the setting-origin map on the geocoded address when available', async () => {
  vi.mocked(plansRepo.createPlan).mockResolvedValue({
    id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
  })
  vi.mocked(missionsRepo.setGlobalAssessment).mockResolvedValue(missionAfterGlobalAssessment)
  vi.mocked(geocodingService.geocodeAddress).mockResolvedValue({ lat: 45.5, lng: 6.5 })

  render(<MissionWorkspace />)
  fireEvent.click(await screen.findByText('simulate-global-assessment'))

  const mapView = await screen.findByTestId('map-view')
  expect(mapView).toHaveAttribute('data-center', '45.5,6.5')
})

it('falls back to DEFAULT_CENTER without blocking the flow when geocoding finds nothing', async () => {
  vi.mocked(plansRepo.createPlan).mockResolvedValue({
    id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
  })
  vi.mocked(missionsRepo.setGlobalAssessment).mockResolvedValue(missionAfterGlobalAssessment)
  vi.mocked(geocodingService.geocodeAddress).mockResolvedValue(null)

  render(<MissionWorkspace />)
  fireEvent.click(await screen.findByText('simulate-global-assessment'))

  const mapView = await screen.findByTestId('map-view')
  expect(mapView).toHaveAttribute('data-center', '46.6,2.5') // DEFAULT_CENTER — verify this literal matches the real constant in MissionWorkspace.tsx before relying on it
  // the "Cliquez sur la carte..." flow still works exactly as today:
  expect(screen.getByText(/cliquez sur la carte/i)).toBeInTheDocument()
})
```

- [ ] **Step 8: Run to verify these fail**

Run: `node_modules/.bin/vitest.cmd run src/pages/MissionWorkspace.test.tsx`
Expected: FAIL — the map always gets `DEFAULT_CENTER` today (and `geocodingService`
doesn't exist as a module for `vi.mock` to target until Step 5 of this same task lands
it — if this task is executed in order, Step 5 already happened by the time this step
runs).

- [ ] **Step 9: Geocode on entering `setting-origin`**

```typescript
// src/pages/MissionWorkspace.tsx — add the import
import { geocodeAddress } from '../data/geocodingService'
```

```typescript
// src/pages/MissionWorkspace.tsx — WorkspacePhase gains an optional center
// override on the 'setting-origin' variant
type WorkspacePhase =
  | { name: 'creating-mission' }
  | { name: 'creating-exterior-plan'; mission: Mission }
  | { name: 'global-assessment'; mission: Mission; exteriorPlan: Plan }
  | { name: 'setting-origin'; mission: Mission; exteriorPlan: Plan; mapCenter: [number, number] }
  | { name: 'ready-no-interior'; mission: Mission; exteriorPlan: Plan }
  | { name: 'calibrating-interior'; mission: Mission; exteriorPlan: Plan; imageUrl: string }
  | { name: 'error'; message: string }
```

```typescript
// src/pages/MissionWorkspace.tsx — handleGlobalAssessmentSaved, geocode
// before transitioning to setting-origin
async function handleGlobalAssessmentSaved(input: GlobalAssessmentInput) {
  if (phase.name !== 'global-assessment') return
  try {
    const updated = await setGlobalAssessment(phase.mission.id, input)
    const geocoded = await geocodeAddress(updated.address)
    const mapCenter: [number, number] = geocoded ? [geocoded.lat, geocoded.lng] : DEFAULT_CENTER
    setPhase({ name: 'setting-origin', mission: updated, exteriorPlan: phase.exteriorPlan, mapCenter })
  } catch (err) {
    setPhase({ name: 'error', message: messageOf(err) })
  }
}
```

```tsx
{/* src/pages/MissionWorkspace.tsx — 'setting-origin' case, use phase.mapCenter */}
case 'setting-origin':
  return (
    <div>
      <p>Cliquez sur la carte à l'endroit qui servira d'origine du site.</p>
      <div style={MAP_WRAPPER_STYLE}>
        <MapView center={phase.mapCenter} onMapClick={handleOriginClick} />
      </div>
    </div>
  )
```

- [ ] **Step 10: Run the full suite, typecheck**

Run: `node_modules/.bin/vitest.cmd run && node_modules/.bin/tsc.cmd -b --noEmit`
Expected: all pass, clean.

- [ ] **Step 11: Commit**

```bash
git add src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "Center the origin-setting map on the geocoded mission address when available (spec §8)"
```

**Chunk 6 exit criteria:** full suite green, `tsc -b --noEmit` clean, the origin-setting
map centers on the real address when the BAN API resolves it, falls back silently
otherwise; origin placement itself is still always a deliberate click.

---

## Chunk 7: Liste des missions + reprise

**Goal:** A mission-list screen in `App.tsx` before `MissionWorkspace`; selecting an
existing mission resumes it at the correct derived phase, including the orphaned-mission
retry case from spec §9.

**Depends on Chunk 6 being committed first** — Task 12 constructs a `'setting-origin'`
`WorkspacePhase` for the resumed-mission path and needs the `mapCenter` field Chunk 6
adds to that variant to already exist; building this chunk before Chunk 6 would fail to
typecheck.

### Task 11: Create `MissionList` and the phase-derivation helper

**Files:**
- Create: `src/components/MissionList.tsx` + `src/components/MissionList.test.tsx`
- Create: `src/pages/deriveResumePhase.ts` + `src/pages/deriveResumePhase.test.ts`

- [ ] **Step 1: Write failing tests for `MissionList`**

```tsx
// src/components/MissionList.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MissionList } from './MissionList'
import type { Mission } from '../domain/types'

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'm1', address: '10 Rue de Rivoli, 75001 Paris', missionDate: '2026-07-20',
    declinationDeg: null, originLat: null, originLng: null,
    causeArchitectural: null, causeElectromagnetique: null, causeGeobiologique: null,
    causeParanormale: null, causeAutres: null, bovisRate: null,
    parcelRefs: [], buildingFootprint: null,
    ...overrides,
  }
}

describe('MissionList', () => {
  it('renders each mission with its address and date, and a "Nouvelle mission" button', () => {
    render(<MissionList missions={[makeMission()]} onSelectMission={vi.fn()} onCreateNew={vi.fn()} />)
    expect(screen.getByText(/10 Rue de Rivoli/)).toBeInTheDocument()
    expect(screen.getByText(/2026-07-20/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nouvelle mission' })).toBeInTheDocument()
  })

  it('clicking a mission calls onSelectMission with it', () => {
    const onSelectMission = vi.fn()
    const mission = makeMission()
    render(<MissionList missions={[mission]} onSelectMission={onSelectMission} onCreateNew={vi.fn()} />)
    fireEvent.click(screen.getByText(/10 Rue de Rivoli/))
    expect(onSelectMission).toHaveBeenCalledWith(mission)
  })

  it('clicking "Nouvelle mission" calls onCreateNew', () => {
    const onCreateNew = vi.fn()
    render(<MissionList missions={[]} onSelectMission={vi.fn()} onCreateNew={onCreateNew} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle mission' }))
    expect(onCreateNew).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/components/MissionList.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `MissionList`**

```tsx
// src/components/MissionList.tsx
import type { Mission } from '../domain/types'

export interface MissionListProps {
  missions: Mission[]
  onSelectMission: (mission: Mission) => void
  onCreateNew: () => void
}

// listMissions() already sorts by mission_date descending (missionsRepo.ts)
// — no client-side sort needed here (spec §9).
export function MissionList({ missions, onSelectMission, onCreateNew }: MissionListProps) {
  return (
    <div>
      <button onClick={onCreateNew}>Nouvelle mission</button>
      <ul>
        {missions.map((mission) => (
          <li key={mission.id}>
            <button onClick={() => onSelectMission(mission)}>
              {mission.address} — {mission.missionDate}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/components/MissionList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write failing tests for `deriveResumePhase`**

```typescript
// src/pages/deriveResumePhase.test.ts
import { describe, it, expect, vi } from 'vitest'
import { deriveResumePhase } from './deriveResumePhase'
import * as plansRepo from '../data/plansRepo'
import type { Mission, Plan } from '../domain/types'

vi.mock('../data/plansRepo')

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'm1', address: 'Paris', missionDate: '2026-07-20', declinationDeg: null,
    originLat: null, originLng: null, causeArchitectural: null, causeElectromagnetique: null,
    causeGeobiologique: null, causeParanormale: null, causeAutres: null, bovisRate: null,
    parcelRefs: [], buildingFootprint: null,
    ...overrides,
  }
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null, ...overrides }
}

describe('deriveResumePhase', () => {
  it('retries creating the exterior plan when none exists (orphaned mission)', async () => {
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([])
    vi.mocked(plansRepo.createPlan).mockResolvedValue(makePlan())

    const phase = await deriveResumePhase(makeMission())

    expect(plansRepo.createPlan).toHaveBeenCalledWith({ missionId: 'm1', kind: 'exterieur' })
    expect(phase.name).toBe('global-assessment')
  })

  it('resumes at global-assessment when the exterior plan exists but bovisRate is null', async () => {
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([makePlan()])

    const phase = await deriveResumePhase(makeMission({ bovisRate: null }))

    expect(phase.name).toBe('global-assessment')
  })

  it('resumes at setting-origin when the bilan is filled but origin is not set', async () => {
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([makePlan()])

    const phase = await deriveResumePhase(makeMission({ bovisRate: 8000, originLat: null, originLng: null }))

    expect(phase.name).toBe('setting-origin')
  })

  it('resumes at ready-no-interior when the origin is set', async () => {
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([makePlan()])

    const phase = await deriveResumePhase(makeMission({ bovisRate: 8000, originLat: 48.85, originLng: 2.35 }))

    expect(phase.name).toBe('ready-no-interior')
  })

  it('filters listPlansForMission results to kind === "exterieur" (an interior plan may also exist)', async () => {
    vi.mocked(plansRepo.listPlansForMission).mockResolvedValue([
      makePlan({ id: 'interior', kind: 'interieur' }),
      makePlan({ id: 'exterior', kind: 'exterieur' }),
    ])

    const phase = await deriveResumePhase(makeMission({ bovisRate: 8000, originLat: 48.85, originLng: 2.35 }))

    expect(phase.name).toBe('ready-no-interior')
    if (phase.name === 'ready-no-interior') expect(phase.exteriorPlan.id).toBe('exterior')
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/pages/deriveResumePhase.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 7: Implement `deriveResumePhase`**

```typescript
// src/pages/deriveResumePhase.ts
import { listPlansForMission, createPlan } from '../data/plansRepo'
import type { Mission, Plan } from '../domain/types'

export type ResumePhase =
  | { name: 'global-assessment'; mission: Mission; exteriorPlan: Plan }
  | { name: 'setting-origin'; mission: Mission; exteriorPlan: Plan }
  | { name: 'ready-no-interior'; mission: Mission; exteriorPlan: Plan }

// Derives which WorkspacePhase to resume an existing mission at, purely from
// what's already persisted (spec §9) — no separate "phase" column. Handles
// the orphaned-mission edge case (mission created but its exterior plan's
// createPlan call failed, non-transactional — see MissionWorkspace's
// handleMissionCreated) by retrying the plan creation rather than failing.
export async function deriveResumePhase(mission: Mission): Promise<ResumePhase> {
  const plans = await listPlansForMission(mission.id)
  const existingExterior = plans.find((p) => p.kind === 'exterieur')
  const exteriorPlan = existingExterior ?? (await createPlan({ missionId: mission.id, kind: 'exterieur' }))

  if (mission.bovisRate === null) {
    return { name: 'global-assessment', mission, exteriorPlan }
  }
  if (mission.originLat === null || mission.originLng === null) {
    return { name: 'setting-origin', mission, exteriorPlan }
  }
  return { name: 'ready-no-interior', mission, exteriorPlan }
}
```

- [ ] **Step 8: Run to verify it passes, then typecheck**

Run: `node_modules/.bin/vitest.cmd run src/components/MissionList.test.tsx src/pages/deriveResumePhase.test.ts`
Run: `node_modules/.bin/tsc.cmd -b --noEmit`
Expected: both pass/clean.

- [ ] **Step 9: Commit**

```bash
git add src/components/MissionList.tsx src/components/MissionList.test.tsx src/pages/deriveResumePhase.ts src/pages/deriveResumePhase.test.ts
git commit -m "Add MissionList and deriveResumePhase (spec §9), not yet wired into App.tsx"
```

### Task 12: Wire `MissionList` into `App.tsx`, let `MissionWorkspace` start at a resumed phase

**Files:**
- Modify: `src/App.tsx` + create `src/App.test.tsx` (none exists today — verify with `ls src/App.test.tsx` before assuming)
- Modify: `src/pages/MissionWorkspace.tsx` + `src/pages/MissionWorkspace.test.tsx`

- [ ] **Step 1: Check whether `src/App.test.tsx` already exists**

If it doesn't, this task creates the first test file for `App.tsx` — follow this
codebase's established `render`/`screen`/`vi.mock` conventions from any other page-level
test file (e.g. `MissionWorkspace.test.tsx`) for consistency.

- [ ] **Step 2: Write failing tests for `MissionWorkspace`'s new `initialResumePhase` prop**

```tsx
// append to src/pages/MissionWorkspace.test.tsx
it('starts directly at global-assessment when resumed there', async () => {
  vi.mocked(plansRepo.createPlan).mockResolvedValue({
    id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
  })
  render(
    <MissionWorkspace
      initialResumePhase={{ name: 'global-assessment', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
    />
  )
  expect(await screen.findByText('simulate-global-assessment')).toBeInTheDocument()
  // No fresh mission/plan creation should happen on a resumed mission:
  expect(plansRepo.createPlan).not.toHaveBeenCalled()
})

it('starts directly at setting-origin (with DEFAULT_CENTER, no re-geocoding) when resumed there', async () => {
  render(
    <MissionWorkspace
      initialResumePhase={{ name: 'setting-origin', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
    />
  )
  expect(await screen.findByText(/cliquez sur la carte/i)).toBeInTheDocument()
})

it('starts directly at ready-no-interior (SiteMapView visible immediately) when resumed there', async () => {
  render(
    <MissionWorkspace
      initialResumePhase={{ name: 'ready-no-interior', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
    />
  )
  const siteMapView = await screen.findByTestId('site-map-view')
  expect(siteMapView).toHaveAttribute('data-plan-id', 'p1')
})
```

- [ ] **Step 3: Run to verify these fail**

Run: `node_modules/.bin/vitest.cmd run src/pages/MissionWorkspace.test.tsx`
Expected: FAIL — `initialResumePhase` isn't a recognized prop yet, every test starts at
`creating-mission` regardless.

- [ ] **Step 4: Give `MissionWorkspace` an optional `initialResumePhase` prop**

```typescript
// src/pages/MissionWorkspace.tsx — extend props
export interface MissionWorkspaceProps {
  initialResumePhase?: ResumePhase
}

export function MissionWorkspace({ initialResumePhase }: MissionWorkspaceProps) {
  const [phase, setPhase] = useState<WorkspacePhase>(
    initialResumePhase
      ? (initialResumePhase.name === 'setting-origin'
          ? { ...initialResumePhase, mapCenter: DEFAULT_CENTER } // resumed missions skip re-geocoding for now — a deliberate scope cut for this plan, not spec-mandated (spec §8 doesn't carve out an exception for the resume path); geocoding (Chunk 6) only runs on the fresh-creation path today
          : initialResumePhase)
      : { name: 'creating-mission' }
  )
  // ...rest unchanged...
}
```

Import `type { ResumePhase } from './deriveResumePhase'`.

- [ ] **Step 5: Run to verify the 3 new tests pass, then run the whole file**

Run: `node_modules/.bin/vitest.cmd run src/pages/MissionWorkspace.test.tsx`
Expected: PASS — all tests, old and new.

- [ ] **Step 6: Write failing tests for `App.tsx`'s mission-list/resume wiring**

```tsx
// src/App.test.tsx (or appended if it already exists)
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import * as missionsRepo from './data/missionsRepo'
import * as deriveResumePhaseModule from './pages/deriveResumePhase'

vi.mock('./data/missionsRepo')
vi.mock('./pages/deriveResumePhase') // mock separately per the real module path

// Mocked so this file tests App.tsx's own wiring (which phase MissionWorkspace
// receives) without needing to also stand up MissionWorkspace's full child
// tree (SiteMapView, MapView, etc.) — same isolation principle already used
// throughout this codebase's other page-level tests.
vi.mock('./pages/MissionWorkspace', () => ({
  MissionWorkspace: ({ initialResumePhase }: { initialResumePhase?: { name: string } }) => (
    <div data-testid="mission-workspace" data-resume-phase-name={initialResumePhase?.name ?? 'none'} />
  ),
}))

const existingMission = {
  id: 'm1', address: '10 Rue de Rivoli', missionDate: '2026-07-20', declinationDeg: null,
  originLat: null, originLng: null, causeArchitectural: null, causeElectromagnetique: null,
  causeGeobiologique: null, causeParanormale: null, causeAutres: null, bovisRate: null,
  parcelRefs: [], buildingFootprint: null,
}

describe('App', () => {
  it('shows the mission list on load, with existing missions from listMissions()', async () => {
    vi.mocked(missionsRepo.listMissions).mockResolvedValue([existingMission])
    render(<App />)
    expect(await screen.findByText(/10 Rue de Rivoli/)).toBeInTheDocument()
  })

  it('"Nouvelle mission" goes to the mission-creation flow', async () => {
    vi.mocked(missionsRepo.listMissions).mockResolvedValue([])
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle mission' }))
    const workspace = await screen.findByTestId('mission-workspace')
    expect(workspace).toHaveAttribute('data-resume-phase-name', 'none')
  })

  it('selecting an existing mission derives its resume phase and passes it to MissionWorkspace', async () => {
    vi.mocked(missionsRepo.listMissions).mockResolvedValue([existingMission])
    vi.mocked(deriveResumePhaseModule.deriveResumePhase).mockResolvedValue({
      name: 'setting-origin',
      mission: existingMission,
      exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null },
    })

    render(<App />)
    fireEvent.click(await screen.findByText(/10 Rue de Rivoli/))

    await waitFor(() => expect(deriveResumePhaseModule.deriveResumePhase).toHaveBeenCalledWith(existingMission))
    const workspace = await screen.findByTestId('mission-workspace')
    expect(workspace).toHaveAttribute('data-resume-phase-name', 'setting-origin')
  })

  it('shows an error, not a crash, when deriveResumePhase fails (e.g. the orphaned-mission retry itself fails)', async () => {
    vi.mocked(missionsRepo.listMissions).mockResolvedValue([existingMission])
    vi.mocked(deriveResumePhaseModule.deriveResumePhase).mockRejectedValue(new Error('network down'))

    render(<App />)
    fireEvent.click(await screen.findByText(/10 Rue de Rivoli/))

    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
  })
})
```

Note: `deriveResumePhase` does its own data fetching (`listPlansForMission`/`createPlan`,
including the orphaned-mission retry) — mocked directly here rather than mocking its
transitive `plansRepo` dependency, to keep this test focused on `App.tsx`'s own wiring
logic. `deriveResumePhase`'s own internal retry behavior is already covered by Task 11's
`deriveResumePhase.test.ts`, not re-tested here.

- [ ] **Step 7: Run to verify these fail**

Run: `node_modules/.bin/vitest.cmd run src/App.test.tsx`
Expected: FAIL — `App` renders `MissionWorkspace` directly today, no list screen.

- [ ] **Step 8: Add the mission-list state machine to `App.tsx`**

```tsx
// src/App.tsx
import { useEffect, useState } from 'react'
import { MissionList } from './components/MissionList'
import { MissionWorkspace } from './pages/MissionWorkspace'
import { deriveResumePhase, type ResumePhase } from './pages/deriveResumePhase'
import { listMissions } from './data/missionsRepo'
import type { Mission } from './domain/types'
import './App.css'

type AppPhase =
  | { name: 'loading-missions' }
  | { name: 'mission-list'; missions: Mission[] }
  | { name: 'creating' }
  | { name: 'resuming'; resumePhase: ResumePhase }
  | { name: 'error'; message: string }

function App() {
  const [phase, setPhase] = useState<AppPhase>({ name: 'loading-missions' })

  useEffect(() => {
    listMissions()
      .then((missions) => setPhase({ name: 'mission-list', missions }))
      .catch((err) => setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) }))
  }, [])

  async function handleSelectMission(mission: Mission) {
    try {
      const resumePhase = await deriveResumePhase(mission)
      setPhase({ name: 'resuming', resumePhase })
    } catch (err) {
      setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      {phase.name === 'loading-missions' && <p>Chargement…</p>}
      {phase.name === 'mission-list' && (
        <MissionList
          missions={phase.missions}
          onSelectMission={handleSelectMission}
          onCreateNew={() => setPhase({ name: 'creating' })}
        />
      )}
      {phase.name === 'creating' && <MissionWorkspace />}
      {phase.name === 'resuming' && <MissionWorkspace initialResumePhase={phase.resumePhase} />}
      {phase.name === 'error' && <p role="alert">{phase.message}</p>}
    </div>
  )
}

export default App
```

- [ ] **Step 9: Run the full suite, typecheck**

Run: `node_modules/.bin/vitest.cmd run && node_modules/.bin/tsc.cmd -b --noEmit`
Expected: all pass, clean.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "Wire mission list + resume into App.tsx (spec §9) — MissionWorkspace accepts an optional resumed phase"
```

**Chunk 7 exit criteria:** full suite green, `tsc -b --noEmit` clean, launching the app
shows existing missions, clicking one resumes it at the correct phase (including the
orphaned-mission retry case), "Nouvelle mission" still works exactly as before.

---

## Chunk 8: Packaging / lancement en un clic

**Goal:** Replace the dev-server desktop shortcut with a production-build launcher: one
double-click starts (or reuses) a local static server and opens the app, installable as a
standalone PWA window.

### Task 13: Production launch script + updated desktop shortcut

**Files:**
- Create: `scripts/launch-geobio.cmd` (in the repo, not `C:\Users\laurent\`, so it's
  versioned and rebuildable — the desktop shortcut becomes a thin pointer to this)
- Modify: `C:\Users\laurent\geobio-dev-server.cmd` → repointed/renamed per Step 3

This task has no automated test (it's a Windows launch script, not application code) —
verify manually per Step 4, and flag the manual-verification result explicitly when
reporting this task's completion, same as the js-aruco2 dev-server fix earlier this
session.

- [ ] **Step 1: Build the production bundle once, confirm it works**

Run: `node_modules/.bin/tsc.cmd -b && node_modules/.bin/vite.cmd build`
Expected: succeeds, produces `dist/`. Then run `node_modules/.bin/vite.cmd preview` and
confirm in a browser (or via the Browser pane tool) that the production build actually
loads and the app renders — a production build can fail differently than dev mode (e.g.
`vite.config.ts`'s manifest paths only matter for the built output).

- [ ] **Step 2: Write the launch script**

```bat
@echo off
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"
set "REPO=D:\LAURENT PC\GEOBIO"
set "PORT=4173"

cd /d "%REPO%"

rem Only rebuild if dist/ is missing - avoids a slow rebuild on every launch;
rem Laurent (or whoever ships a code change) is expected to run `npm run build`
rem manually after pulling new code, this script is for RUNNING what's already
rem built, not for redeploying. Echo a reminder so an old build is never
rem silently reused without Laurent knowing - a stale build during the actual
rem field test week would be confusing and hard to diagnose from the field.
if not exist "%REPO%\dist" (
  echo Premier lancement : construction du build de production...
  call npm run build
) else (
  echo Build existant reutilise ^(lancez "npm run build" pour reconstruire^).
)

rem Check if something is already listening on PORT before starting a second
rem preview server - avoids "address already in use" on a second click.
rem CRITICAL: the /C: switch is required. Without it, findstr splits its
rem search string on whitespace into separate OR'd terms, so the trailing
rem space after %PORT% is treated as a token delimiter, not a literal
rem character - ":4173 " would then also match ":41730", ":417300", etc. from
rem an unrelated process, wrongly skipping this launcher's own server start.
netstat -ano | findstr /C:":%PORT% " | findstr "LISTENING" >nul
if errorlevel 1 (
  rem Use `start`'s own /d switch to set the child's working directory -
  rem NOT a nested `cd /d ""%REPO%"" && ...` inside the cmd /c string,
  rem which silently collapses to a no-op `cd /d` (prints/keeps the current
  rem dir) rather than actually changing it. It would appear to work here
  rem only by accident, via inheriting this script's own already-correct
  rem `cd /d "%REPO%"` above - fragile the moment this snippet is reordered
  rem or copied elsewhere.
  start "" /min /d "%REPO%" cmd /c "npm run preview -- --port %PORT% --strictPort"
  rem Give the server a moment to bind before opening the browser.
  timeout /t 2 /nobreak >nul
)

start "" "http://localhost:%PORT%"
endlocal
```

- [ ] **Step 3: Save it into the repo, replace the desktop shortcut's content**

```bash
mkdir -p scripts # if it doesn't already exist
```

Save the script above as `scripts/launch-geobio.cmd` in the repo (use the Write tool,
not a heredoc, per this session's own tooling conventions). Then overwrite
`C:\Users\laurent\geobio-dev-server.cmd` (the existing desktop shortcut target, already
repointed to the correct repo path earlier this session) with a one-line pointer:

```bat
@echo off
call "D:\LAURENT PC\GEOBIO\scripts\launch-geobio.cmd"
```

Rename the desktop `.lnk`/shortcut itself from "GEOBIO Dev Server" to "GEOBIO" if easily
done (cosmetic, not blocking — Laurent can rename the icon manually if this step is
awkward to script).

- [ ] **Step 4: Manually verify end to end**

Double-click the desktop shortcut (or run `C:\Users\laurent\geobio-dev-server.cmd`
directly). Confirm: (a) on first run, it builds if `dist/` is absent; (b) it opens a
browser window at the app, fully functional; (c) running it a SECOND time does not start
a duplicate server or error on "port already in use" — it just reopens the browser.
**Flag this manual-verification result explicitly when reporting this task's
completion** — it's the one step in this whole plan that automated tests cannot confirm.

- [ ] **Step 5: Commit**

```bash
git add scripts/launch-geobio.cmd
git commit -m "Add one-click production launch script (spec §10) — replaces the dev-server desktop shortcut"
```

Note: `C:\Users\laurent\geobio-dev-server.cmd` lives outside the repo (a personal desktop
shortcut target, not version-controlled) — it isn't part of this commit; its content was
overwritten directly on disk in Step 3.

**Chunk 8 exit criteria:** double-clicking the desktop icon opens the running app
directly, no manual server-starting or URL-typing; a second click reuses the already-running
server instead of erroring or duplicating it.

---

**Whole-plan exit criteria:** full suite green, `tsc -b --noEmit` clean after every
chunk, all 8 packages from `docs/superpowers/specs/2026-07-22-ergonomie-terrain-design.md`
implemented and regression-tested. Chunk 8's manual verification (Task 13 Step 4) is the
only step automated tests can't confirm — flag its result explicitly when reporting this
plan's completion, and report which chunks were actually reached if execution runs out
of time before Chunk 8.

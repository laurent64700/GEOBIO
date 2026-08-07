// src/components/Toolbar.tsx
import { useState, type ReactNode } from 'react'

export interface ToolbarProps {
  children?: ReactNode
  /** Called with the DOM node other components portal secondary content into
   * (e.g. the guide-line control panel, which stays logically owned/stateful
   * inside SiteMapView but must render inside this fixed bar) whenever the
   * "Ligne guide" button is open, or `null` when it's closed. A callback ref,
   * not a RefObject — a plain useRef would read null on first render. */
  onGuideLineSlotReady?: (node: HTMLDivElement | null) => void
}

// Fixed-height, full-width, top-of-screen bar — spec §3 ("ruban Paint"). Height
// is a named constant (not just a magic number here) because Sidebar.tsx (a
// later task) AND MissionWorkspace.tsx's ready-no-interior column (this same
// task, Step 5) both need the exact same value: Sidebar to offset its own top
// position, MissionWorkspace to reserve equivalent space in normal flow —
// position:fixed takes this bar OUT of flow entirely, so nothing below it is
// pushed down automatically the way a normal flex/block sibling would be.
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
  zIndex: 1100, // above Sidebar's zIndex: 1000 so nothing overlaps it
  // Safety net for the row itself: Undo/Redo + Ligne guide + Placer/Tracer
  // (Phase 2 adds 3 more menu triggers) can exceed a narrow/tablet viewport
  // width even with the guide-line panel closed. Horizontal scroll keeps
  // every button reachable rather than silently clipping the rightmost ones
  // — flagged during Chunk 1-2's holistic review (2026-08), not observed to
  // trigger yet with only Undo/Redo/Ligne guide/Placer/Tracer present, but
  // cheap to have in place before Chunk 3's menu bar adds more.
  overflowX: 'auto' as const,
}

// The guide-line panel (4 bearing buttons + an angle input + 3 action
// buttons — 8 elements) is the single largest contributor to toolbar-row
// width. Rendering it inline as flex siblings of Undo/Redo/Ligne guide/
// Placer/Tracer would make the fixed-height row overflow far more easily
// than the plain overflowX safety net above can gracefully absorb (a
// horizontal scrollbar is a poor way to reach "Effacer" mid-task). Instead,
// the "Ligne guide" button and its slot share a `position: relative`
// wrapper, and the slot itself is `position: absolute`, floating below the
// button — a standard dropdown-panel pattern, consistent with how Chunk 3/4's
// Radix menus will already behave. This keeps the panel's own internal width
// (it wraps onto multiple lines via flexWrap if needed) fully independent of
// the toolbar row's fixed 48px height.
const GUIDE_LINE_WRAPPER_STYLE = {
  position: 'relative' as const,
  display: 'flex',
  alignItems: 'center',
}

const GUIDE_LINE_SLOT_STYLE = {
  position: 'absolute' as const,
  top: '100%',
  left: 0,
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 4,
  maxWidth: 280,
  padding: 8,
  marginTop: 4,
  background: 'white',
  border: '1px solid #ccc',
  borderRadius: 4,
  zIndex: 1200, // above the toolbar row itself
}

export function Toolbar({ children, onGuideLineSlotReady }: ToolbarProps) {
  const [guideLinePanelOpen, setGuideLinePanelOpen] = useState(false)
  return (
    <div role="toolbar" style={TOOLBAR_STYLE}>
      {children}
      <div style={GUIDE_LINE_WRAPPER_STYLE}>
        <button aria-pressed={guideLinePanelOpen} onClick={() => setGuideLinePanelOpen((v) => !v)}>
          Ligne guide
        </button>
        {guideLinePanelOpen && <div ref={onGuideLineSlotReady} style={GUIDE_LINE_SLOT_STYLE} />}
      </div>
      <button disabled title="Bientôt disponible (Phase 2)">Placer</button>
      <button disabled title="Bientôt disponible (Phase 2)">Tracer</button>
    </div>
  )
}

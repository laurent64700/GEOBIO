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
}

export function Toolbar({ children, onGuideLineSlotReady }: ToolbarProps) {
  const [guideLinePanelOpen, setGuideLinePanelOpen] = useState(false)
  return (
    <div role="toolbar" style={TOOLBAR_STYLE}>
      {children}
      <button aria-pressed={guideLinePanelOpen} onClick={() => setGuideLinePanelOpen((v) => !v)}>
        Ligne guide
      </button>
      {guideLinePanelOpen && <div ref={onGuideLineSlotReady} />}
    </div>
  )
}

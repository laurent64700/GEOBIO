// src/components/Sidebar.tsx
import type { ReactNode } from 'react'
import { Accordion, type AccordionSection } from './Accordion'
import { TOOLBAR_HEIGHT_PX } from './Toolbar'

export interface SidebarProps {
  pinned: ReactNode
  sections: AccordionSection[]
}

// Full-height, fixed-width, left-hand column — replaces the 4 corner
// OverlayPanels in SiteMapView.tsx (spec §3). Plain functional chrome only,
// no visual polish (Laurent: "fonctionnel pur, comme Paint").
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

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
// spec §4/§6). NOTE this is NOT the same guarantee as a controlled <input>:
// React does not intercept/re-assert <details>'s `open` on the native toggle
// event, only on React's own next render — so between a user's click and the
// parent re-rendering with a (possibly unchanged) `open` value, the DOM
// briefly reflects the user's raw action. In practice this doesn't matter
// here: `onToggle` fires synchronously with the real value, and the parent
// (SiteMapView, in a later task) re-renders with the authoritative `open`
// value immediately after via its own state update.
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

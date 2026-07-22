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

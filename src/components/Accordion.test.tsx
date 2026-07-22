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

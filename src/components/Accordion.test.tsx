// src/components/Accordion.test.tsx
import { describe, it, expect, vi } from 'vitest'
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

  it('calls onToggle with the new open state when the native toggle event fires', () => {
    const onToggle = vi.fn()
    render(
      <Accordion
        sections={[
          { id: 'a', title: 'A', defaultOpen: false, open: true, onToggle, content: <p>content-a</p> },
        ]}
      />
    )
    const details = screen.getByText('A').closest('details') as HTMLDetailsElement
    // `@testing-library/dom`'s `fireEvent` has no `.toggle` shorthand (unlike
    // `.click`/`.change`) — dispatch a plain Event, and set `.open` on the
    // element FIRST: a real click on <summary> flips the DOM's native open
    // state before the 'toggle' event fires, jsdom included. React does not
    // special-case <details> the way it does <input>/<select> — an existing
    // `open` prop is only reasserted on React's OWN next render, not
    // synchronously in response to the native event, so this test simulates
    // the browser's half (flip `.open`) and asserts only on the handler
    // receiving the resulting value, not on the DOM reverting by itself.
    details.open = false
    fireEvent(details, new Event('toggle'))
    expect(onToggle).toHaveBeenCalledWith(false)
  })
})

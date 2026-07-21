// src/components/OverlayPanel.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OverlayPanel } from './OverlayPanel'

describe('OverlayPanel', () => {
  it('renders its children', () => {
    render(
      <OverlayPanel corner="top-left">
        <p>hello</p>
      </OverlayPanel>
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it.each([
    ['top-left', { top: '8px', left: '8px' }],
    ['top-right', { top: '8px', right: '8px' }],
    ['bottom-left', { bottom: '8px', left: '8px' }],
    ['bottom-right', { bottom: '8px', right: '8px' }],
  ] as const)('positions the %s corner correctly', (corner, expectedStyle) => {
    const { container } = render(
      <OverlayPanel corner={corner}>
        <p>content</p>
      </OverlayPanel>
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.position).toBe('absolute')
    for (const [prop, value] of Object.entries(expectedStyle)) {
      expect((root.style as unknown as Record<string, string>)[prop]).toBe(value)
    }
  })
})

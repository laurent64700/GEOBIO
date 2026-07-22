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

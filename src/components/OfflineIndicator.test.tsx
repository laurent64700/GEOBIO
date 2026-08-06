// src/components/OfflineIndicator.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OfflineIndicator } from './OfflineIndicator'
import { useOfflineSync } from '../hooks/useOfflineSync'

vi.mock('../hooks/useOfflineSync')

describe('OfflineIndicator', () => {
  it('shows "Synchronisé" and is present in the DOM when there is nothing pending', () => {
    vi.mocked(useOfflineSync).mockReturnValue({ pendingCount: 0, flushNow: vi.fn() })
    const { container } = render(<OfflineIndicator />)

    expect(screen.getByText('Synchronisé')).toBeInTheDocument()
    // Guards against a regression to `if (pendingCount === 0) return null` —
    // the indicator must be a permanent fixture, not hidden when in sync.
    expect(container).not.toBeEmptyDOMElement()
  })

  it('shows the pending count and stays present when modifications are queued', () => {
    vi.mocked(useOfflineSync).mockReturnValue({ pendingCount: 3, flushNow: vi.fn() })
    const { container } = render(<OfflineIndicator />)

    expect(screen.getByText(/3.*en attente/i)).toBeInTheDocument()
    expect(container).not.toBeEmptyDOMElement()
  })

  it('renders the exact French text for the pending state', () => {
    vi.mocked(useOfflineSync).mockReturnValue({ pendingCount: 3, flushNow: vi.fn() })
    render(<OfflineIndicator />)

    expect(screen.getByText('Hors-ligne — 3 modification(s) en attente')).toBeInTheDocument()
  })
})

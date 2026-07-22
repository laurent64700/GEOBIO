// src/components/Sidebar.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('renders the pinned band content and the accordion sections', () => {
    render(
      <Sidebar
        pinned={<p>Pinned content</p>}
        sections={[{ id: 'x', title: 'X', defaultOpen: true, content: <p>Section X content</p> }]}
      />
    )
    expect(screen.getByText('Pinned content')).toBeInTheDocument()
    expect(screen.getByText('Section X content')).toBeVisible()
  })
})

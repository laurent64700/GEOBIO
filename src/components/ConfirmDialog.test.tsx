// src/components/ConfirmDialog.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConfirmDialog } from './ConfirmDialog'
import { isOnlineNow } from '../offline/connectivity'

vi.mock('../offline/connectivity')

describe('ConfirmDialog', () => {
  it('renders the title and message, calls nothing until a button is clicked', () => {
    render(
      <ConfirmDialog
        title="Supprimer la mission ?"
        message="«12 rue des Lilas — 2026-08-06» — Cette action est irréversible."
        confirmLabel="Supprimer"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('Supprimer la mission ?')).toBeInTheDocument()
    expect(screen.getByText(/12 rue des Lilas/)).toBeInTheDocument()
  })

  it('calls onCancel, not onConfirm, when "Annuler" is clicked', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog title="t" message="m" confirmLabel="Supprimer" onConfirm={onConfirm} onCancel={onCancel} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('checks connectivity before calling onConfirm, and shows an error instead if offline', async () => {
    vi.mocked(isOnlineNow).mockResolvedValue(false)
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog title="t" message="m" confirmLabel="Supprimer" onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    // "hors-ligne", not "connexion" — matches the actual implementation
    // string in Step 3 below ("...indisponible hors-ligne — réessayez une
    // fois connecté."), which contains "connecté" (past participle) but
    // never the substring "connexion" (the noun) — a regex on the wrong one
    // of the two would fail against the real component.
    expect(await screen.findByRole('alert')).toHaveTextContent(/hors-ligne/i)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm when online, disables both buttons while it is in flight, and does not call it twice on a reentrant click', async () => {
    vi.mocked(isOnlineNow).mockResolvedValue(true)
    let resolveConfirm: () => void
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { resolveConfirm = resolve }))
    render(
      <ConfirmDialog title="t" message="m" confirmLabel="Supprimer" onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    const confirmButton = screen.getByRole('button', { name: 'Supprimer' })
    fireEvent.click(confirmButton)

    await waitFor(() => expect(confirmButton).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeDisabled()

    fireEvent.click(confirmButton) // reentrant click while disabled — must not fire again
    expect(onConfirm).toHaveBeenCalledTimes(1)

    resolveConfirm!()
    await waitFor(() => expect(confirmButton).not.toBeDisabled())
  })

  it('disables both buttons immediately on click, before the connectivity probe even resolves — a reentrant click during that window does not re-invoke isOnlineNow or onConfirm', async () => {
    let resolveIsOnline: (value: boolean) => void
    vi.mocked(isOnlineNow).mockReturnValue(new Promise((resolve) => { resolveIsOnline = resolve }))
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(
      <ConfirmDialog title="t" message="m" confirmLabel="Supprimer" onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    const confirmButton = screen.getByRole('button', { name: 'Supprimer' })
    fireEvent.click(confirmButton)

    // isOnlineNow's own promise is still pending here — proves the button is
    // already disabled BEFORE the connectivity probe resolves, not just
    // around onConfirm. (Not asserting isOnlineNow's own call count: this
    // file has no beforeEach clearing mocks between tests, so its count
    // carries over from earlier tests — onConfirm, a fresh vi.fn() local to
    // this test, is the reliable signal. Since isOnlineNow's mock returns
    // the SAME pending promise on every call via mockReturnValue, a
    // reentrant handleConfirm invocation would still lead to a 2nd onConfirm
    // call once resolved — so this assertion alone is sufficient proof the
    // reentrant click below didn't get through.)
    await waitFor(() => expect(confirmButton).toBeDisabled())
    fireEvent.click(confirmButton) // reentrant click during the probe itself

    resolveIsOnline!(true)
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
  })

  it('shows a dismissible error and leaves the dialog open when onConfirm rejects', async () => {
    vi.mocked(isOnlineNow).mockResolvedValue(true)
    const onConfirm = vi.fn().mockRejectedValue(new Error('boom'))
    render(
      <ConfirmDialog title="t" message="m" confirmLabel="Supprimer" onConfirm={onConfirm} onCancel={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    expect(screen.getByText('t')).toBeInTheDocument() // the dialog itself (title prop) is still rendered — not closed by an error
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

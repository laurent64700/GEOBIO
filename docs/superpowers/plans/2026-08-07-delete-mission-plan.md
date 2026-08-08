# Suppression de mission — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de supprimer une mission (irréversible) depuis la liste des missions et depuis le menu Fichier d'une mission ouverte, avec nettoyage cohérent (base de données via cascade, fichiers Storage, cache local de reprise hors-ligne).

**Architecture:** Une fonction `deleteMission` dans `missionsRepo.ts` (DELETE en base + nettoyage Storage best-effort), un composant de confirmation partagé `ConfirmDialog.tsx`, câblé à 2 endroits (`MissionList.tsx`, `MenuBar.tsx`) sans aucune logique métier dans ces 2 composants eux-mêmes — `App.tsx`/`MissionWorkspace.tsx` restent les seuls à appeler `deleteMission` et à gérer les effets de bord (mise à jour de la liste, nettoyage de `current_session`, navigation), exactement comme `onDuplicateMission`/`onSaveNow` le font déjà pour "Enregistrer sous"/"Enregistrer".

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, Supabase (DB + Storage).

**Spec:** `docs/superpowers/specs/2026-08-07-delete-mission-design.md` — lire en premier pour la justification complète de chaque décision ci-dessous.

**Correction de portée par rapport au spec** (trouvée en écrivant ce plan, pas un oubli) : le spec §4.3 décrit un déclencheur "désactivé" quand l'app est hors-ligne. Aucun état de connectivité réactif n'existe nulle part dans ce codebase — `isOnlineNow()` (`src/offline/connectivity.ts`) est une simple sonde asynchrone à usage ponctuel, jamais utilisée pour griser un bouton en continu (voir `useOfflineSync.ts`, `MenuBar.tsx`'s "Enregistrer"/"Enregistrer sous" — aucun des deux n'est désactivé hors-ligne, ils tentent l'appel et affichent une erreur en cas d'échec). Introduire un nouveau hook de connectivité réactif pour cette seule fonctionnalité serait disproportionné. **Remplacé par** : vérifier `isOnlineNow()` au moment du clic sur "Supprimer" dans `ConfirmDialog`, et afficher le même message d'erreur inline dismissible qu'un échec réseau si hors-ligne, sans jamais tenter l'appel. Couvre la même intention produit (bloquer, communiquer clairement) avec le pattern déjà établi partout ailleurs dans ce codebase.

---

## Task 1: `deleteMission` dans `missionsRepo.ts`

**Files:**
- Modify: `src/data/missionsRepo.ts`
- Modify: `src/data/missionsRepo.test.ts`

Ajoute `deleteMission(id: string): Promise<void>` — supprime la ligne `mission`
(le cascade en base fait le reste, voir spec §1), puis nettoie best-effort les
fichiers Storage des 2 buckets concernés (spec §5bis). L'échec du nettoyage
Storage ne doit jamais faire échouer `deleteMission` ni être remonté à
l'appelant — seul un échec du DELETE en base doit rejeter.

- [ ] **Step 1: Lire le fichier existant en entier**

Lire `src/data/missionsRepo.ts` et `src/data/missionsRepo.test.ts` avant de modifier —
`missionsRepo.test.ts` existe déjà avec de vrais tests pour `createMission`/
`listMissions`/`duplicateMission`/etc. (ne pas écraser, ajouter à la suite).

- [ ] **Step 2: Écrire le test qui échoue**

`missionsRepo.test.ts` mocke aujourd'hui `supabase` avec seulement `{ from: vi.fn()
}` (ligne 8) — ajouter `storage: { from: vi.fn() }` au mock existant (nécessaire
pour ce test, ne casse aucun test existant puisqu'ils n'utilisent jamais `storage`) :

```ts
// ligne 8, modifier l'appel vi.mock existant :
vi.mock('../lib/supabaseClient', () => ({ supabase: { from: vi.fn(), storage: { from: vi.fn() } } }))
```

Puis ajouter à la fin du fichier :

```ts
// appended to src/data/missionsRepo.test.ts
describe('deleteMission', () => {
  it('deletes the mission row, then best-effort cleans up both Storage buckets', async () => {
    const { from, chain } = createSupabaseChainMock({ data: null, error: null })
    vi.mocked(supabase).from = from

    const listPhotos = vi.fn().mockResolvedValue({
      data: [{ name: 'abc-123.jpg' }, { name: 'def-456.jpg' }],
      error: null,
    })
    const removePhotos = vi.fn().mockResolvedValue({ data: null, error: null })
    const listPlans = vi.fn().mockResolvedValue({ data: [{ name: 'interior-plan.jpg' }], error: null })
    const removePlans = vi.fn().mockResolvedValue({ data: null, error: null })
    vi.mocked(supabase.storage.from).mockImplementation((bucket: string) => {
      if (bucket === 'mission-photos') return { list: listPhotos, remove: removePhotos } as any
      if (bucket === 'plans') return { list: listPlans, remove: removePlans } as any
      throw new Error(`unexpected bucket ${bucket}`)
    })

    await deleteMission('m1')

    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', 'm1')
    expect(listPhotos).toHaveBeenCalledWith('m1')
    expect(removePhotos).toHaveBeenCalledWith(['m1/abc-123.jpg', 'm1/def-456.jpg'])
    expect(listPlans).toHaveBeenCalledWith('m1')
    expect(removePlans).toHaveBeenCalledWith(['m1/interior-plan.jpg'])
  })

  it('propagates an error from the DB delete itself, without attempting Storage cleanup', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: { message: 'network down' } })
    vi.mocked(supabase).from = from
    const listPhotos = vi.fn()
    vi.mocked(supabase.storage.from).mockReturnValue({ list: listPhotos, remove: vi.fn() } as any)

    await expect(deleteMission('m1')).rejects.toThrow('network down')
    expect(listPhotos).not.toHaveBeenCalled()
  })

  it('does not throw when Storage cleanup itself fails (best-effort, mission is already deleted)', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: null })
    vi.mocked(supabase).from = from
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: null, error: { message: 'storage down' } }),
      remove: vi.fn(),
    } as any)

    await expect(deleteMission('m1')).resolves.toBeUndefined()
  })

  it('skips remove() entirely when a bucket has no files for this mission', async () => {
    const { from } = createSupabaseChainMock({ data: null, error: null })
    vi.mocked(supabase).from = from
    const remove = vi.fn()
    vi.mocked(supabase.storage.from).mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
      remove,
    } as any)

    await deleteMission('m1')

    expect(remove).not.toHaveBeenCalled()
  })
})
```

(`createSupabaseChainMock`/`supabase` imports already exist at the top of this
file from the earlier tasks — no new imports needed for those two.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --run src/data/missionsRepo.test.ts`
Expected: FAIL — `deleteMission` is not exported yet.

- [ ] **Step 4: Implement**

Add to `src/data/missionsRepo.ts` (at the end of the file, after `duplicateMission`):

```ts
// Both buckets key their files under `${missionId}/...` (see
// missionPhotosRepo.ts's missionPhotoPath / planImageStorage.ts's
// planImagePath) — bucket names are duplicated here as literals rather than
// importing BUCKET from those 2 files, since neither exports it and this is
// the only place outside them that needs the name.
async function cleanUpMissionStorage(missionId: string): Promise<void> {
  for (const bucket of ['mission-photos', 'plans']) {
    const { data: entries } = await supabase.storage.from(bucket).list(missionId)
    if (!entries || entries.length === 0) continue
    const paths = entries.map((entry) => `${missionId}/${entry.name}`)
    await supabase.storage.from(bucket).remove(paths)
  }
}

// Deletes the mission row — its `on delete cascade` FKs remove everything
// that references mission_id/plan_id in the database (plans, felt points,
// segments, grids, phenomena, context objects, photo rows...). Storage
// files (actual photo/plan-image binaries, not DB rows) are NOT covered by
// that cascade — cleaned up here separately, best-effort, AFTER the DB
// delete succeeds. The DB delete is the critical, atomic step (the mission
// is genuinely gone once it resolves); a Storage cleanup failure afterward
// is deliberately swallowed, not surfaced as an error — the action the user
// asked for (delete the mission) already succeeded. See design spec §5bis
// for the full reasoning, including why this order (DB-then-Storage) and
// not the reverse.
export async function deleteMission(id: string): Promise<void> {
  const { error } = await supabase.from('mission').delete().eq('id', id)
  if (error) throw new Error(error.message)

  try {
    await cleanUpMissionStorage(id)
  } catch {
    // Best-effort — see doc comment above. Deliberately no rethrow, no log:
    // this project has no logging infrastructure beyond the browser console,
    // and a console.error here would be indistinguishable from a real bug to
    // Laurent glancing at devtools during unrelated debugging.
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/data/missionsRepo.test.ts`
Expected: PASS (all `deleteMission` tests, plus every pre-existing test in the
file — the `storage: { from: vi.fn() }` addition to the shared mock must not
break any test that never touches `storage`).

- [ ] **Step 6: Commit**

```bash
git add src/data/missionsRepo.ts src/data/missionsRepo.test.ts
git commit -m "feat: add deleteMission (DB delete + best-effort Storage cleanup)"
```

---

## Task 2: `clearCurrentSession` dans `currentSession.ts`

**Files:**
- Modify: `src/offline/currentSession.ts`
- Modify: `src/offline/currentSession.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
// appended to src/offline/currentSession.test.ts
it('clears the stored session, so getCurrentSession returns null afterward', async () => {
  await setCurrentSession(mission, exteriorPlan)
  expect(await getCurrentSession()).not.toBeNull()

  await clearCurrentSession()

  expect(await getCurrentSession()).toBeNull()
})

it('is a no-op (does not throw) when nothing was stored yet', async () => {
  await expect(clearCurrentSession()).resolves.toBeUndefined()
})
```

Add `clearCurrentSession` to the existing `import { getCurrentSession,
setCurrentSession } from './currentSession'` line at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/offline/currentSession.test.ts`
Expected: FAIL — `clearCurrentSession` is not exported yet.

- [ ] **Step 3: Implement**

Add to `src/offline/currentSession.ts`:

```ts
export async function clearCurrentSession(): Promise<void> {
  const db = await getDB()
  await db.delete('current_session', SESSION_KEY)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/offline/currentSession.test.ts`
Expected: PASS (5 tests: 3 pre-existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add src/offline/currentSession.ts src/offline/currentSession.test.ts
git commit -m "feat: add clearCurrentSession"
```

---

## Task 3: `ConfirmDialog.tsx` — composant partagé

**Files:**
- Create: `src/components/ConfirmDialog.tsx`
- Create: `src/components/ConfirmDialog.test.tsx`

Composant de confirmation générique (pas spécifique à la suppression de
mission dans son API, même si c'est son seul usage aujourd'hui — un `title`/
`message`/`onConfirm` génériques coûtent la même chose à écrire que des props
spécifiques à "mission" et restent réutilisables si un futur besoin de
confirmation apparaît ailleurs). Gère lui-même : l'état de chargement pendant
`onConfirm`, l'affichage d'erreur, le garde-fou anti-double-clic, et la
vérification de connectivité avant de tenter l'action (voir la correction de
portée en tête de ce plan).

- [ ] **Step 1: Écrire le test qui échoue**

```tsx
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

    expect(await screen.findByRole('alert')).toHaveTextContent(/connexion/i)
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
```


- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/ConfirmDialog.test.tsx`
Expected: FAIL — `ConfirmDialog.tsx` n'existe pas.

- [ ] **Step 3: Implement**

```tsx
// src/components/ConfirmDialog.tsx
import { useState } from 'react'
import { isOnlineNow } from '../offline/connectivity'

export interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}

// Floating-panel style matching MenuBar.tsx's FLOATING_PANEL_STYLE — same
// visual convention, defined locally rather than imported since that
// constant is private to MenuBar.tsx and this component is meant to be used
// from multiple, unrelated callers (MissionList.tsx AND MenuBar.tsx) —
// creating an export dependency from a feature-specific file to a generic
// shared component would be the wrong direction of coupling.
const DIALOG_STYLE = {
  position: 'absolute' as const,
  top: '100%',
  left: 0,
  marginTop: 4,
  padding: 8,
  background: 'white',
  border: '1px solid #ccc',
  borderRadius: 4,
  zIndex: 1200,
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setError(null)
    // Checked here rather than via a persistently-disabled button — see this
    // plan's "Correction de portée" note: no reactive connectivity state
    // exists anywhere in this codebase, so this mirrors the established
    // pattern (attempt the action's connectivity-sensitive part, surface a
    // clear error) rather than introducing new hook infrastructure for one
    // feature.
    const online = await isOnlineNow()
    if (!online) {
      setError('Suppression indisponible hors-ligne — réessayez une fois connecté.')
      return
    }

    setBusy(true)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={DIALOG_STYLE}>
      <p>{title}</p>
      <p>{message}</p>
      {error && (
        <p role="alert">
          {error}
          <button onClick={() => setError(null)}>Fermer</button>
        </p>
      )}
      <button onClick={onCancel} disabled={busy}>Annuler</button>
      <button onClick={handleConfirm} disabled={busy}>{confirmLabel}</button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/ConfirmDialog.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ConfirmDialog.tsx src/components/ConfirmDialog.test.tsx
git commit -m "feat: add shared ConfirmDialog component"
```

---

## Task 4: Câbler la suppression dans `MissionList.tsx`

**Files:**
- Modify: `src/components/MissionList.tsx`
- Modify: `src/components/MissionList.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

`MissionList.tsx` reste un composant purement piloté par ses props (aucun
import de `missionsRepo` aujourd'hui — pattern à conserver) : il affiche le
bouton supprimer par ligne, ouvre `ConfirmDialog`, et délègue l'action réelle
à un nouveau prop `onDeleteMission`. La mise à jour de la liste après succès
se fait dans `App.tsx` (qui possède l'état `missions`), pas dans
`MissionList.tsx` lui-même.

- [ ] **Step 1: Écrire les tests qui échouent**

```tsx
// appended to src/components/MissionList.test.tsx — add near the top of the
// file, alongside the existing imports:
// import { isOnlineNow } from '../offline/connectivity'
// vi.mock('../offline/connectivity')
//
// ConfirmDialog (Task 3) calls the real isOnlineNow() before invoking
// onConfirm — every existing test in this codebase that exercises that path
// mocks it first (see App.test.tsx, ConfirmDialog.test.tsx itself). Without
// this mock, the 3rd test below hits a real network probe in jsdom and
// either times out or is network-flaky.
beforeEach(() => {
  vi.mocked(isOnlineNow).mockResolvedValue(true)
})

it('renders a delete button per mission', () => {
  render(<MissionList missions={[makeMission()]} onSelectMission={vi.fn()} onCreateNew={vi.fn()} onDeleteMission={vi.fn()} />)
  expect(screen.getByRole('button', { name: /supprimer/i })).toBeInTheDocument()
})

it('clicking delete opens a confirmation, cancelling it does not call onDeleteMission', () => {
  const onDeleteMission = vi.fn()
  render(<MissionList missions={[makeMission()]} onSelectMission={vi.fn()} onCreateNew={vi.fn()} onDeleteMission={onDeleteMission} />)
  fireEvent.click(screen.getByRole('button', { name: /supprimer/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
  expect(onDeleteMission).not.toHaveBeenCalled()
  expect(screen.queryByText(/irréversible/i)).not.toBeInTheDocument()
})

it('confirming calls onDeleteMission with the mission', async () => {
  const onDeleteMission = vi.fn().mockResolvedValue(undefined)
  const mission = makeMission()
  render(<MissionList missions={[mission]} onSelectMission={vi.fn()} onCreateNew={vi.fn()} onDeleteMission={onDeleteMission} />)
  fireEvent.click(screen.getByRole('button', { name: /supprimer/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer', exact: true }))
  await waitFor(() => expect(onDeleteMission).toHaveBeenCalledWith(mission))
})
```

(`waitFor` needs adding to this file's `@testing-library/react` import. If this
file already has its own `beforeEach`, merge the `isOnlineNow` stub into it
rather than adding a second `beforeEach` block.)

Note the two "Supprimer" buttons in the 3rd test (the row's own delete
trigger, and the confirmation dialog's confirm button) — `{ name: /supprimer/i
}` for the first click matches the row trigger (assume it's labelled just
"Supprimer" or similar; if you give it a more specific accessible name in Step
3 below, e.g. via `aria-label`, adjust this query to match), and `{ name:
'Supprimer', exact: true }` for the second matches `ConfirmDialog`'s own
`confirmLabel` button.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/MissionList.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `MissionList.tsx`**

```tsx
// src/components/MissionList.tsx
import { useState } from 'react'
import type { Mission } from '../domain/types'
import { ConfirmDialog } from './ConfirmDialog'

export interface MissionListProps {
  missions: Mission[]
  onSelectMission: (mission: Mission) => void
  onCreateNew: () => void
  onDeleteMission: (mission: Mission) => Promise<void>
}

// A relative-positioned wrapper per row so ConfirmDialog (position: absolute,
// top: 100%) anchors under the delete button that opened it — same pattern
// MenuBar.tsx's MENU_TRIGGER_WRAPPER_STYLE already establishes.
const ROW_WRAPPER_STYLE = { position: 'relative' as const }

// listMissions() already sorts by mission_date descending (missionsRepo.ts)
// — no client-side sort needed here (spec §9).
export function MissionList({ missions, onSelectMission, onCreateNew, onDeleteMission }: MissionListProps) {
  const [confirmingMission, setConfirmingMission] = useState<Mission | null>(null)

  return (
    <div>
      <button onClick={onCreateNew}>Nouvelle mission</button>
      <ul>
        {missions.map((mission) => (
          <li key={mission.id} style={ROW_WRAPPER_STYLE}>
            <button onClick={() => onSelectMission(mission)}>
              {mission.address} — {mission.missionDate}
            </button>
            <button onClick={() => setConfirmingMission(mission)}>Supprimer</button>
            {confirmingMission?.id === mission.id && (
              <ConfirmDialog
                title="Supprimer la mission ?"
                message={`«${mission.address} — ${mission.missionDate}» — Cette action est irréversible.`}
                confirmLabel="Supprimer"
                onCancel={() => setConfirmingMission(null)}
                onConfirm={async () => {
                  await onDeleteMission(mission)
                  setConfirmingMission(null)
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Câbler `App.tsx`**

```tsx
import { deleteMission, listMissions } from './data/missionsRepo'
```

```tsx
  async function handleDeleteMission(mission: Mission) {
    await deleteMission(mission.id)
    setPhase((current) =>
      current.name === 'mission-list'
        ? { name: 'mission-list', missions: current.missions.filter((m) => m.id !== mission.id) }
        : current
    )
  }
```

```tsx
          <MissionList
            missions={phase.missions}
            onSelectMission={handleSelectMission}
            onCreateNew={() => setPhase({ name: 'creating' })}
            onDeleteMission={handleDeleteMission}
          />
```

- [ ] **Step 5: Write an `App.tsx`-level integration test**

`App.test.tsx` already mocks `./data/missionsRepo`, `./offline/currentSession`,
and `./offline/connectivity` (`vi.mock` calls near the top of the file) and
does NOT mock `MissionList` — this proves the real wiring end-to-end, not just
`MissionList.tsx`'s own props in isolation:

```tsx
// appended to src/App.test.tsx
it('deleting a mission from the list calls deleteMission and removes it from the rendered list', async () => {
  vi.mocked(missionsRepo.listMissions).mockResolvedValue([existingMission])
  vi.mocked(missionsRepo.deleteMission).mockResolvedValue(undefined)
  vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
  render(<App />)
  await screen.findByText(new RegExp(existingMission.address))

  fireEvent.click(screen.getByRole('button', { name: /supprimer/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer', exact: true }))

  await waitFor(() => expect(missionsRepo.deleteMission).toHaveBeenCalledWith(existingMission.id))
  await waitFor(() => expect(screen.queryByText(new RegExp(existingMission.address))).not.toBeInTheDocument())
})
```

(`existingMission` and the `missionsRepo`/`connectivity` namespace imports
already exist in this file per its current pre-existing tests — reuse them,
don't redeclare.)

- [ ] **Step 6: Run tests, fix any stranded `<MissionList` call sites**

Run: `npm test -- --run src/components/MissionList.test.tsx src/App.test.tsx`
Expected: PASS. `onDeleteMission` is now a required prop — TypeScript will
point at any other `<MissionList .../>` render call site missing it (check
`src/App.test.tsx` in particular before assuming there are none).

- [ ] **Step 7: Run the full suite**

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/MissionList.tsx src/components/MissionList.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: add mission deletion from MissionList"
```

---

## Task 5: Câbler "Supprimer la mission" dans `MenuBar.tsx` (menu Fichier)

**Files:**
- Modify: `src/components/MenuBar.tsx`
- Modify: `src/components/MenuBar.test.tsx`
- Modify: `src/pages/MissionWorkspace.tsx`
- Modify: `src/pages/MissionWorkspace.test.tsx`

Nouvel item "Supprimer la mission" dans le menu Fichier, entre "Imprimer" et
"Quitter la mission", séparé visuellement (spec §4.2 — action destructive vs.
action neutre). Nouveau prop `onDeleteMission: () => Promise<void>` sur
`MenuBarProps`, même convention que `onDuplicateMission`. `MenuBar` possède
son propre état d'ouverture du `ConfirmDialog` (comme `missionInfoOpen`), pas
de logique de connectivité/suppression dans `MenuBar` lui-même — tout ça vit
dans `ConfirmDialog` (Task 3) et dans le prop `onDeleteMission` fourni par
`MissionWorkspace.tsx` (Task 6).

- [ ] **Step 1: Écrire les tests qui échouent**

```tsx
// appended to src/components/MenuBar.test.tsx, inside describe('MenuBar — Fichier')
//
// ConfirmDialog (Task 3) calls the real isOnlineNow() before invoking
// onConfirm. Add near the top of the file, alongside the existing
// `import * as actionHistory` / `vi.mock('../offline/actionHistory')` pair:
//   import * as connectivity from '../offline/connectivity'
//   vi.mock('../offline/connectivity')
// and merge into this file's EXISTING beforeEach (line ~117, which already
// resets the actionHistory mocks) rather than adding a second beforeEach:
//   vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
it('renders "Supprimer la mission" in Fichier, separated from "Quitter la mission" by separators', async () => {
  render(<MenuBar {...baseProps} />)
  openMenu(screen.getByRole('button', { name: /fichier/i }))
  expect(await screen.findByRole('menuitem', { name: /supprimer la mission/i })).toBeInTheDocument()
  // Radix's DropdownMenu.Separator renders with role="separator" — asserts
  // the visual-isolation intent (spec §4.2), not just the item's existence.
  expect(screen.getAllByRole('separator').length).toBeGreaterThanOrEqual(2)
})

it('clicking "Supprimer la mission" opens a confirmation; confirming it calls onDeleteMission', async () => {
  const onDeleteMission = vi.fn().mockResolvedValue(undefined)
  render(<MenuBar {...baseProps} onDeleteMission={onDeleteMission} />)
  openMenu(screen.getByRole('button', { name: /fichier/i }))
  fireEvent.click(await screen.findByRole('menuitem', { name: /supprimer la mission/i }))

  fireEvent.click(await screen.findByRole('button', { name: 'Supprimer', exact: true }))
  await waitFor(() => expect(onDeleteMission).toHaveBeenCalled())
})
```

Update this file's `baseProps` to add `onDeleteMission: vi.fn().mockResolvedValue(undefined)`
— a new non-optional `MenuBarProps` field, needed because every test in this
file spreads `{...baseProps}`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/MenuBar.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

Add `onDeleteMission: () => Promise<void>` to `MenuBarProps` and destructure it.
Add local state:

```tsx
  const [confirmingDelete, setConfirmingDelete] = useState(false)
```

Add the menu item and the dialog to the Fichier `<DropdownMenu.Content>`, right
after "Imprimer" and before "Quitter la mission" — note the separator
(`<DropdownMenu.Separator />`, Radix's own primitive, already exported from
the same `@radix-ui/react-dropdown-menu` package this file already imports as
`DropdownMenu`) before AND after the new item, isolating it from both its
neighbors per spec §4.2's "séparé visuellement... éviter qu'un clic imprécis
sur l'un déclenche l'autre" (applies to both adjacent items, not just Quitter):

```tsx
            <DropdownMenu.Item disabled title="Génération de rapport pas encore disponible">
              Imprimer
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={() => setConfirmingDelete(true)}>
              Supprimer la mission
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={onQuitMission}>Quitter la mission</DropdownMenu.Item>
```

And render the dialog conditionally, alongside the existing `saveError`/
`missionInfoOpen` conditional blocks near the top of the returned JSX:

```tsx
      {confirmingDelete && (
        <ConfirmDialog
          title="Supprimer la mission ?"
          message={`«${missionInfo.address} — ${missionInfo.missionDate}» — Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={onDeleteMission}
        />
      )}
```

(Deliberately NOT wrapping `onDeleteMission` in a local try/catch here, unlike
`handleDuplicate`/`handleUndo` — `ConfirmDialog` already owns its own
busy/error state and calls `onConfirm` directly; `MenuBar` doesn't need a 2nd
layer of error handling for this one action, since success also means this
dialog + the whole `MenuBar` unmount imminently via navigation, see Task 6.)

While in this file: the existing `duplicating` state's doc comment says
"`deleteMission` doesn't exist anywhere in this codebase" — no longer true
once Task 1 lands. Update that comment to drop the now-stale claim (the rest
of its reasoning about `duplicateMission`'s own lack of an idempotency check
still holds and should stay).

Add the import at the top of the file:

```tsx
import { ConfirmDialog } from './ConfirmDialog'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/MenuBar.test.tsx`
Expected: PASS

- [ ] **Step 5: Câbler `MissionWorkspace.tsx`** (voir Task 6 — les 2 étapes sont
  liées, `MenuBarProps` a maintenant un prop requis que ce fichier doit fournir)

Se référer directement à Task 6 pour le contenu exact du handler — l'exécuter
maintenant plutôt que de laisser `MissionWorkspace.tsx` avec une erreur
TypeScript (prop manquant) entre les deux tâches.

- [ ] **Step 6: Run the full suite**

Run: `npm test -- --run`
Expected: PASS (une fois Task 6 également appliqué)

- [ ] **Step 7: Commit**

```bash
git add src/components/MenuBar.tsx src/components/MenuBar.test.tsx src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "feat: add 'Supprimer la mission' to MenuBar's Fichier menu"
```

---

## Task 6: Câbler `onDeleteMission` dans `MissionWorkspace.tsx`

**Files:**
- Modify: `src/pages/MissionWorkspace.tsx`
- Modify: `src/pages/MissionWorkspace.test.tsx`

(Exécutée avec Task 5 — séparée ici pour la clarté du plan, mais les 2 sont un
seul changement cohérent en pratique, à committer ensemble comme indiqué dans
Task 5's Step 7.)

Après suppression réussie de la mission actuellement ouverte : vider
`current_session` si elle référence cette mission (spec §5), puis naviguer
vers la liste des missions.

- [ ] **Step 1: Écrire les tests qui échouent**

**Important, vérifié en lisant le fichier en entier avant d'écrire ce plan** :
`MenuBar` n'est PAS mocké dans `MissionWorkspace.test.tsx` — le seul test
Fichier existant ("Quitter la mission", ligne ~653) rend le VRAI `<MenuBar>`
monté par `Toolbar` dans la phase `ready-no-interior`, l'ouvre via le helper
`openMenu` déjà défini dans ce fichier (ligne ~199), et clique dedans comme un
vrai utilisateur — c'est CE pattern à reproduire ici, pas un mock de props.
Ce fichier ne mocke aujourd'hui ni `../offline/connectivity` ni `../offline/
currentSession` — les deux sont nécessaires : `ConfirmDialog` (Task 3) appelle
`isOnlineNow()` réellement sinon, et `getCurrentSession`/`clearCurrentSession`
(Task 2) toucheraient une vraie IndexedDB sans polyfill dans ce fichier
(`fake-indexeddb/auto` n'y est pas importé) et planteraient le test.

Ajouter en haut du fichier, aux côtés des imports namespace existants
(`import * as plansRepo from '../data/plansRepo'` etc.) :

```tsx
import * as currentSessionModule from '../offline/currentSession'
import * as connectivity from '../offline/connectivity'
```

Et aux côtés des `vi.mock(...)` existants en haut du fichier :

```tsx
vi.mock('../offline/currentSession')
vi.mock('../offline/connectivity')
```

(`../data/missionsRepo` est déjà mocké dans ce fichier — `deleteMission` sera
donc automatiquement un `vi.fn()`, pas besoin d'un `vi.mock` supplémentaire
pour lui, seulement de définir sa valeur résolue par test comme les autres
fonctions de ce module le sont déjà.)

```tsx
// appended to src/pages/MissionWorkspace.test.tsx, dans le describe/bloc où
// vit déjà le test "Quitter la mission" (même pattern : vrai MenuBar, vrai
// openMenu, vrais clics)
it('onDeleteMission calls deleteMission, clears current_session when it matches the deleted mission, and navigates to the mission list', async () => {
  vi.mocked(missionsRepo.deleteMission).mockResolvedValue(undefined)
  vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
  vi.mocked(currentSessionModule.getCurrentSession).mockResolvedValue({
    mission: missionWithOrigin,
    exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null },
  })
  const onNavigateToMissionList = vi.fn()
  render(
    <MissionWorkspace
      initialResumePhase={{ name: 'ready-no-interior', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
      onNavigateToMissionList={onNavigateToMissionList}
      onNavigateToNewMission={vi.fn()}
    />
  )
  await screen.findByTestId('site-map-view')

  openMenu(screen.getByRole('button', { name: /fichier/i }))
  fireEvent.click(await screen.findByRole('menuitem', { name: /supprimer la mission/i }))
  fireEvent.click(await screen.findByRole('button', { name: 'Supprimer', exact: true }))

  await waitFor(() => expect(missionsRepo.deleteMission).toHaveBeenCalledWith('m1'))
  expect(currentSessionModule.clearCurrentSession).toHaveBeenCalled()
  expect(onNavigateToMissionList).toHaveBeenCalled()
})

it('does not clear current_session when it references a different mission', async () => {
  vi.mocked(missionsRepo.deleteMission).mockResolvedValue(undefined)
  vi.mocked(connectivity.isOnlineNow).mockResolvedValue(true)
  vi.mocked(currentSessionModule.getCurrentSession).mockResolvedValue({
    mission: { ...missionWithOrigin, id: 'some-other-mission' },
    exteriorPlan: { id: 'p2', missionId: 'some-other-mission', kind: 'exterieur', imageUrl: null, calibration: null },
  })
  const onNavigateToMissionList = vi.fn()
  render(
    <MissionWorkspace
      initialResumePhase={{ name: 'ready-no-interior', mission: missionWithOrigin, exteriorPlan: { id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null } }}
      onNavigateToMissionList={onNavigateToMissionList}
      onNavigateToNewMission={vi.fn()}
    />
  )
  await screen.findByTestId('site-map-view')

  openMenu(screen.getByRole('button', { name: /fichier/i }))
  fireEvent.click(await screen.findByRole('menuitem', { name: /supprimer la mission/i }))
  fireEvent.click(await screen.findByRole('button', { name: 'Supprimer', exact: true }))

  await waitFor(() => expect(missionsRepo.deleteMission).toHaveBeenCalledWith('m1'))
  expect(currentSessionModule.clearCurrentSession).not.toHaveBeenCalled()
  expect(onNavigateToMissionList).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/pages/MissionWorkspace.test.tsx`
Expected: FAIL — `onDeleteMission` n'est pas encore passé à `MenuBar`.

- [ ] **Step 3: Implement**

```tsx
import { deleteMission, duplicateMission } from '../data/missionsRepo'
import { getCurrentSession, clearCurrentSession } from '../offline/currentSession'
```

(`duplicateMission` est déjà importé aujourd'hui — ajouter `deleteMission` à
la même ligne d'import plutôt que dupliquer l'import. `getCurrentSession`/
`clearCurrentSession` sont de nouveaux imports.)

```tsx
                onDeleteMission={async () => {
                  await deleteMission(phase.mission.id)
                  const cached = await getCurrentSession()
                  if (cached?.mission.id === phase.mission.id) {
                    await clearCurrentSession()
                  }
                  onNavigateToMissionList()
                }}
```

(à ajouter dans le JSX de `<MenuBar>`, aux côtés de `onDuplicateMission`/
`onQuitMission` déjà présents.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/pages/MissionWorkspace.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full suite** (voir aussi Task 5 Step 6 — même
  vérification, faite une fois les deux tâches en place)

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 6: Commit** — voir Task 5 Step 7 (un seul commit pour les 2 tâches).

---

## Task 7: Vérification finale

**Files:** aucun (vérification uniquement)

- [ ] **Step 1: Suite de tests complète**

Run: `npm test -- --run`
Expected: PASS, tous les fichiers. **Note connue, sans rapport avec ce
chantier** : `src/vision/arucoDetector.test.ts` a un test qui échoue de façon
répétable sous charge complète (contention de ressources) mais passe de façon
fiable isolément — confirmé avant de démarrer ce plan, décision de Laurent de
ne pas s'en occuper ici. Si CE test échoue seul (pas les autres), relancer une
fois avant de s'inquiéter ; si un AUTRE test échoue, investiguer normalement —
ne pas supposer que tout échec est cette même flakiness connue.

- [ ] **Step 2: Build TypeScript**

Run: `npm run build`
Expected: réussit sans erreur — seul point de ce plan qui type-check tout
l'arbre (`vitest` transpile sans type-checker).

- [ ] **Step 3: Vérification manuelle en navigateur réel**

Utiliser le workflow de vérification `superpowers:` disponible dans cet
environnement (`preview_start` + outils navigateur), pas demander à Laurent de
vérifier manuellement. À couvrir :
- Depuis la liste des missions : bouton Supprimer visible par ligne, clic
  ouvre la confirmation, Annuler ferme sans effet, Supprimer retire bien la
  mission de la liste affichée.
- Depuis une mission ouverte : menu Fichier → "Supprimer la mission" (bien
  séparé visuellement de "Quitter la mission" et "Imprimer"), même flux de
  confirmation, navigation vers la liste après succès.
- Confirmer dans le réseau/logs Supabase (ou par un aller-retour rapide
  recharger-la-liste) que la mission a bien disparu côté serveur, pas
  seulement de l'affichage local.
- Aucune erreur console au-delà du bruit CORS déjà connu si le port de test
  n'est pas dans les origines autorisées Supabase (voir le chantier
  ruban/menus précédent pour ce même piège, non spécifique à ce chantier-ci).

- [ ] **Step 4: Commit de tout correctif trouvé en vérification manuelle, si nécessaire**

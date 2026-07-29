# Erreurs non bloquantes dans MissionWorkspace — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if
> subagents available) or superpowers:executing-plans to implement this plan. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trois actions de `MissionWorkspace.tsx` (upload de photo de plan intérieur,
calibration du plan intérieur, sauvegarde du bilan global) restent volontairement en
ligne, mais leur échec ne doit plus jamais bloquer tout l'écran terrain ni perdre
silencieusement un changement.

**Architecture:** Un état local structuré `nonBlockingError: { action, message } | null`
dans `MissionWorkspace`, affiché comme une bannière `role="alert"` préfixée par un
libellé d'action, distincte de l'état `phase: 'error'` bloquant existant et de
l'alerte interne déjà présente dans `PlanCalibrationTool`.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (mêmes conventions que
le reste de `MissionWorkspace.test.tsx` — mocks de modules entiers via `vi.mock`).

**Spec de référence :** `docs/superpowers/specs/2026-07-28-nonblocking-mission-workspace-errors-design.md`
(relue et approuvée — 2 passes de relecture, s'y référer pour le contexte/raisonnement
que ce plan ne répète pas).

---

## Chunk 1: État partagé, bannière, et câblage des 3 handlers

### Task 1: Scaffolding + câblage de `handleInteriorFileChosen`

**Files:**
- Modify: `src/pages/MissionWorkspace.tsx`
- Modify: `src/pages/MissionWorkspace.test.tsx`

Ajoute le type `NonBlockingErrorAction`/`NonBlockingError`, la constante
`ACTION_LABELS`, l'état `nonBlockingError`, la bannière dans la phase
`ready-no-interior`, et met à jour `handleInteriorFileChosen` pour l'utiliser au lieu
de basculer `phase` sur `error`.

- [ ] **Step 1: Write the failing test**

Ajouter dans `src/pages/MissionWorkspace.test.tsx`, dans le même `describe` que le test
existant `'uploads a chosen interior file, then shows the calibration tool'` (autour de
la ligne 273) :

```typescript
it('shows a non-blocking banner (not the full-page error) when the interior file upload fails', async () => {
  vi.mocked(plansRepo.createPlan).mockResolvedValue({
    id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
  })
  vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
  vi.mocked(planImageStorage.uploadPlanImage).mockRejectedValue(new Error('network down'))

  render(<MissionWorkspace />)
  await advanceToOriginSetting()
  await advanceToReadyNoInterior()
  await screen.findByLabelText(/importer un plan intérieur/i)

  const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
  fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })

  await waitFor(() =>
    expect(screen.getByText(/import du plan intérieur.*network down/i)).toBeInTheDocument()
  )
  // Le reste de l'écran terrain reste monté — pas basculé en page d'erreur pleine page.
  expect(screen.getByTestId('site-map-view')).toBeInTheDocument()
})

it('clears a stale upload error banner once a retry on the same action succeeds', async () => {
  vi.mocked(plansRepo.createPlan).mockResolvedValue({
    id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
  })
  vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
  vi.mocked(planImageStorage.uploadPlanImage)
    .mockRejectedValueOnce(new Error('network down'))
    .mockResolvedValueOnce('https://x/plan.jpg')

  render(<MissionWorkspace />)
  await advanceToOriginSetting()
  await advanceToReadyNoInterior()
  await screen.findByLabelText(/importer un plan intérieur/i)
  const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })

  fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })
  await screen.findByText(/import du plan intérieur.*network down/i)

  fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })

  await waitFor(() => expect(screen.queryByText(/network down/i)).not.toBeInTheDocument())
  expect(await screen.findByText('simulate-calibrated')).toBeInTheDocument()
})
```

Note : `role="alert"` n'expose pas son texte comme "accessible name" (pas de
`nameFrom: 'contents'` pour ce rôle ARIA) — `getByRole('alert', {name: /.../})` ne
matcherait jamais sur le texte affiché. C'est pour ça que ce test (et tous les
suivants de ce plan) vérifie le message via `getByText`/`queryByText`, jamais via le
paramètre `name` de `getByRole`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/pages/MissionWorkspace.test.tsx`
Expected: FAIL — les deux nouveaux tests échouent (le texte de bannière n'existe pas
encore, `handleInteriorFileChosen` bascule toujours `phase` sur `error`).

- [ ] **Step 3: Write minimal implementation**

Dans `src/pages/MissionWorkspace.tsx`, juste après la fonction `messageOf` (ligne
52-54), ajouter :

```typescript
type NonBlockingErrorAction = 'upload' | 'calibration' | 'assessment'

interface NonBlockingError {
  action: NonBlockingErrorAction
  message: string
}

const ACTION_LABELS: Record<NonBlockingErrorAction, string> = {
  upload: 'Import du plan intérieur : ',
  calibration: 'Calage du plan : ',
  assessment: 'Bilan global : ',
}
```

Dans le composant, ajouter l'état (avec les autres `useState`/après la déclaration de
`phase`, ligne ~67) :

```typescript
const [nonBlockingError, setNonBlockingError] = useState<NonBlockingError | null>(null)
```

Modifier `handleInteriorFileChosen` (lignes 121-134) :

```typescript
async function handleInteriorFileChosen(file: File) {
  if (phase.name !== 'ready-no-interior') return
  setNonBlockingError(null)
  try {
    const url = await uploadPlanImage(phase.mission.id, file)
    setPhase({
      name: 'calibrating-interior',
      mission: phase.mission,
      exteriorPlan: phase.exteriorPlan,
      imageUrl: url,
    })
  } catch (err) {
    setNonBlockingError({ action: 'upload', message: messageOf(err) })
  }
}
```

Dans le `case 'ready-no-interior'` (ligne 183-229), ajouter la bannière comme premier
enfant du `<div style={FLEX_COLUMN_FULL_HEIGHT_STYLE}>` (avant
`<div style={MAP_WRAPPER_STYLE}>`) :

```tsx
<div style={FLEX_COLUMN_FULL_HEIGHT_STYLE}>
  {nonBlockingError && (
    <p role="alert">
      {ACTION_LABELS[nonBlockingError.action]}
      {nonBlockingError.message}
    </p>
  )}
  <div style={MAP_WRAPPER_STYLE}>
    ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/pages/MissionWorkspace.test.tsx`
Expected: PASS (tous les tests existants + les 2 nouveaux)

- [ ] **Step 5: Commit**

```bash
git add src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "feat: non-blocking error banner for interior plan upload failures"
```

### Task 2: Câblage de `handleInteriorCalibrated`

**Files:**
- Modify: `src/pages/MissionWorkspace.tsx`
- Modify: `src/pages/MissionWorkspace.test.tsx`

- [ ] **Step 1: Write the failing test**

Ajouter, dans le même `describe` que `'saves an interior Plan once calibration
completes'` (autour de la ligne 292) :

```typescript
it('shows a non-blocking banner (not the full-page error) when saving the interior plan fails, distinct from PlanCalibrationTool\'s own alert', async () => {
  vi.mocked(plansRepo.createPlan)
    .mockResolvedValueOnce({ id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null })
    .mockRejectedValueOnce(new Error('network down'))
  vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
  vi.mocked(planImageStorage.uploadPlanImage).mockResolvedValue('https://x/plan.jpg')

  render(<MissionWorkspace />)
  await advanceToOriginSetting()
  await advanceToReadyNoInterior()
  await screen.findByLabelText(/importer un plan intérieur/i)
  const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
  fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })
  await screen.findByText('simulate-calibrated')

  fireEvent.click(screen.getByText('simulate-calibrated'))

  await waitFor(() =>
    expect(screen.getByText(/calage du plan.*network down/i)).toBeInTheDocument()
  )
  // Toujours dans calibrating-interior, PAS l'écran d'erreur plein page — le
  // bouton de simulation de calibration (rendu par PlanCalibrationTool) reste là.
  expect(screen.getByText('simulate-calibrated')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/pages/MissionWorkspace.test.tsx`
Expected: FAIL — `handleInteriorCalibrated` bascule encore `phase` sur `error`, ce qui
démonte `PlanCalibrationTool` (donc `simulate-calibrated` disparaît).

- [ ] **Step 3: Write minimal implementation**

Modifier `handleInteriorCalibrated` (lignes 136-151) :

```typescript
async function handleInteriorCalibrated(calibration: AffineTransform) {
  if (phase.name !== 'calibrating-interior') return
  setNonBlockingError(null)
  try {
    await createPlan({
      missionId: phase.mission.id,
      kind: 'interieur',
      imageUrl: phase.imageUrl,
      calibration,
    })
    setPhase({ name: 'ready-no-interior', mission: phase.mission, exteriorPlan: phase.exteriorPlan })
  } catch (err) {
    setNonBlockingError({ action: 'calibration', message: messageOf(err) })
  }
}
```

Modifier le `case 'calibrating-interior'` (lignes 231-239) pour envelopper
`<PlanCalibrationTool>` dans un fragment avec la bannière en premier enfant :

```tsx
case 'calibrating-interior':
  return (
    <>
      {nonBlockingError && (
        <p role="alert">
          {ACTION_LABELS[nonBlockingError.action]}
          {nonBlockingError.message}
        </p>
      )}
      <PlanCalibrationTool
        imageUrl={phase.imageUrl}
        missionOrigin={{ lat: phase.mission.originLat!, lng: phase.mission.originLng! }}
        mapCenter={[phase.mission.originLat!, phase.mission.originLng!]}
        onCalibrated={handleInteriorCalibrated}
      />
    </>
  )
```

Note : `PlanCalibrationTool` garde sa propre alerte interne (`PlanCalibrationTool.tsx:101`,
pour les échecs de validation géométrique) totalement inchangée — les deux bannières
peuvent coexister à l'écran, ce n'est PAS un bug.

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/pages/MissionWorkspace.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "feat: non-blocking error banner for interior plan calibration failures"
```

### Task 3: Câblage de `GlobalAssessmentBar.onChange` + test de nettoyage inter-actions

**Files:**
- Modify: `src/pages/MissionWorkspace.tsx`
- Modify: `src/pages/MissionWorkspace.test.tsx`

- [ ] **Step 1: Write the failing test**

Ajouter, dans le même `describe` que `'renders GlobalAssessmentBar ... and calls
setGlobalAssessment on change'` (autour de la ligne 349) :

```typescript
it('shows a non-blocking banner when saving the global assessment fails, without an unhandled rejection', async () => {
  vi.mocked(plansRepo.createPlan).mockResolvedValue({
    id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
  })
  vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)

  render(<MissionWorkspace />)
  // advanceToOriginSetting() lui-même configure setGlobalAssessment pour
  // RÉSOUDRE (c'est cet appel qui fait avancer de global-assessment vers
  // setting-origin) — donc on ne peut PAS pré-configurer le rejet avant cet
  // appel, il serait écrasé. On reconfigure setGlobalAssessment pour rejeter
  // seulement APRÈS être arrivé sur ready-no-interior, juste avant de
  // déclencher le changement de curseur qu'on veut faire échouer.
  await advanceToOriginSetting()
  await advanceToReadyNoInterior()
  await screen.findByTestId('global-assessment-bar')
  vi.mocked(missionsRepo.setGlobalAssessment).mockRejectedValue(new Error('network down'))

  fireEvent.click(screen.getByText('simulate-bar-change'))

  await waitFor(() =>
    expect(screen.getByText(/bilan global.*network down/i)).toBeInTheDocument()
  )
  // Toujours ready-no-interior, pas l'écran d'erreur plein page.
  expect(screen.getByTestId('site-map-view')).toBeInTheDocument()
})

it('clears a stale banner from one action when a different action starts a new attempt', async () => {
  vi.mocked(plansRepo.createPlan).mockResolvedValue({
    id: 'p1', missionId: 'm1', kind: 'exterieur', imageUrl: null, calibration: null,
  })
  vi.mocked(missionsRepo.setMissionOrigin).mockResolvedValue(missionWithOrigin)
  vi.mocked(planImageStorage.uploadPlanImage).mockRejectedValue(new Error('upload failed'))
  // Pas besoin de reconfigurer setGlobalAssessment ici : advanceToOriginSetting()
  // le configure déjà pour résoudre (nécessaire pour avancer jusqu'à
  // ready-no-interior), et ce test n'a pas besoin d'une réponse précise — il
  // vérifie seulement que setNonBlockingError(null), appelé au tout début du
  // handler onChange (avant même l'appel réseau), efface le message d'upload
  // encore affiché.

  render(<MissionWorkspace />)
  await advanceToOriginSetting()
  await advanceToReadyNoInterior()
  await screen.findByLabelText(/importer un plan intérieur/i)

  const file = new File(['x'], 'plan.jpg', { type: 'image/jpeg' })
  fireEvent.change(screen.getByLabelText(/importer un plan intérieur/i), { target: { files: [file] } })
  await screen.findByText(/import du plan intérieur.*upload failed/i)

  fireEvent.click(screen.getByText('simulate-bar-change'))

  await waitFor(() => expect(screen.queryByText(/upload failed/i)).not.toBeInTheDocument())
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node_modules/.bin/vitest.cmd run src/pages/MissionWorkspace.test.tsx`
Expected: FAIL — `GlobalAssessmentBar`'s `onChange` n'a aucun `try/catch`, l'échec
devient une rejection non gérée (le premier nouveau test échoue) ; le second test
échoue aussi tant que le premier échec n'est pas géré du tout.

- [ ] **Step 3: Write minimal implementation**

Modifier le callback `onChange` de `<GlobalAssessmentBar>` (lignes 213-226) :

```tsx
<GlobalAssessmentBar
  values={{
    causeArchitectural: phase.mission.causeArchitectural ?? 0,
    causeElectromagnetique: phase.mission.causeElectromagnetique ?? 0,
    causeGeobiologique: phase.mission.causeGeobiologique ?? 0,
    causeParanormale: phase.mission.causeParanormale ?? 0,
    causeAutres: phase.mission.causeAutres ?? 0,
    bovisRate: phase.mission.bovisRate ?? 0,
  }}
  onChange={async (values) => {
    setNonBlockingError(null)
    try {
      const updated = await setGlobalAssessment(phase.mission.id, values)
      setPhase({ name: 'ready-no-interior', mission: updated, exteriorPlan: phase.exteriorPlan })
    } catch (err) {
      setNonBlockingError({ action: 'assessment', message: messageOf(err) })
    }
  }}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node_modules/.bin/vitest.cmd run src/pages/MissionWorkspace.test.tsx`
Expected: PASS (tous les tests du fichier, existants + tous les nouveaux de ce plan)

- [ ] **Step 5: Commit**

```bash
git add src/pages/MissionWorkspace.tsx src/pages/MissionWorkspace.test.tsx
git commit -m "feat: non-blocking error banner for global assessment save failures"
```

**End of Chunk 1 — dispatch plan-document-reviewer before continuing.**

---

## Vérification finale

- [ ] Run: `node_modules/.bin/vitest.cmd run src/pages/MissionWorkspace.test.tsx` —
  attendu : tous les tests passent (existants + 5 nouveaux de ce plan).
- [ ] Run: `node_modules/.bin/vitest.cmd run --maxWorkers=2` (suite complète) —
  attendu : aucune régression par rapport à la baseline actuelle de `master`.
- [ ] Run: `npx tsc -b` — attendu : aucune erreur.
- [ ] Vérification manuelle rapide (pas obligatoire pour ce chantier ciblé, mais utile
  vu qu'il touche à de la vraie UX terrain) : couper le réseau dans les devtools,
  essayer d'importer un plan intérieur, vérifier que la bannière apparaît et que le
  reste de l'écran (carte, sidebar) reste utilisable.

# Erreurs non bloquantes dans MissionWorkspace (upload plan intérieur, calibration, bilan global) — Design

**Statut : à relire (spec-document-reviewer).**

## 1. Contexte et objectif

Le chantier "mode hors-ligne terrain" (25 tâches, mergé sur `master` le 27/07/2026) a
livré un cache-through IndexedDB complet sur 9 repos, un point d'entrée hors-ligne, une
synchro automatique et un indicateur UI permanent. Sa revue finale a identifié un trou
resté hors périmètre : trois actions dans `src/pages/MissionWorkspace.tsx` restent
strictement en ligne (décision déjà actée pour `createPlan` — Task 5.1 du plan
précédent : "la calibration de plan intérieur... reste un cas de préparation, jamais
nécessaire pour une mission dont le préchargement a réussi") mais **échouent mal**
quand le réseau n'est pas là :

- `handleInteriorFileChosen` (upload de la photo de plan intérieur, `uploadPlanImage`)
  et `handleInteriorCalibrated` (`createPlan` avec `kind: 'interieur'`) : leur `catch`
  bascule `phase` sur `{ name: 'error', message }` — un état qui **remplace tout
  l'écran terrain** par une page d'erreur, seule sortie possible : recharger l'app.
- `GlobalAssessmentBar.onChange` (les 6 curseurs de bilan global,
  `setGlobalAssessment`) : **aucune gestion d'erreur du tout** — un échec est une
  rejection de promesse non attrapée, le changement de curseur est perdu
  silencieusement, sans aucun signal à l'utilisateur.

Objectif de ce chantier : ces trois actions **restent en ligne uniquement** (aucune
mise en cache/synchro différée n'est demandée — décision confirmée avec Laurent), mais
leur échec ne doit plus jamais empêcher de continuer à utiliser le reste de l'écran
terrain (relevé de points/segments/grilles, déjà pleinement fonctionnel hors-ligne
depuis le chantier précédent).

Le précédent existe déjà dans la même codebase : `MissionPhotosGallery` gère son
propre état d'erreur local (`useState<string | null>`, affiché `<p role="alert">`),
jamais routé vers l'état `phase: 'error'` bloquant de la page.

## 2. Périmètre

**Inclus** :
1. `handleInteriorFileChosen` — remplacer le `setPhase({name:'error',...})` de son
   `catch` par un état d'erreur local non bloquant.
2. `handleInteriorCalibrated` — même correctif.
3. `GlobalAssessmentBar.onChange` (dans `MissionWorkspace.tsx`, où le callback est
   défini) — ajouter un `try/catch` (absent aujourd'hui) utilisant le même état
   d'erreur local.

**Exclu (confirmé avec Laurent)** :
- Faire fonctionner l'upload de plan intérieur réellement hors-ligne (cache local du
  fichier binaire + synchronisation différée) — chantier bien plus lourd, l'architecture
  cache-through existante est conçue pour des lignes de données, pas des blobs
  binaires ; hors périmètre.
- Tout changement à `createPlan`/`setGlobalAssessment`/`uploadPlanImage` eux-mêmes —
  ils restent des appels réseau directs, sans wrapper offline.
- Toute autre action de préparation de mission (formulaire de création, sélection de
  parcelles, etc.) — déjà couvertes ou hors sujet.

## 3. Conception

**État ajouté** : un seul état local dans `MissionWorkspace`, mais **structuré**, pas
une simple chaîne :
```ts
nonBlockingError: { action: 'upload' | 'calibration' | 'assessment'; message: string } | null
```
Partagé par les 3 handlers (même cause racine, même traitement — pas de valeur à créer
3 états séparés), mais le champ `action` évite qu'un message affiché soit attribué à
la mauvaise action. Un libellé par action est préfixé à l'affichage (le `…` ci-dessous
n'est PAS littéral, il indique juste "le message suit" — le libellé réel n'a pas de
points de suspension) :
`upload` → `"Import du plan intérieur : "`, `calibration` → `"Calage du plan : "`,
`assessment` → `"Bilan global : "`. Exemple de rendu complet pour un échec d'upload :
`"Import du plan intérieur : Failed to fetch"`.

**Simplification acceptée (pas un bug à corriger ici)** : les 3 handlers partagent un
seul état, donc si deux échouent à quelques centaines de ms d'écart (ex. upload de
fichier pendant qu'une sauvegarde de curseur — débouncée 500ms via
`useDebouncedCallback` — est encore en vol), seul le message le plus récent reste
affiché ; le premier est silencieusement remplacé. Accepté comme limite connue et
documentée (le libellé par action rend au moins le message affiché non ambigu) plutôt
que de construire un système de bannières multiples pour un cas limite rare en usage
réel solo-terrain — YAGNI.

**Affichage** :
```tsx
{nonBlockingError && <p role="alert">{ACTION_LABELS[nonBlockingError.action]} {nonBlockingError.message}</p>}
```
- Phase `ready-no-interior` : rendu en haut du `<div style={FLEX_COLUMN_FULL_HEIGHT_STYLE}>`
  existant (case `'ready-no-interior'` de `MissionWorkspace.tsx`), avant `SiteMapView`
  — aucune restructuration de wrapper nécessaire, ce `<div>` existe déjà.
- Phase `calibrating-interior` : le `case` actuel retourne un `<PlanCalibrationTool>`
  **nu, sans wrapper** (`MissionWorkspace.tsx:231-239`). Ce chantier ajoute un wrapper
  fragment `<>...</>` autour de la bannière et de `<PlanCalibrationTool>`, la bannière
  en premier enfant.
- **Ne pas confondre avec l'alerte déjà existante dans `PlanCalibrationTool.tsx:101`**
  (`<p role="alert">{error}</p>` interne, pour les échecs de validation géométrique du
  calage — ex. points de contrôle colinéaires — une classe d'erreur totalement
  différente, cliente, synchrone, jamais réseau). Les deux bannières peuvent coexister
  à l'écran (une pour un échec `createPlan` réseau, une pour un échec de calage
  géométrique) — ne PAS les fusionner ni en supprimer une. Un test qui cherche
  `role="alert"` doit donc cibler le texte du message (`getByText`/`getByRole('alert',
  {name: /.../})`), jamais un `getByRole('alert')` nu qui échouerait si les deux sont
  visibles en même temps.

**Comportement de chaque handler** :
- Au début de la tentative : `setNonBlockingError(null)` (efface un message périmé
  d'un essai précédent, pour ne pas laisser un message obsolète affiché après un
  retry réussi).
- Sur succès : comportement inchangé (transition de phase, etc.).
- Sur échec : `setNonBlockingError({ action: '...', message: messageOf(err) })` au lieu
  de `setPhase({name:'error',...})` (pour les deux premiers) ou au lieu de laisser
  l'erreur non attrapée (pour le troisième). La phase courante ne change pas —
  l'utilisateur reste sur l'écran où il était, peut immédiatement réessayer (re-choisir
  un fichier, recliquer calibrer, rebouger un curseur).

**Cas non géré délibérément** : pas de rollback visuel pour `GlobalAssessmentBar` — le
curseur reste affiché à la position choisie par l'utilisateur même si la sauvegarde a
échoué (`GlobalAssessmentBar.tsx:36` : l'état local `local` n'est jamais resynchronisé
sur la prop `values` après le montage initial, donc aucun retour en arrière visuel ne
se produit naturellement — cohérent avec l'absence actuelle de tout état "en cours
d'enregistrement" sur ce composant). Un futur curseur pourrait re-tenter
automatiquement ou indiquer un état "non sauvegardé", mais ce n'est pas demandé ici
(YAGNI).

## 4. Tests

Pour chacun des 3 points, un test simulant un échec (mock rejeté) vérifiant :
(a) le message d'erreur (préfixé par son libellé d'action) apparaît, ciblé par son
texte précis (pas un `getByRole('alert')` nu, qui peut matcher l'alerte interne de
`PlanCalibrationTool` en phase `calibrating-interior`) ;
(b) le reste de l'écran terrain (`SiteMapView`/`PlanCalibrationTool` selon la phase)
reste monté et interactif — pas remplacé par l'écran d'erreur plein page ;
(c) pour les deux premiers, `phase` n'a pas changé (toujours `ready-no-interior` ou
`calibrating-interior`, jamais `error`) ;
(d) un test dédié : un premier échec affiche son message, une nouvelle tentative
(réussie ou non) sur la MÊME action efface l'ancien message avant que le résultat de
la nouvelle tentative ne s'affiche — vérifie explicitement le comportement "efface au
début de chaque tentative" décrit en §3 ;
(e) un test dédié : un échec sur une action affiche son message, puis le DÉMARRAGE
d'une tentative sur une AUTRE action efface aussi ce message (conséquence directe de
l'état partagé unique — le "début de chaque tentative" en §3 n'est pas scopé par
action, `setNonBlockingError(null)` s'exécute pour n'importe laquelle des 3 tentatives).

## 5. Ce qui ne change pas

Tout le reste de `MissionWorkspace.tsx` reste inchangé — en particulier
`handleMissionCreated` (`createPlan` pour le plan extérieur) et
`handleGlobalAssessmentSaved` (premier `setGlobalAssessment` + `geocodeAddress`, avant
que l'écran terrain existe), qui continuent de basculer `phase` sur `error` en cas
d'échec : à ce stade de la préparation, il n'y a pas encore d'écran terrain à préserver,
donc l'état d'erreur bloquant reste approprié. `PlanCalibrationTool`'s propre alerte
interne (validation géométrique du calage) n'est pas touchée. Le mode hors-ligne déjà
livré (cache-through, sync, indicateur) reste inchangé.

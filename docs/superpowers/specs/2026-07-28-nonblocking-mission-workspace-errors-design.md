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

**État ajouté** : un seul état local dans `MissionWorkspace`,
`nonBlockingError: string | null` (`useState`), partagé par les 3 handlers plutôt
qu'un état par action — même cause racine, même traitement, pas de valeur à les
séparer.

**Affichage** : `{nonBlockingError && <p role="alert">{nonBlockingError}</p>}` rendu en
haut de la zone terrain (`ready-no-interior`/`calibrating-interior`), toujours visible
au-dessus du reste du contenu de la phase — jamais un remplacement plein écran.

**Comportement de chaque handler** :
- Au début de la tentative : `setNonBlockingError(null)` (efface un message périmé
  d'un essai précédent, pour ne pas laisser un message obsolète affiché après un
  retry réussi).
- Sur succès : comportement inchangé (transition de phase, etc.).
- Sur échec : `setNonBlockingError(messageOf(err))` au lieu de
  `setPhase({name:'error',...})` (pour les deux premiers) ou au lieu de laisser
  l'erreur non attrapée (pour le troisième). La phase courante ne change pas —
  l'utilisateur reste sur l'écran où il était, peut immédiatement réessayer (re-choisir
  un fichier, recliquer calibrer, rebouger un curseur).

**Cas non géré délibérément** : pas de rollback visuel pour `GlobalAssessmentBar` — le
curseur reste affiché à la position choisie par l'utilisateur même si la sauvegarde a
échoué, cohérent avec l'absence actuelle de tout état "en cours d'enregistrement" sur
ce composant. Un futur curseur pourrait re-tenter automatiquement ou indiquer un état
"non sauvegardé", mais ce n'est pas demandé ici (YAGNI).

## 4. Tests

Pour chacun des 3 points, un test simulant un échec (mock rejeté) vérifiant :
(a) le message d'erreur apparaît via `role="alert"` ;
(b) le reste de l'écran terrain (`SiteMapView` ou équivalent visible dans la phase
courante) reste monté et interactif — pas remplacé par l'écran d'erreur plein page ;
(c) pour les deux premiers, `phase` n'a pas changé (toujours `ready-no-interior` ou
`calibrating-interior`, jamais `error`).

## 5. Ce qui ne change pas

Tout le reste de `MissionWorkspace.tsx` (les autres handlers, `phase: 'error'` pour les
échecs qui doivent réellement bloquer — ex. échec de `createMission`/
`setGlobalAssessment` initial avant que l'écran terrain existe, échec de
`deriveResumePhase`), et tout le mode hors-ligne déjà livré (cache-through, sync,
indicateur) restent inchangés.

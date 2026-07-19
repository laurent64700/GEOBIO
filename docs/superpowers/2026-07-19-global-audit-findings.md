# Audit global — 2026-07-19 (branche `plan1-moteur-reseaux`)

Passe finale de cohérence après l'exécution complète du Plan 1 (34 tâches) et du
sous-projet Bagua/Feng Shui (9 tâches). État vérifié au moment de l'audit :
**153 tests passent (38 fichiers), `tsc -b --noEmit` propre.**

Audit en lecture seule : rien n'a été corrigé dans le code. Chaque constat cite
fichier:ligne et un scénario d'échec concret. Classement par sévérité décroissante.

---

## S1 — Bloquants en production (actions humaines requises)

### S1.1 Migration 0012 non poussée → tout le flux Bagua échoue en prod
Vérifié via `npx supabase migration list` (projet lié « GEOBIO LP ») :
**0001–0011 sont sur le remote, 0012 (`mission_building_footprint`) ne l'est pas.**
La colonne `mission.building_footprint` n'existe donc pas en base distante.

Scénario : l'utilisateur clique un bâtiment candidat → `setBuildingFootprint`
(`src/data/missionsRepo.ts:130`) → erreur Postgres « column does not exist » →
`SiteMapView` affiche l'erreur et **remplace toute la carte** (voir S2.1).
Le Bagua est mort en production tant que `npx supabase db push` n'a pas été
exécuté (avec l'autorisation de Laurent, selon le workflow établi).

### S1.2 Bucket Storage `plans` inexistant → upload de plan intérieur impossible
Vérifié via `npx supabase storage ls` : **seul `mission-photos/` existe.**
`src/data/planImageStorage.ts:4` référence un bucket `plans` qui n'a jamais été
créé. Scénario : « Importer un plan intérieur » → `upload()` échoue (bucket not
found) → phase `error` de MissionWorkspace. À créer **en privé** (le code signe
des URLs, il suppose un bucket privé — le plan d'implémentation d'origine disait
« public », c'est le code qui fait foi désormais).

### S1.3 Politiques RLS Storage non confirmées → uploads anonymes probablement rejetés
Les deux modules storage supposent des buckets **privés** (URLs signées). Or
`storage.objects` a RLS activé par défaut chez Supabase : un bucket privé **sans
policy** refuse les uploads avec la clé anon. Aucune migration du repo ne crée de
policy storage. Scénario : « Ajouter une photo » (`missionPhotosRepo.ts:39`) →
`new row violates row-level security policy` en prod alors que tous les tests
passent (mocks). À vérifier/créer dans le dashboard en même temps que S1.2.

### S1.4 Aucune RLS sur les tables, aucune authentification
Aucune migration n'active RLS sur `mission`, `plan`, `grid_*`, `felt_point`,
`mission_photo` ; l'app n'a pas de login. La clé anon est embarquée dans le
bundle client : **quiconque obtient l'URL du site déployé peut lire et modifier
toutes les missions** — dont les adresses des clients (donnée personnelle,
RGPD). Acceptable en beta mono-utilisateur non publiée ; à traiter avant tout
déploiement accessible publiquement (activer RLS + auth Supabase, même à un
seul utilisateur).

---

## S2 — Défauts fonctionnels sérieux (code)

### S2.1 Gestion d'erreur « tout ou rien » dans SiteMapView
`src/components/SiteMapView.tsx:346` : `if (error) return <p role="alert">{error}</p>`.
N'importe quelle erreur — y compris l'échec du fetch WFS bâtiments (fonctionnalité
*optionnelle*, `SiteMapView.tsx:196`) ou l'échec silencieux d'une sauvegarde
`updateAdjustedPoints` en arrière-plan (`SiteMapView.tsx:297`) — **remplace toute
la carte** par un paragraphe, sans bouton réessayer ni retour possible.
Scénario terrain : IGN indisponible (ça arrive) → l'espace mission entier devient
inutilisable alors que grilles, ressentis et édition n'ont pas besoin de l'IGN WFS.
Correctif suggéré : erreurs non bloquantes en bandeau dismissible ; réserver le
remplacement complet aux échecs de chargement initial des grilles.

### S2.2 Impossible de rouvrir une mission existante
`src/pages/MissionWorkspace.tsx:42` démarre toujours en `creating-mission` ; il
n'existe aucun écran de liste/reprise (`listMissions` — `missionsRepo.ts:62` — et
`listPlansForMission` — `plansRepo.ts:46` — ne sont consommés par aucun
composant). Scénario terrain : rafraîchissement de page (ou crash du navigateur
mobile) en pleine mission → toutes les données sont en base mais l'UI oblige à
recréer une mission. Pour une PWA de terrain, c'est la lacune fonctionnelle n°1
du Plan 1. (Hors scope des specs actuelles, mais à planifier tôt.)

### S2.3 Deux panneaux bottom-right se superposent (Bagua × orthogonalité)
`SiteMapView.tsx:561` et `:585` rendent chacun un `<OverlayPanel corner="bottom-right">`
distinct. `OverlayPanel` empile ses *enfants* en colonne, mais deux instances
soeurs sont chacune en `position:absolute; bottom:8; right:8` → superposition.
Scénario : couche Bagua visible + glisser une ligne → le panneau d'orthogonalité
et la légende Bagua se recouvrent ; légende dépliée, les boutons
« Redresser »/« Ignorer » deviennent incliquables. Le commentaire ligne 579-583
(« Stacked into bottom-right alongside ») décrit un comportement que le code n'a
pas. Correctif : un seul `OverlayPanel` bottom-right contenant les deux cartes.

### S2.4 Hypothèse GeoJSON non vérifiée : Polygon vs MultiPolygon (IGN WFS)
`buildingFootprintService.ts:23-28` et `cadastreService.ts:25-38` typent
`geometry.coordinates` en `number[][][]` (Polygon). Les couches BDTOPO
(`batiment`) et PARCELLAIRE_EXPRESS renvoient couramment des **MultiPolygon**
(imbrication `number[][][][]`). Dans ce cas la déstructuration `[lng, lat]`
produit des tableaux → `lat`/`lng` `undefined` → polygones NaN rendus
invisiblement par Leaflet, **sans aucune erreur**. Les commentaires des deux
fichiers admettent eux-mêmes qu'aucun appel live `DescribeFeatureType` n'a été
fait. Scénario : bâtiment à cour intérieure ou parcelle multi-parties → aucun
candidat visible, l'utilisateur croit à « aucun bâtiment détecté ». À vérifier
sur le terrain dès la première mission réelle ; parer en détectant
`geometry.type` et en aplatissant les MultiPolygon.

### S2.5 URLs signées à 1 an persistées en base
`missionPhotosRepo.ts:52` insère l'URL signée (expire à 365 j) dans
`mission_photo.image_url` ; idem `planImageStorage.ts` pour `plan.image_url`.
Documenté dans le code, mais c'est une dette de modèle : **les photos de toutes
les missions cassent silencieusement après un an**. Correctif connu (stocker le
chemin objet, re-signer à l'affichage) — à faire avant d'avoir un historique qui
compte.

---

## S3 — Robustesse / courses / chemins d'erreur

### S3.1 Fetches IGN sans annulation ni garde anti-obsolescence
L'effet bâtiments (`SiteMapView.tsx:185-203`) et le chargement initial
(`SiteMapView.tsx:154-174`) n'utilisent ni cleanup d'effet ni l'`AbortSignal`
que les deux services acceptent pourtant (`fetchBuildingsInBounds(bounds, signal?)`).
Scénario : « Changer de bâtiment » pendant qu'un fetch précédent est en vol →
deux passes concurrentes (chacune pouvant faire 2 requêtes avec l'élargissement
à 300 m) ; la plus lente écrase `buildingCandidates` avec des résultats
périmés. Même famille que le bug `missionOrigin`-identité déjà corrigé — celui-ci
est l'exemplaire restant.

### S3.2 Sauvegarde optimiste sans réconciliation
`handleLineChanged` (`SiteMapView.tsx:288-302`) met à jour l'état local puis lance
`updateAdjustedPoints` en fire-and-forget. En cas d'échec : l'état local garde la
ligne déplacée, la base garde l'ancienne, et S2.1 remplace la carte. Après
rechargement, la ligne « revient » mystérieusement. Au minimum : re-synchroniser
ou annuler localement en cas d'échec de persistance.

### S3.3 Centroïde dégénéré → NaN silencieux
`computeCentroid` (`src/geometry/bagua.ts:13-28`) divise par l'aire ; un
`footprint` dégénéré (points colinéaires, aire ≈ 0) donne un centre NaN/Infinity
→ secteurs Bagua invisibles sans erreur. `BaguaLayer.tsx:16` ne garde que
`length === 0`. Improbable avec des données IGN réelles, mais une garde
`Number.isFinite` + message français coûterait trois lignes.

### S3.4 Chemins d'erreur des repos majoritairement non testés
Messages français jamais prouvés par un test (grep croisé source/tests) :
`setMissionOrigin`, `setGlobalAssessment`, `setSelectedParcels`,
**`setBuildingFootprint`** (ajouté par le sous-projet Bagua, zéro test d'erreur),
`createFeltPoint`/`listFeltPointsForPlan`, `createGridLines`/`updateAdjustedPoints`/
`listGridLinesForInstance`, `listMissions`, `listGridTemplates`,
`listPlansForMission`, chemins upload-error de `addMissionPhoto` et
`uploadPlanImage`. Le pattern est uniforme donc le risque est faible, mais la
convention « message d'erreur français testé » n'est appliquée qu'à ~un tiers
des fonctions.

### S3.5 Validation d'entrée avant appels externes — état des lieux
- Bounds → URL WFS (`cadastreService.ts:47-50`, `buildingFootprintService.ts:36-39`) :
  nombres interpolés directement dans la chaîne. Pas de risque d'injection réel
  (types `number`, hôte fixe), mais aucune garde `Number.isFinite` ni
  `URLSearchParams` : un bounds NaN (impossible via l'UI actuelle, possible pour
  un futur appelant) produirait une requête `BBOX=NaN,...` silencieusement 400.
- `GridTemplatePicker.tsx` : espacements sans `min` côté client ; un espacement 0
  provoquerait une boucle quasi infinie dans `maxOffsetIndexNeeded`
  (`gridGeneration.ts:74-93` : `Math.ceil(d/0)+1 = Infinity`). **Protégé
  uniquement par le check DB** `spacing_x_m > 0` (migration 0001) — garde-fou
  correct mais unique ; un `min="0.01"` client éviterait un aller-retour d'erreur.
- Aucun `dangerouslySetInnerHTML`/`innerHTML` dans src/ (vérifié par grep).
  Toutes les écritures Supabase passent par le client paramétré. RAS.

---

## S4 — Cohérence / hygiène de code

### S4.1 Commentaires périmés après le refactor OverlayPanel
Le commit 99d51de a supprimé les constantes `*_STYLE` de SiteMapView, mais :
- `LayerPanel.tsx:18` référence encore `TOP_RIGHT_STACK_STYLE in SiteMapView.tsx` ;
- `OrthogonalitySuggestion.tsx:23,32` référence `PANEL_STYLE /
  GUIDE_LINE_CONTROLS_STYLE / EDIT_CONTROLS_STYLE` et `ORTHOGONALITY_PANEL_STYLE`.
(Les mentions dans `OverlayPanel.tsx` sont volontairement historiques — OK.)

### S4.2 Duplication de style triple
`GRID_CREATION_WRAPPER_STYLE` (`SiteMapView.tsx:91`), `CARD_CHROME_STYLE`
(`SiteMapView.tsx:104`) et `PANEL_STYLE` (`LayerPanel.tsx`) sont trois copies du
même objet `{background:'white', padding:8, borderRadius:4}`. Candidat évident :
une prop `chrome` (ou un enfant `<OverlayCard>`) sur `OverlayPanel`.

### S4.3 SiteMapView.tsx : 593 lignes — extractions concrètes
Le fichier reste le seul « dieu » du projet. Deux découpes nettes, sans
changement de comportement :
1. **Outil ligne-guide** : 4 états (`guideLineBearing`, `guideLineAnchor`,
   `placingGuideLine`, `customBearingInput`) + 3 handlers + ~75 lignes de JSX
   top-left (`:439-501`) → composant `GuideLineControls` + remontée d'un seul
   callback. ~-100 lignes.
2. **Flux bâtiment/Bagua** : 3 états + effet fetch + 2 handlers + `boundsAround`
   (`:72-85, 150-221, 410-422, 507-516`) → hook `useBuildingFootprint(missionId,
   missionOrigin, initial)`. ~-80 lignes.
Résultat ≈ 400 lignes, chaque corner-panel lisible isolément. La duplication
`COMPASS_DIRECTIONS` (`SiteMapView.tsx:29`, copie manuelle de `COMPASS_ORDER`
privé de `bagua.ts`) disparaîtrait en exportant simplement `COMPASS_ORDER`.

### S4.4 Code mort / non câblé
- `applyVertexDrag` (`lineEditing.ts:3`) : supplanté par `applyAllVertices`,
  aucun consommateur.
- `fetchParcelsInBounds` + `CadastralParcel` (`cadastreService.ts`) et
  `setSelectedParcels` + colonne `parcel_refs` (migration 0010) : la « recherche
  cadastrale » n'a **aucune UI** — couche data seule.
- `createFeltPoint` (`feltPointsRepo.ts:31`) : les points ressentis s'affichent
  (`FeltPointsLayer`) mais **rien dans l'UI ne permet d'en créer**.
- Type `FreeformNetwork` + table `freeform_network` (eau/failles) : schéma et
  type présents, zéro code applicatif (prévu pour plus tard — à garder).

### S4.5 Incohérences mineures
- `baguaCorrespondences.ts:10-13` : l'en-tête liste N parmi les placeholders
  puis affirme « N/E/S … confirmed » — contradiction interne ; en l'état on ne
  sait pas si N est fiable. À trancher avec la source (Polizzi, ch. 6) en même
  temps que les 5 vrais placeholders (NE/SE/SW/W/NW).
- `supabaseClient.ts:7-9` : seul message d'erreur en anglais du projet
  (dev-facing, tolérable, mais la convention est au français).
- `GlobalAssessmentForm.tsx:60` : le slider Bovis affiche sa valeur dans un
  `<span>` alors que `CauseSlider` utilise `<output>` avec un commentaire
  expliquant précisément pourquoi `<span>` casse `getByLabelText` — fragile si
  un test futur cible « Taux vibratoire (Bovis) » en correspondance exacte.
- `package.json` : **pas de script `test`** — les tests se lancent via
  `npx vitest run`. À ajouter (`"test": "vitest run"`) à l'occasion.
- Worktree vs master : les docs Bagua (`2026-07-19-bagua-*.md`) n'existent que
  sur `master`, les docs du worktree s'arrêtent au plan rod-marker. Pas de
  conflit au merge (fichiers distincts), simple asymétrie à connaître.

---

## Récapitulatif « actions humaines en attente »

1. **`npx supabase db push`** (worktree, projet lié GEOBIO LP) pour la migration
   **0012** — sans elle, tout le flux Bagua échoue (S1.1). 0001–0011 déjà en place.
2. **Créer le bucket Storage `plans` (privé)** dans le dashboard Supabase (S1.2).
3. **Vérifier/créer les policies Storage** permettant upload + createSignedUrl
   avec la clé anon sur `plans` et `mission-photos`, et confirmer que
   `mission-photos` est bien privé (S1.3).
4. **Décision RLS/auth** avant tout déploiement public (S1.4).
5. **Compléter `baguaCorrespondences.ts`** avec les vraies correspondances
   (Polizzi ch. 6) — 5 ou 6 secteurs placeholders selon la lecture de S4.5.
6. **Valeurs réseaux** (migration 0005) : couleurs Palm/Peyré/Wissmann
   placeholders ; angle 45° de Wissmann non confirmé ; espacements =
   milieux de fourchette du manuel, à ajuster sur données terrain.
7. **Vérifier sur données réelles** les couches WFS IGN (Polygon vs MultiPolygon,
   S2.4) et l'API leaflet-geoman (`pm:markerdragend` — avertissement documenté
   dans `EditableNetworkLine.tsx`).
8. **Merge de la branche** `plan1-moteur-reseaux` → `master` (à décider par
   Laurent ; `master` ne contient aujourd'hui que `docs/`).

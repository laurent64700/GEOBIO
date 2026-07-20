# Détection des croisements pathogènes — Design

**Date :** 2026-07-21
**Statut :** Brainstorm mené en autonomie (Laurent absent ~1h), relu et corrigé
(spec-document-reviewer, PASS 2026-07-21) — hypothèses clairement flaguées ci-dessous,
**à confirmer avant tout passage au plan d'implémentation.**
**Sous-projet de :** GEOBIO — extension de Plan 1 (ex-"Chunk 11", jamais conçu ni
construit), sous-projet séparé.

## 1. Contexte et objectif

Laurent a insisté très tôt dans le projet : les croisements pathogènes doivent être
détectés **très tôt** dans le workflow terrain, pas différés en fin de mission, pour
repérer rapidement les zones à problème (en particulier celles qui vont impacter
l'intérieur du bâtiment).

**Définition confirmée par Laurent (2026-07-21), remplace toute hypothèse antérieure :**
> "pathogène = croisement Hartmann + Curry, ou H et Curry + eau ou faille, ou H + C +
> autres phénomènes"

C'est-à-dire : **le cœur d'un croisement pathogène est toujours la co-présence de
Hartmann ET Curry** au même point (pas un réseau seul, pas n'importe quelle paire de
réseaux) — cohérent avec le livre de référence de Laurent, qui identifie Hartmann et
Curry comme "le fameux groupe des réseaux... qui ont vraiment marqué la géobiologie des
années 50" (Groupe 2 de la taxonomie La Maya). L'eau/faille et les "autres phénomènes"
(cheminées telluriques, etc.) sont des **facteurs aggravants** quand ils coïncident avec
un nœud H×C — pas des déclencheurs indépendants.

**Conséquence directe pour ce sous-projet :** un nœud d'un seul réseau (Hartmann×Hartmann,
c'est-à-dire ses propres axes N/S×E/O internes) n'est **pas** un "croisement pathogène"
au sens de cette définition — la question posée à Laurent là-dessus a été implicitement
tranchée par sa réponse (H+C reste le socle dans les 3 formulations qu'il a données).

## 2. Périmètre buildable maintenant vs. dépendances

**Ce qui existe déjà et permet de construire le socle immédiatement :**
- `GridLine.adjustedPoints` — positions calées sur le ressenti terrain (Task 31),
  recalculées à chaque glisser/annuler/réinitialiser
- Chaque `GridInstance` porte son `templateSnapshot.name` — permet d'identifier quelles
  lignes appartiennent à Hartmann vs Curry pour un même plan

**Ce qui N'existe PAS encore et empêche de construire les aggravants tout de suite :**
- **Tracé libre eau/faille** — le type `FreeformNetwork` existe en base (confirmé par
  l'audit du 19/07 : "à garder", data-layer en avance sur l'UI) mais **aucune UI** pour
  le tracer sur le terrain n'a jamais été construite. C'est le sous-projet "tracé libre
  eau/faille + phénomènes ponctuels" que Laurent a demandé d'avancer en parallèle
  (2026-07-21) — dépendance directe, pas encore brainstormé.
- **Phénomènes ponctuels** (icônes cheminée 1-4 branches, etc.) — même situation,
  aucune donnée ni UI n'existe encore.

**Décision de portée pour CE sous-projet (assumée en l'absence de Laurent, à confirmer) :**
Construire le socle H×C maintenant (buildable immédiatement, aucune dépendance
bloquante). **Précision post-revue (corrige une incohérence de la version précédente)** :
`computeHartmannCurryCrossings` (§4) n'a délibérément **aucun paramètre d'aggravation**
dans cette première passe — ni `FreeformNetwork`, ni phénomènes n'existent encore comme
données réelles, un paramètre optionnel vide serait un raccordement fictif. L'extension
prévue est un ajout **futur et trivial** une fois §7 des sous-projets dépendants
construits : soit un second paramètre optionnel `(waterPaths?, phenomena?)` calculant un
champ `aggravatedBy` sur `PathogenicCrossing`, soit une fonction séparée qui prend les
croisements déjà calculés + les données d'aggravation en entrée — décision à prendre à
ce moment-là, pas anticipée ici pour éviter de deviner une forme qui ne conviendra pas.

## 3. Flux utilisateur

1. Laurent a déjà généré (au moins) un `GridInstance` Hartmann et un `GridInstance`
   Curry sur le même plan (flux existant, `GridCreationPanel`, Task 33)
2. Dès qu'un des deux réseaux est ajusté (glisser une ligne, annuler, réinitialiser —
   `handleLineChanged`/`handleUndo`/`handleResetLine` existants, `SiteMapView.tsx`),
   les croisements Hartmann×Curry sont **recalculés automatiquement en arrière-plan**
   — pas d'action explicite requise
3. Chaque croisement est affiché comme un marqueur (pastille) sur la carte, dans un
   nouveau layer dédié — **visible seulement quand ce layer est activé** dans le
   panneau de calques, cohérent avec la règle "rien n'est visible par défaut sauf le
   ressenti terrain" déjà en place (Chunk 8)
4. (Une fois le tracé eau/faille et les phénomènes disponibles, dans un sous-projet
   séparé) : un nœud H×C qui coïncide avec un tracé d'eau ou un phénomène ponctuel
   est visuellement distingué comme aggravé — pas construit dans cette première passe

## 4. Composants & modèle de données

**Géométrie pure**

**Correction post-revue (2026-07-21) — trou géométrique important :** `GridLine.adjustedPoints`
est un `Point[]` de longueur arbitraire, **pas un segment à 2 points**. Après édition
terrain (glisser un sommet via `EditableNetworkLine.tsx`/leaflet-geoman,
`applyAllVertices` persiste tous les sommets), une ligne ajustée au ressenti peut être
une **polyligne coudée à N points** — c'est même toute la raison d'être de l'assistant
d'orthogonalité déjà construit (`orthogonality.ts`, écrit explicitement pour des
polylignes N-points). Une première version de cette spec traitait à tort chaque ligne
comme un segment `[premier point, dernier point]`, ce qui aurait donné des résultats
faux précisément sur les lignes corrigées au ressenti — le cas d'usage central de cette
feature. Corrigé ci-dessous : le calcul itère sur les **segments consécutifs** de
chaque polyligne, pas sur la ligne entière comme un seul segment.

- `src/geometry/pathogenicCrossings.ts` :
  - `computeSegmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null`
    — intersection standard de 2 segments de droite (algèbre linéaire classique,
    paramètres t,u ∈ [0,1] **inclusifs** — un croisement pile sur une extrémité de
    segment compte comme une intersection valide, pas ignoré). Retourne `null` si
    parallèles (déterminant proche de 0 — un seuil epsilon, pas une comparaison
    d'égalité flottante exacte) ou si l'intersection tombe hors des deux segments.
    Normalise `-0` en `0` sur le point retourné (`gridGeneration.test.ts` documente
    déjà que `-0 === 0` doit être testé explicitement pour ce type de calcul dans ce
    codebase — même prudence à appliquer ici, pas une fonction existante à réutiliser).
    **Conséquence des bornes inclusives à noter à l'implémentation** : un croisement
    tombant pile sur un sommet intérieur d'une polyligne est compté par les deux
    segments adjacents (t=1 côté premier segment, t=0 côté suivant) → deux entrées
    `PathogenicCrossing` au même point. Cas de mesure nulle en pratique, pas grave,
    mais à savoir plutôt qu'à découvrir en test.
  - `computeHartmannCurryCrossings(hartmannLines: GridLine[], curryLines: GridLine[]): PathogenicCrossing[]`
    — pour chaque paire (ligne Hartmann, ligne Curry), itère sur tous les segments
    consécutifs de la polyligne Hartmann (`adjustedPoints[i]`→`adjustedPoints[i+1]`)
    croisés avec tous les segments consécutifs de la polyligne Curry, via
    `computeSegmentIntersection`. **Une même paire de lignes peut produire plusieurs
    croisements** (ligne coudée qui traverse l'autre réseau à deux endroits) — c'est
    normal et attendu, pas une erreur à dédupliquer.
  - `interface PathogenicCrossing { point: Point; hartmannLineId: string; curryLineId: string }`
    — garde une trace des lignes source, utile pour un futur clic-pour-détail ; une
    paire de lignes avec 2 croisements produit 2 entrées distinctes avec les mêmes IDs
- 100% testable sans carte réelle, même approche que `gridGeneration.ts`/`bagua.ts`

**Intégration `SiteMapView`**
- Le calcul se déclenche quand `linesByInstance` change pour une paire d'instances
  Hartmann+Curry présentes sur le plan — un `useMemo` (pas un `useEffect`, puisque
  c'est un calcul pur et synchrone, pas un fetch) recalculant `crossings` à partir de
  `instances`/`linesByInstance` à chaque render, filtré aux paires
  `templateSnapshot.name === 'Hartmann'` / `'Curry'`
- **Hypothèse à confirmer avec Laurent** : si un plan a plusieurs `GridInstance`
  Hartmann ou plusieurs Curry (cas rare mais possible — pas de contrainte
  d'unicité dans le modèle actuel), faut-il croiser TOUTES les paires
  Hartmann×Curry possibles, ou seulement un Hartmann "actif" contre un Curry
  "actif" ? Je pars sur "toutes les paires" par défaut (plus complet, coût de
  calcul négligeable pour le nombre de lignes en jeu), à corriger si faux.
- **Matching par nom** (`templateSnapshot.name === 'Hartmann'`/`'Curry'`) : vérifié
  exact contre les seeds réels (migrations 0003/0005/0007, noms stables, pas de
  variante de casse/accent). Risque résiduel connu et accepté : un gabarit personnalisé
  renommé (copie de Hartmann sous un autre nom) ne serait pas détecté par ce matching —
  cas marginal, pas traité dans cette première passe.

**Rendu**
- `src/components/PathogenicCrossingsLayer.tsx` — un marqueur (`CircleMarker`,
  même famille que `FeltPointsLayer`) par croisement, couleur distincte (proposé :
  orange/rouge vif, à distinguer du violet Bagua et des couleurs réseaux)
- Nouvel identifiant de layer dans `LayerPanel` (même pattern que `BAGUA_LAYER_ID`),
  **caché par défaut**

## 5. Gestion des erreurs et cas limites

- Aucun `GridInstance` Hartmann ou aucun Curry présent sur le plan → la liste de
  croisements est simplement vide, pas d'erreur, pas de layer à afficher
- Lignes parallèles (jamais censé arriver entre Hartmann à 0° et Curry à 45°, mais si
  un gabarit personnalisé a le même angle) → `computeSegmentIntersection` retourne
  `null`, pas de crash. Segments colinéaires superposés (cas dégénéré, infinité
  d'intersections) sont absorbés par le même chemin "parallèle → null" — décision
  délibérée, pas un cas à gérer différemment, puisqu'il n'a pas de sens géométrique
  clair pour deux réseaux à angles distincts (0°/45° pour Hartmann/Curry seedés).
- Recalcul à chaque render via `useMemo` : coût = O(lignes Hartmann × lignes Curry),
  négligeable pour les tailles de grille réelles (quelques dizaines de lignes par
  réseau sur un rayon de 30m par défaut)

## 6. Tests

- `pathogenicCrossings.ts` : tests unitaires purs — segments qui se croisent, segments
  parallèles, segments qui ne se croisent pas dans leurs bornes (droites sécantes mais
  hors segment), cas Hartmann/Curry réaliste (0°/45°) avec un résultat attendu calculé
  à la main, **ligne coudée à 3+ points croisant l'autre réseau 0 fois puis 2 fois**
  (le cas que la version précédente de cette spec aurait mal géré — voir §4), et un
  cas d'intersection pile sur une extrémité de segment (borne inclusive)
- `PathogenicCrossingsLayer.tsx` : rendu réel dans un `MapContainer`, comme
  `FeltPointsLayer.test.tsx`
- Test d'intégration `SiteMapView` : instances Hartmann+Curry mockées, vérifier que le
  layer de croisements apparaît une fois toggle, avec le bon nombre de marqueurs

## 7. Hors périmètre explicite (cette première passe)

- Aggravation par eau/faille et par phénomènes ponctuels — dépend de 2 sous-projets
  non construits, voir §2. L'architecture est prévue pour les accueillir sans refonte.
- Nœuds internes à un seul réseau (Hartmann×Hartmann) — explicitement exclus par la
  définition de Laurent (§1)
- Croisements impliquant d'autres réseaux que Hartmann/Curry (Palm×Peyré, etc.) — non
  demandé, la définition de Laurent nomme spécifiquement Hartmann+Curry
- Clic sur un marqueur pour voir le détail (quelles lignes, quelle sévérité) — le
  modèle de données le permet déjà (`PathogenicCrossing` garde les IDs de lignes),
  mais l'UI de détail n'est pas dans cette première passe

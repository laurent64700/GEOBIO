# Détection des croisements pathogènes — Design

**Date :** 2026-07-21
**Statut :** Brainstorm mené en autonomie (Laurent absent ~1h) — hypothèses clairement
flaguées ci-dessous, **à confirmer avant tout passage au plan d'implémentation.**
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
bloquante), avec une architecture explicitement **extensible** pour les aggravants —
la fonction de calcul accepte en entrée optionnelle une liste de tracés eau/faille et de
phénomènes ponctuels, mais tant que ces sous-projets ne sont pas construits, ces entrées
seront simplement vides. Aucun retravail structurel ne sera nécessaire une fois l'eau/les
phénomènes disponibles — juste les brancher.

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
- `src/geometry/pathogenicCrossings.ts` :
  - `computeSegmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null`
    — intersection standard de 2 segments de droite (algèbre linéaire classique,
    retourne `null` si parallèles ou si l'intersection tombe hors des deux segments)
  - `computeHartmannCurryCrossings(hartmannLines: GridLine[], curryLines: GridLine[]): PathogenicCrossing[]`
    — teste chaque paire (ligne Hartmann, ligne Curry) via `computeSegmentIntersection`
    sur leurs `adjustedPoints`, retourne un point par croisement trouvé
  - `interface PathogenicCrossing { point: Point; hartmannLineId: string; curryLineId: string }`
    — garde une trace des lignes source, utile pour un futur clic-pour-détail
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
  `null`, pas de crash
- Recalcul à chaque render via `useMemo` : coût = O(lignes Hartmann × lignes Curry),
  négligeable pour les tailles de grille réelles (quelques dizaines de lignes par
  réseau sur un rayon de 30m par défaut)

## 6. Tests

- `pathogenicCrossings.ts` : tests unitaires purs — segments qui se croisent, segments
  parallèles, segments qui ne se croisent pas dans leurs bornes (droites sécantes mais
  hors segment), cas Hartmann/Curry réaliste (0°/45°) avec un résultat attendu calculé
  à la main
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

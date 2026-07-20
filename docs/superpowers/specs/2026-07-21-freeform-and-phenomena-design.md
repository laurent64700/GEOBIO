# Tracé libre eau/faille + phénomènes ponctuels — Design

**Date :** 2026-07-21
**Statut :** Brainstorm mené en autonomie (Laurent absent ~1h) — hypothèses clairement
flaguées ci-dessous, **à confirmer avant tout passage au plan d'implémentation.**
**Sous-projet de :** GEOBIO — extension de Plan 1 (ex-"Chunk 12", jamais conçu ni
construit). **Deux composants indépendants mais liés**, traités dans un seul document
car ils partagent le même pattern d'interaction (choisir un type → poser sur la carte)
et sont tous deux une dépendance du sous-projet "détection croisements pathogènes"
(spec écrite le 2026-07-21, en cours de revue) pour ses aggravants.

## 1. Contexte et objectif

Deux briques manquantes du workflow terrain de Laurent, jamais construites malgré des
données/schémas déjà pensés dès la conception initiale du projet :

**A. Tracé libre eau/faille** — Laurent trace au stylet le parcours de l'eau souterraine
détectée (pas linéaire, d'où le besoin de main levée), et note en même temps le sens du
courant, la profondeur et le débit (pour son rapport). Le type `FreeformNetwork` existe
déjà en base (`kind: 'eau' | 'faille'`, `points: Point[]`) mais **sans les métadonnées**,
et **aucune UI** ne permet de le créer ou de l'afficher.

**B. Phénomènes ponctuels** — cheminées telluriques (1 à 4 branches), spire de vortex,
point cosmique, carré magique, tube magique. Laurent pose une icône sur la carte au fur
et à mesure du relevé (pas après coup). **Aucune donnée ni UI n'existe pour ça du tout.**

## 2. Décision d'architecture (rappel du cadrage posé par Laurent le 2026-07-21)

Laurent a explicitement corrigé une proposition antérieure : **GEOBIO reste
l'application centrale, un outil tiers générique (Leaflet-Geoman, déjà une dépendance
depuis Task 31) ne devient jamais le paradigme d'UX** — on prend des briques techniques
ponctuelles dedans, on ne colle pas GEOBIO dessus. Ce sous-projet applique directement
ce principe :

- **Geoman fournit la mécanique bas niveau** : son mode "dessiner une ligne libre" pour
  le tracé eau/faille (main levée, exactement le besoin), utilisé comme utilitaire
  d'interaction — pas comme barre d'outils affichée telle quelle
- **GEOBIO garde le contrôle du protocole** : un bouton dédié dans l'interface GEOBIO
  ("Tracer l'eau", "Tracer une faille") déclenche le mode Geoman, puis GEOBIO intercepte
  le résultat (les points tracés) et demande immédiatement les métadonnées (sens/
  profondeur/débit) avant d'enregistrer — jamais un tracé Geoman générique laissé tel quel
- **Pour les phénomènes ponctuels, pas besoin de Geoman du tout** — c'est un simple
  clic-pour-placer (même pattern que le point ressenti, déjà écrit dans un autre
  sous-projet en attente), Geoman n'apporte rien ici (pas de dessin de forme complexe)

## 3. Flux utilisateur

**A. Tracé eau/faille**
1. Laurent clique "Tracer l'eau" (ou "Tracer une faille") dans le panneau
2. Mode dessin actif (Geoman, ligne libre) — Laurent trace au doigt/stylet sur l'écran
3. Une fois le tracé terminé, un petit formulaire apparaît : sens du courant (ex. une
   flèche à orienter, ou un angle en degrés — **hypothèse à confirmer**, je pars sur un
   angle simple), profondeur (mètres), débit (texte libre ou échelle — **hypothèse à
   confirmer**, je pars sur texte libre, Laurent connaît mieux l'unité/échelle utilisée
   sur le terrain que moi)
4. Validation → enregistré comme `FreeformNetwork` (élargi avec les 3 nouveaux champs)
5. Affiché en bleu (eau) ou une autre couleur (faille — **à définir avec Laurent**, pas
   de convention couleur connue pour les failles dans ce qui a été discuté jusqu'ici)
   sur un nouveau layer, caché par défaut comme tout le reste (cohérent avec Chunk 8)

**B. Phénomène ponctuel**
1. Laurent choisit un type dans une légende (cheminée 1-4 branches, spire de vortex,
   point cosmique, carré magique, tube magique) — **hypothèse à confirmer** : je n'ai
   pas les icônes exactes de la planche légende mentionnée dans l'historique du projet,
   je pars sur des icônes texte/symboles simples en attendant les vraies images
2. Il clique sur la carte → le phénomène est posé immédiatement à cet endroit
3. Affiché comme icône sur un nouveau layer, caché par défaut

## 4. Composants & modèle de données

**A. Tracé eau/faille**
- Migration : `alter table freeform_network add column current_bearing_deg numeric, add column depth_m numeric, add column flow_rate text;` (tous nullables — un tracé peut être posé avant que Laurent n'ait mesuré le détail)
- `src/domain/types.ts` — `FreeformNetwork` élargi : `currentBearingDeg: number | null`, `depthM: number | null`, `flowRate: string | null`
- `src/data/freeformNetworksRepo.ts` (nouveau) — `createFreeformNetwork`, `listFreeformNetworksForPlan`, suivant exactement le pattern déjà établi (`feltPointsRepo.ts` comme référence la plus proche : create+list, erreurs françaises)
- `src/components/FreeformDrawTool.tsx` (nouveau) — glue Geoman pour le mode dessin libre, **même traitement d'incertitude que `EditableNetworkLine.tsx`** (l'API Geoman exacte pour le mode "dessiner une ligne" n'a pas été vérifiée contre la doc live — isoler dans un module fin, comme déjà fait)
- `src/components/FreeformMetadataForm.tsx` (nouveau) — le petit formulaire post-tracé
- `src/components/FreeformNetworkLayer.tsx` (nouveau) — rendu, même famille que `NetworkLinesLayer`

**B. Phénomènes ponctuels**
- Nouvelle migration + table `phenomenon` : `id`, `plan_id`, `kind text` (contrainte
  `check` sur les 5-8 types de la planche légende — **liste exacte à confirmer avec
  Laurent**, je propose : `cheminee-1`, `cheminee-2`, `cheminee-3`, `cheminee-4`,
  `spire-vortex`, `point-cosmique`, `carre-magique`, `tube-magique`), `x double precision`,
  `y double precision`, `created_at`
- `src/domain/types.ts` — nouveau type `Phenomenon { id, planId, kind: PhenomenonKind, x, y, createdAt }`
- `src/data/phenomenaRepo.ts` (nouveau) — même pattern create+list
- `src/components/PhenomenonPicker.tsx` (nouveau) — légende de sélection + mode
  placement (choisir type → clic sur carte), même pattern que le point ressenti prévu
  dans l'autre sous-projet en attente
- `src/components/PhenomenaLayer.tsx` (nouveau) — rendu icônes, même famille que
  `FeltPointsLayer`

**Intégration commune** : les deux nouveaux layers rejoignent `LayerPanel`, cachés par
défaut. Les deux "outils de placement" (tracé eau/faille, pose de phénomène) rejoignent
le même panneau latéral que l'outil "placer un point ressenti" — les 3 partagent la même
logique de mode exclusif (un seul outil de placement actif à la fois sur la carte, comme
déjà résolu pour ligne-guide vs création-de-grille, Task 33).

## 5. Gestion des erreurs et cas limites

- Tracé annulé en cours de route (Laurent quitte le mode dessin sans terminer) → rien
  n'est enregistré, pas de `FreeformNetwork` orphelin
- Formulaire de métadonnées : tous les champs sont optionnels (nullable en base) —
  Laurent doit pouvoir valider un tracé sans avoir mesuré le débit tout de suite,
  cohérent avec le fait qu'il complète des infos "après coup" dans son rapport final
- Échec réseau à l'enregistrement → message français standard, même convention que le
  reste du projet

## 6. Tests

- `freeformNetworksRepo.ts`/`phenomenaRepo.ts` : mêmes conventions de test que
  `feltPointsRepo.test.ts` (fixture GeoJSON/mock écrite à la main, pas de dépendance
  réseau réelle)
- `FreeformNetworkLayer.tsx`/`PhenomenaLayer.tsx` : rendu réel dans un `MapContainer`
- `FreeformDrawTool.tsx` : test de fumée seulement (comme `EditableNetworkLine.tsx`) —
  la vraie précision de l'interaction Geoman se valide en conditions réelles, pas par
  des tests automatisés

## 7. Hors périmètre explicite

- Icônes réelles de la planche légende — à obtenir de Laurent, remplacées par des
  placeholders texte/symboles dans cette première passe
- Convention couleur pour les failles (vs. le bleu déjà confirmé pour l'eau) — à
  confirmer
- Modification/suppression d'un tracé ou d'un phénomène après placement — pas demandé,
  pas dans cette première passe (contrairement aux lignes de grille, pas de besoin de
  calage "sur le ressenti" exprimé pour ces objets)
- Le branchement de ces données dans les aggravants du sous-projet "croisements
  pathogènes" — cette spec fournit les données, le branchement lui-même est décrit dans
  la spec du 2026-07-21 sur les croisements pathogènes (§2, "point d'extension prévu")

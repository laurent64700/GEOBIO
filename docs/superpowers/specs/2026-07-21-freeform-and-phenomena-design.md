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

- **GEOBIO garde le contrôle du protocole** : un bouton dédié dans l'interface GEOBIO
  ("Tracer l'eau", "Tracer une faille") déclenche le mode dessin, puis GEOBIO intercepte
  le résultat (les points tracés) et demande immédiatement les métadonnées (sens/
  profondeur/débit) avant d'enregistrer — jamais un tracé générique laissé tel quel
- **Pour les phénomènes ponctuels, pas besoin de Geoman du tout** — c'est un simple
  clic-pour-placer (même pattern que le point ressenti, déjà écrit dans un autre
  sous-projet en attente), Geoman n'apporte rien ici (pas de dessin de forme complexe)

**Correction post-revue (2026-07-21) — le mécanisme de tracé n'est PAS un fait acquis,
c'est une vraie décision à trancher avec Laurent.** Vérifié contre le package
`@geoman-io/leaflet-geoman-free` réellement installé : **la version gratuite n'a pas de
mode "ligne libre au doigt/stylet".** Elle fournit `Draw.Line`, un mode
**clic-clic-clic pour poser des sommets** (comme dessiner un polygone), pas un tracé
continu par glissement du doigt. Un mode `Freehand` existe bien dans les définitions de
types du package, mais il est marqué comme fonctionnalité **payante (Pro)**, et absent
du bundle gratuit réellement chargé — et même en Pro, c'est un freehand **polygone**,
pas ligne. Trois options réelles, à trancher avec Laurent avant le plan d'implémentation :

1. **Accepter le clic-clic-clic** (`Draw.Line` gratuit) — chaque clic pose un sommet,
   Laurent "dessine" une ligne brisée approximant le parcours de l'eau plutôt qu'un vrai
   tracé continu. Gratuit, rapide à intégrer, mais moins fidèle au geste "stylet sur
   l'écran" qu'il a décrit.
2. **Construire une capture main-levée maison** (écouter les événements pointeur sur la
   carte, suspendre le déplacement de la carte pendant le tracé, accumuler les points,
   simplifier la ligne à la fin) — colle mieux au principe déjà posé "GEOBIO garde le
   protocole", ne dépend d'aucune fonctionnalité Geoman payante, mais c'est du code
   GEOBIO à écrire et tester, pas une brique existante à intégrer.
3. **Passer à Geoman Pro** (payant) pour son vrai mode freehand — solution la plus
   proche du geste souhaité, mais introduit une dépendance commerciale nouvelle.

**Recommandation** : l'option 2 (capture maison) est cohérente avec le principe
d'architecture déjà validé par Laurent (GEOBIO ne dépend pas d'un outil tiers pour son
UX), et évite un abonnement pour une seule fonctionnalité. Mais c'est sa décision, pas
la mienne — à trancher avant d'écrire le plan d'implémentation. **Le composant B
(phénomènes ponctuels) est totalement indépendant de cette question** (aucune
dépendance à Geoman) et peut avancer sans attendre cette décision.

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
- Migration : `alter table freeform_network add column current_bearing_deg double precision, add column depth_m double precision, add column flow_rate text;` (tous nullables — un tracé peut être posé avant que Laurent n'ait mesuré le détail). **Correction post-revue** : `double precision`, pas `numeric` — convention réelle de ce codebase pour toute mesure/angle (`declination_deg`, `angle_true_north_deg`, `spacing_x_m`...), `numeric` n'est utilisé nulle part ailleurs.
- `src/domain/types.ts` — `FreeformNetwork` élargi : `currentBearingDeg: number | null`, `depthM: number | null`, `flowRate: string | null`, **et `createdAt: string`** (le type actuel ne l'a pas alors que la table a `created_at` — à harmoniser en même temps que cet élargissement, incohérence pré-existante sans rapport avec ce sous-projet)
- `src/data/freeformNetworksRepo.ts` (nouveau) — `createFreeformNetwork`, `listFreeformNetworksForPlan`, suivant exactement le pattern déjà établi (`feltPointsRepo.ts` comme référence la plus proche : create+list, erreurs françaises)
- `src/components/FreeformDrawTool.tsx` (nouveau) — glue pour le mode dessin (voir §2 pour le choix du mécanisme, encore ouvert) ; **si l'option Geoman est retenue**, même traitement d'incertitude que `EditableNetworkLine.tsx` (isoler l'API dans un module fin) ; **si l'option capture maison est retenue**, ce module gère directement les événements pointeur. Dans les deux cas, **conversion de coordonnées explicite requise** : les points capturés (souris/tactile ou latlng Leaflet) doivent passer par `latLngToLocal` avant stockage — `FreeformNetwork.points` est en coordonnées métriques locales de la mission, pas en latlng brut (piège déjà rencontré, voir `EditableNetworkLine.tsx` qui fait cette conversion).
- `src/components/FreeformMetadataForm.tsx` (nouveau) — le petit formulaire post-tracé
- `src/components/FreeformNetworkLayer.tsx` (nouveau) — rendu, même famille que `NetworkLinesLayer`

**B. Phénomènes ponctuels**
- Nouvelle migration + table `phenomenon` : `id`, `plan_id`, `kind text` (contrainte
  `check` sur les 5-8 types de la planche légende — **liste exacte à confirmer avec
  Laurent**, je propose : `cheminee-1`, `cheminee-2`, `cheminee-3`, `cheminee-4`,
  `spire-vortex`, `point-cosmique`, `carre-magique`, `tube-magique`), `x double precision`,
  `y double precision`, `created_at`, **plus `create index on phenomenon (plan_id)`**
  (correction post-revue : oublié dans une version précédente, tout autre table
  scopée-par-plan en a un, ex. `0009_felt_point.sql`)
- `src/domain/types.ts` — nouveau type `Phenomenon { id, planId, kind: PhenomenonKind, x, y, createdAt }`
- `src/data/phenomenaRepo.ts` (nouveau) — `createPhenomenon`, `listPhenomenaForPlan`,
  **et `deletePhenomenon`** (correction post-revue : un phénomène est posé
  immédiatement au clic, sans confirmation — un tap accidentel sur mobile doit
  pouvoir être annulé, sinon c'est un phénomène fantôme permanent sans recours dans
  l'app ; coût d'ajout quasi nul vu le pattern déjà établi ailleurs)
- `src/components/PhenomenonPicker.tsx` (nouveau) — légende de sélection + mode
  placement (choisir type → clic sur carte). **Précision post-revue** : la référence
  "même pattern que le point ressenti" désigne un outil **prévu dans une spec, pas
  encore construit** (dans ce dépôt, les `FeltPoint` ne sont créés aujourd'hui que par
  la détection automatique des tiges ArUco, `RodDetectionPanel.tsx` — il n'existe
  aucun outil de clic-pour-placer un point ressenti dans le code actuel). Ce
  sous-projet **ne dépend pas** de cet autre outil pour être construit — la mécanique
  de mode exclusif qu'il réutilise (Task 33, `SiteMapView.tsx`) existe déjà et
  s'applique directement, sans attendre l'autre spec.
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
  `feltPointsRepo.test.ts` — **correction post-revue** : ce fichier n'utilise pas de
  fixture GeoJSON, il mocke la chaîne Supabase via `createSupabaseChainMock`
  (`src/test/supabaseMock`), pattern create+erreur-française+list à reproduire
  tel quel, sans dépendance réseau réelle
- `FreeformNetworkLayer.tsx`/`PhenomenaLayer.tsx` : rendu réel dans un `MapContainer`
- `FreeformDrawTool.tsx` : test de fumée seulement (comme `EditableNetworkLine.tsx`) —
  la vraie précision de l'interaction Geoman se valide en conditions réelles, pas par
  des tests automatisés

## 7. Hors périmètre explicite

- Icônes réelles de la planche légende — à obtenir de Laurent, remplacées par des
  placeholders texte/symboles dans cette première passe
- Convention couleur pour les failles (vs. le bleu déjà confirmé pour l'eau) — à
  confirmer
- Modification/suppression d'un **tracé** eau/faille après placement — pas demandé
  (la suppression d'un **phénomène** ponctuel, elle, est incluse — voir §4B, ajoutée
  en revue pour éviter le tap accidentel permanent)
- Le branchement de ces données dans les aggravants du sous-projet "croisements
  pathogènes" — cette spec fournit les données, le branchement lui-même est décrit dans
  la spec du 2026-07-21 sur les croisements pathogènes (§2, "point d'extension prévu")

**Note pour le futur plan d'implémentation** : les composants A (tracé eau/faille) et B
(phénomènes ponctuels) doivent être des chantiers **indépendants**, pas entrelacés — B
n'a aucune dépendance à Geoman et est immédiatement buildable, tandis que A est
bloqué tant que le mécanisme de tracé (§2, 3 options) n'est pas tranché avec Laurent.
Traiter B en premier serait raisonnable si Laurent n'a pas encore répondu sur A.

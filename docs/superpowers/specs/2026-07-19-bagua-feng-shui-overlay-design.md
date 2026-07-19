# Superposition Bagua (Feng Shui classique) — Design

**Date :** 2026-07-19
**Statut :** Design validé par Laurent — prêt pour plan d'implémentation
**Sous-projet de :** GEOBIO — extension de Plan 1 (moteur réseaux telluriques), sous-projet
séparé au sens du plan (comme la reconnaissance de tiges par ArUco), pas une tâche greffée
dans le plan en cours.

## 1. Contexte et objectif

Dans le workflow terrain de Laurent, la géobiologie et le feng shui sont complémentaires :
une fois les tracés de réseaux (Hartmann, Curry...), les points pathogènes et l'analyse des
perturbations électromagnétiques faits, il reste à proposer des **solutions d'optimisation
de l'habitat** — c'est le rôle du feng shui et du Bagua dans son workflow. Ce point est
corroboré par le livre de référence de Laurent (Marc & Pascale Polizzi, *Initiation à la
Géobiologie Quantique Holistique*), qui situe explicitement le feng shui/Bagua dans le
**Groupe 5 : Les bâtiments** de la taxonomie des nuisances de La Maya (7 groupes), l'étape
qui suit le diagnostic réseaux (Groupe 2, déjà couvert par Plan 1) et électromagnétique
(Groupe 4, partiellement couvert par le bilan global existant).

**Objectif de ce sous-projet :** superposer une grille de 8 secteurs (Pakua/Bagua) sur le
plan d'une mission, orientée sur le nord réel et centrée sur le bâtiment détecté
automatiquement, avec une table de correspondance secteur → élément → objets correctifs
tirée du livre de référence.

## 2. Pakua classique, pas Eight Mansions (Ba Zhai)

Une recherche externe (bibliothèques open source : `bazi-calculator-by-alvamind`,
`xalen-chinese`, `mikaboshi`, `chinese_lunar_almanac`) a révélé une fourche méthodologique
réelle dans le feng shui chinois, pas juste un détail d'implémentation :

- **Pakua/Bagua classique** ("antique" selon le livre de Laurent, tradition taoïste) : 8
  secteurs fixes déterminés par l'orientation du bâtiment seule, correspondances
  objet/secteur universelles (Eau → fontaine, Montagne → bloc minéral, Terre → bac à
  fleurs...). Aucune donnée personnelle requise.
- **Eight Mansions (八宅, Ba Zhai)** : les secteurs favorables/défavorables dépendent du
  **Gua personnel** de l'occupant, calculé depuis sa date de naissance. Confirmé en
  inspectant directement `bazi-calculator-by-alvamind` (licence MIT, activement maintenu) :
  son module Eight Mansions **exige** `new BaziCalculator(year, month, day, hour, gender)`
  — impossible de l'utiliser avec la seule orientation du bâtiment.

**Décision de Laurent (2026-07-19) : Pakua classique.** Portée minimale, cohérent avec le
livre de référence, aucune nouvelle donnée personnelle à collecter (GEOBIO ne gère aucune
donnée de naissance du propriétaire aujourd'hui), aucune dépendance externe requise —
implémentable très largement avec les primitives géométriques déjà en place dans GEOBIO
(`bearingUnitVector`), plus un seul nouveau helper de géométrie pure (le centroïde, §6).

**Aucune des bibliothèques trouvées n'est donc retenue comme dépendance.** Elles servent de
référence pour valider notre propre implémentation, pas de brique à intégrer — confirmant
par ailleurs un constat partagé par la recherche externe elle-même : aucune de ces
bibliothèques ne fait de superposition spatiale sur un plan, c'est le "chaînon manquant"
que GEOBIO comble déjà avec son moteur de rendu Leaflet existant.

## 3. Orientation : boussole (classique), pas porte d'entrée (BTB)

Deux conventions existent pour aligner la grille des 8 secteurs sur un bâtiment :

- **Méthode occidentale (BTB — Black Sect Tantric Buddhism, invention du 20e siècle)** : le
  bas de la grille s'aligne toujours sur le mur contenant la porte d'entrée, sans boussole.
- **Méthode classique (boussole)** : la grille est alignée sur les points cardinaux réels
  (secteur "Carrière" toujours au Nord, etc.), indépendamment de la position de la porte.

Les deux méthodes sont **incompatibles entre elles** dès que la porte d'entrée ne fait pas
face exactement au nord (le cas le plus fréquent) — elles assignent des secteurs différents
aux mêmes pièces, on ne peut pas les combiner.

**Décision de Laurent (2026-07-19) : méthode boussole (classique).** Cohérente avec le
"Feng-shui antique" (pré-BTB, taoïste) que décrit le livre de référence de Laurent, et
recommandée par les sources consultées pour rester compatible avec d'autres techniques
futures (Étoiles Volantes/Xuan Kong). Techniquement plus simple pour GEOBIO : réutilise
le même style de calcul directionnel déjà construit pour Hartmann/Curry
(`bearingUnitVector`), sans nouvelle interaction utilisateur pour marquer l'entrée.

**Précision importante, pour éviter une confusion d'implémentation :** contrairement à
`GridTemplate.angleTrueNorthDeg`, qui est une valeur **variable par réseau** ressentie sur
le terrain (Hartmann = 0°, Curry = 45°...), l'orientation du Bagua est **toujours fixe à
0°** (vrai nord) par définition de la méthode boussole — ce n'est jamais une valeur
ressentie ni configurable par mission. `computeBaguaSectors` (§6) ne doit donc pas prendre
un paramètre d'angle variable : le nord est câblé en dur dans la fonction, pas passé par
l'appelant. Note pré-existante et non spécifique au Bagua : `Mission.declinationDeg` est
capturé à la création de la mission mais n'est consommé nulle part dans le pipeline
géométrique actuel (`gridGeneration.ts`, `createGridForPlan.ts`) — le "nord réel" utilisé
partout dans Plan 1, Bagua compris, est donc le nord du repère local de la mission, non
corrigé de la déclinaison magnétique. Ce n'est pas un défaut à corriger dans ce
sous-projet, juste une limite à connaître.

**Note pour plus tard, hors périmètre ici :** en méthode classique, la porte d'entrée reste
utile pour d'autres calculs feng shui (direction de façade pour les Étoiles Volantes,
validation qu'une entrée est favorable) — juste pas pour orienter la grille des 8 secteurs.
Si Laurent veut ajouter les Étoiles Volantes plus tard, la position de l'entrée sera
réutilisable à ce moment-là pour un usage différent.

## 4. Centre du Bagua : contour de bâtiment détecté automatiquement

Le centre des 8 secteurs doit être le centroïde du **bâtiment**, pas de la parcelle
cadastrale (une parcelle rurale peut être bien plus grande que la maison elle-même — le
centroïde de la parcelle serait faux dans ce cas, pertinent pour le contexte terrain de
Laurent, souvent en pleine campagne).

**Solution retenue, proposée par Laurent :** les plans cadastraux IGN montrent les
bâtiments visibles — on peut en extraire le contour automatiquement. Confirmé
techniquement : `BDTOPO_V3:batiment` est une couche WFS séparée de
`CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle` (Task 27), disponible sur le même
endpoint (`data.geopf.fr/wfs/ows`).

**Correction post-revue (2026-07-19) : la source des bornes de recherche n'est pas "les
parcelles sélectionnées".** Task 27 n'a construit que la couche données (service +
`setSelectedParcels` dans `missionsRepo.ts`) — il n'existe aujourd'hui **aucune UI** pour
sélectionner des parcelles (pas de composant, pas de phase dédiée dans le state machine de
`MissionWorkspace.tsx`). Le fetch des bâtiments doit donc partir d'une donnée qui existe
réellement à ce stade du flux : `Mission.originLat`/`originLng` (déjà garanti posé à ce
moment, cf. `setting-origin` dans le state machine) plus un rayon de recherche fixe (ex.
100m, élargissable si aucun bâtiment n'est trouvé) — le même principe que
`DEFAULT_GRID_RADIUS_M` dans `createGridForPlan.ts`. Ceci retire toute dépendance à une
future UI de sélection de parcelles ; si celle-ci est construite plus tard, elle pourra
affiner les bornes de recherche, mais ce sous-projet ne l'attend pas.

**Bénéfice supplémentaire, identifié par Laurent :** ce contour de bâtiment détecté sert
**aussi** de repère visuel pour caler le plan intérieur fourni par le client (qualité/format
aléatoires) — au lieu de caler uniquement à l'œil sur l'orthophoto (mécanisme existant,
Chunk 4/Task 15), le contour du bâtiment donne des coins précis à cliquer. Une seule donnée,
deux usages.

## 5. Flux utilisateur

1. Laurent pose l'origine de la mission (existant, Chunk 4/Task 13 — `Mission.originLat`/
   `originLng`)
2. Le logiciel récupère automatiquement le(s) contour(s) de bâtiment(s) dans un rayon
   fixe autour de cette origine via `BDTOPO_V3:batiment`, affichés sur la carte (voir §4
   pour la correction sur la source des bornes de recherche)
3. Si plusieurs bâtiments sont détectés (maison + garage + dépendance...), Laurent clique
   celui qui est la maison principale — le logiciel n'interprète pas, il place
4. Le contour confirmé est **stocké** sur la mission (pas re-fetché à chaque affichage —
   sauf action explicite "Changer de bâtiment", §6)
5. Laurent uploade le plan intérieur du client (existant, Task 14) et le cale par points de
   contrôle (existant, Chunk 4/Task 15) — le contour de bâtiment affiché aide au calage
6. Relevés terrain classiques : ressenti, Hartmann/Curry/etc. (existant, Plan 1)
7. Le centre du Bagua = centroïde du contour de bâtiment stocké, calculé automatiquement
8. La grille des 8 secteurs est générée, orientée sur le nord réel, affichée comme nouveau
   layer dans le panneau de calques
9. Une légende affiche la correspondance secteur → élément → objets correctifs (les "8
   Pk-codes" du livre de référence) quand la couche Bagua est active

## 6. Composants & modèle de données

**Détection et confirmation du contour de bâtiment**
- `src/data/buildingFootprintService.ts` — `fetchBuildingsInBounds(bounds, signal?)`, même
  mécanique que `cadastreService.ts` (Task 27) mais sur `BDTOPO_V3:batiment`
- Nouveau champ `Mission.buildingFootprint: Point[] | null` — **simplification volontaire**,
  ne garde que l'anneau extérieur du polygone IGN (contrairement à `CadastralParcel.ringsLatLng:
  LatLng[][]`, qui modélise plusieurs anneaux pour gérer les trous). Les bâtiments avec cour
  intérieure/patio sont un cas marginal pour l'usage de Laurent (résidentiel/rural) ; à
  revoir si ça s'avère faux en pratique — passer alors à `Point[][]` comme `CadastralParcel`.
- Migration + `setBuildingFootprint` dans `missionsRepo.ts`, même pattern que
  `setMissionOrigin`/`setSelectedParcels`/`setGlobalAssessment`
- Bouton "Changer de bâtiment" pour re-sélectionner si le contour BDTOPO est imprécis ou le
  mauvais bâtiment a été confirmé — même logique que le bouton "Effacer" de l'outil ligne
  guide (Chunk 9). **Décision :** ce bouton relance un fetch complet (`fetchBuildingsInBounds`
  à nouveau) plutôt que de réutiliser une liste de candidats mise en cache — plus simple,
  pas d'état supplémentaire à gérer, et le coût d'un aller-retour réseau est négligeable
  face à la fréquence d'usage (une correction occasionnelle, pas une boucle serrée).

**Géométrie Bagua**
- `src/geometry/bagua.ts` :
  - `computeCentroid(polygon: Point[]): Point` — nouveau, n'existe pas encore dans le moteur
    géométrique. **Précision :** centroïde géométrique (barycentre pondéré par l'aire, formule
    du lacet/shoelace), **pas** une simple moyenne des sommets — les deux divergent sur un
    polygone non-convexe (maison en L), et c'est justement le centroïde d'aire qui donne le
    "centre" visuellement attendu.
  - `computeBaguaSectors(center: Point, radiusM: number): BaguaSector[]` — **pas de paramètre
    d'angle** (voir §3 : l'orientation est toujours le nord fixe, câblée en dur dans la
    fonction) — 8 secteurs de 45°, testable à 100% sans carte réelle (même approche que
    `gridGeneration.ts`)
  - `radiusM` : **formule explicite** — distance maximale entre `computeCentroid(footprint)`
    et n'importe quel sommet du polygone (`max(distance(centroid, vertex))` sur tous les
    sommets). Garantit que les 8 secteurs couvrent l'intégralité du bâtiment, y compris ses
    ailes les plus éloignées sur une forme en L ; quitte à déborder un peu sur le petit axe.
  - `interface BaguaSector { compassDirection: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'; points: Point[] }`
    — `compassDirection` est la clé de jointure avec `baguaCorrespondences.ts` (ci-dessous) ;
    `BaguaLayer.tsx` fait `baguaCorrespondences[sector.compassDirection]` pour retrouver le
    label/élément/objets à afficher.
- Pas de nouvelle table type `GridInstance`/`GridLine` : le Bagua est **calculé à la volée**
  (centroïde + rayon dérivé de la taille du bâtiment, orientation toujours fixe), rien à
  persister côté grille elle-même, contrairement à Hartmann/Curry

**Rendu et contenu**
- `src/components/BaguaLayer.tsx` — 8 polygones colorés/labellisés, même famille que
  `NetworkLinesLayer` (composant séparé car `SiteMapView.test.tsx` mocke les layers
  jusqu'à un `<div>` sans vrai contexte Leaflet)
- `src/domain/baguaCorrespondences.ts` — table statique indexée par `compassDirection` (8
  entrées : label, élément, objets correctifs tirés du livre), donnée universelle, pas liée
  à une mission
- Panneau légende — **point de friction connu, à traiter dans ce sous-projet plutôt qu'à
  ignorer** : `SiteMapView` a déjà 4 panneaux overlay occupant les 4 coins (`LayerPanel`,
  ligne guide, édition, orthogonalité — voir revue Task 33). **Forme retenue pour le
  refactor** : extraire un composant `OverlayPanel({ corner: 'top-left' | 'top-right' |
  'bottom-left' | 'bottom-right', children })` qui porte le style `position: absolute` +
  `zIndex` + fond/padding déjà dupliqué 4 fois, avec le même traitement `maxHeight` +
  `overflowY: 'auto'` déjà appliqué à la pile top-right (Task 33) généralisé aux 4 coins —
  chaque coin peut alors empiler plusieurs panneaux (flex column), pas juste un. La légende
  Bagua (potentiellement longue, 8 entrées) est **repliée par défaut** (résumé + bouton
  "Détails") pour ne pas monopoliser un coin déjà partagé.

## 7. Gestion des erreurs et cas limites

- **Aucun bâtiment détecté** dans le rayon de recherche autour de l'origine → élargir le
  rayon une fois automatiquement (ex. 100m → 300m) avant d'abandonner ; si toujours rien,
  message clair, le Bagua reste simplement indisponible pour cette mission, pas de blocage
  du reste du relevé
- **Échec réseau** au fetch des bâtiments → message français standard (mêmes conventions
  que `cadastreService`/`feltPointsRepo`)

**Hypothèse non tranchée, à confirmer avec Laurent en implémentation :** le Bagua
s'applique par défaut **au bâtiment uniquement**, pas à la parcelle/au terrain entier — le
livre de référence reste ambigu sur ce point. À valider ou corriger une fois la première
version testée sur un vrai cas.

## 8. Tests

- `bagua.ts` : `computeCentroid` testé sur un polygone symétrique (résultat trivial à
  vérifier à la main) et un polygone non-convexe/en L (pour distinguer centroïde d'aire vs
  moyenne des sommets, cf. §6) ; `computeBaguaSectors` testé sur les 8 limites de secteur
  attendues à intervalles de 45° depuis le nord fixe, et sur le calcul de `radiusM`
- `buildingFootprintService.ts` : mocké comme `cadastreService.test.ts` (fixture GeoJSON
  écrite à la main), pas de dépendance à l'endpoint réel dans les tests
- `BaguaLayer.tsx` : rendu réel dans un `MapContainer`, comme `NetworkLinesLayer.test.tsx`
- Pas de test end-to-end `SiteMapView` complet pour ce sous-projet (même exception que
  Task 31 : trop de pièces mobiles pour un test d'intégration jsdom fiable, le vrai test
  est le contrôle terrain)

## 9. Hors périmètre explicite

- **Eight Mansions (Ba Zhai)** et toute méthode nécessitant une donnée de naissance
  personnelle — écarté en §2, pourrait revenir comme option future si demandé
- **Étoiles Volantes (Xuan Kong)** — mentionné comme extension possible future, réutiliserait
  la position de la porte d'entrée à ce moment-là, hors périmètre ici
- **Bagua étendu à la parcelle/au terrain** — non tranché, voir §7
- Le refactor `OverlayPanel` (§6) fait partie du périmètre de ce sous-projet, contrairement
  aux autres points ci-dessus

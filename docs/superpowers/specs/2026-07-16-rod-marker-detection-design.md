# Reconnaissance des tiges par marqueurs ArUco — Design

**Date :** 2026-07-16
**Statut :** Design validé par Laurent — prêt pour plan d'implémentation
**Sous-projet de :** GEOBIO — étend le Plan 1 (moteur réseaux telluriques), remplace
l'approche "détection couleur de tige entière" initialement esquissée dans la spec
d'architecture (§6.3) par une approche à base de marqueurs fiduciaires.

## 1. Contexte et objectif

Laurent pose des tiges en bois (~1 m, posées à plat au sol, une couleur par réseau :
rouge=Hartmann, jaune=Curry, vert=Peyré, bleu=eaux souterraines) pour matérialiser
son ressenti terrain. Objectif : détecter automatiquement leur position à partir
d'une photo aérienne (perche ~3 m), pour peupler la couche "ressenti terrain"
(`FeltPoint`, déjà construite en Plan 1) sans saisie manuelle point par point.

**Décision produit :** chaque tige porte un marqueur **ArUco** (fiduciaire noir/blanc,
technologie mature de vision par ordinateur — robotique, réalité augmentée,
photogrammétrie par drone) à chaque extrémité, plutôt que de détecter la couleur de
la tige entière. Ceci verrouille aussi le logiciel à un produit physique que Laurent
fabrique et vend (tiges + marqueurs).

## 2. Pourquoi ArUco plutôt que couleur ou électronique

- **Vs. détection de couleur de tige entière** (approche initiale esquissée) : un
  marqueur noir/blanc est bien plus robuste aux variations de luminosité/ombre
  qu'une teinte perçue, donne position **et** orientation précises (2 marqueurs = 2
  points = le segment complet), et peut encoder un identifiant unique — éliminant la
  dépendance à la couleur perçue.
- **Vs. options électroniques** (BLE, UWB, RTK par tige, NFC, LiDAR) — toutes
  écartées : BLE trop imprécis au sol, UWB nécessite des ancres fixes (frein déjà
  identifié pour une visite ponctuelle), RTK par tige trop coûteux pour du matériel
  consommable, NFC ne donne aucune position, LiDAR grand public trop court en
  portée extérieure et les tiges fines ne ressortent pas dans un nuage de points.

## 3. Contrainte transverse : exécution hors-ligne

Laurent ne veut pas dépendre d'une connexion réseau pendant le relevé terrain — pour
deux raisons : le wifi/GSM actif perturbe son ressenti, et une zone rurale n'a pas
toujours de réseau. **La détection doit donc s'exécuter entièrement sur l'appareil,
sans aucun appel réseau.**

**Choix technique : js-aruco2** (bibliothèque JavaScript pure, dédiée à la détection
ArUco/estimation de pose — [damianofalcioni/js-aruco2](https://github.com/damianofalcioni/js-aruco2)).

**⚠️ Correction post-recherche technique (2026-07-16) :** ce document recommandait
initialement OpenCV.js (le moteur C++ de référence compilé en WebAssembly), en
pensant résoudre le dilemme de Laurent entre robustesse (il pensait Python/OpenCV
serveur) et fonctionnement hors-ligne (incompatible avec un serveur distant). Une
vérification a révélé un problème réel : **les binaires OpenCV.js précompilés
standards n'incluent PAS le module ArUco** (il fait partie d'`opencv_contrib` et
nécessite une compilation personnalisée avec la chaîne d'outils Emscripten — un
vrai chantier de build, pas un simple import). js-aruco2 est un choix plus adapté :
même famille d'algorithme (détection de marqueurs carrés fiduciaires), construit
spécifiquement pour ce cas d'usage, **aucune compilation ni WebAssembly à gérer**
(JavaScript pur, simple import npm) — ce qui résout du même coup deux des
incertitudes listées en §8 (environnement de test, packaging).

**Limite à connaître, indépendante du choix de bibliothèque :** la détection ArUco
classique (que ce soit via OpenCV ou js-aruco2, même famille d'algorithme) a des
limites documentées en conditions d'éclairage difficiles — un vrai test terrain
avec de vrais marqueurs imprimés reste indispensable, pas seulement un test en
environnement contrôlé.

**Périmètre de ce sous-projet vs. futur chantier "hors-ligne complet" :** Laurent a
décrit un modèle en 4 phases pour l'usage terrain : préparation (online : adresse,
fond de carte, parcelles) → relevé terrain (hors-ligne prioritaire : ressenti,
photos, détection, positionnement de grilles) → remontée des données (online) →
édition du rapport (online). Rendre **toute** la phase 2 utilisable hors-ligne
(stockage local + synchronisation différée pour la création de mission, les points
ressentis, les grilles...) est un chantier d'architecture séparé et plus large, qui
touche tout ce qui a déjà été construit en Plan 1 — explicitement **hors périmètre
ici**. Ce sous-projet garantit seulement que **la détection elle-même** ne dépend
d'aucune connexion, ce qui est vrai par construction avec js-aruco2 (JS pur, aucun
appel réseau, aucun asset WASM à charger).

## 4. Flux utilisateur

1. Laurent prend une photo aérienne (perche ~3 m) et l'ajoute à la galerie de photos
   de la mission (`MissionPhotosGallery`, déjà construit — Plan 1, Chunk 10).
2. Depuis cette galerie, il déclenche le calage de cette photo — 2 à 4 points de
   repère communs (coin de bâtiment, allée...) entre la photo et la vue aérienne,
   exactement le même mécanisme que le calage du plan intérieur (`calibratePlan`,
   déjà construit, Plan 1 Chunk 2/4). Réutilisation directe de la logique de calage ;
   **le composant `PlanCalibrationTool`** (Plan 1 Chunk 4), aujourd'hui câblé
   uniquement dans le flux d'import du plan intérieur, doit être rendu accessible
   depuis la galerie de photos de mission pour ce nouvel usage (voir §5,
   `RodDetectionPanel`).
3. Il clique "Détecter les tiges".
4. La détection s'exécute dans le navigateur (js-aruco2) sur l'image calée.
5. Chaque marqueur détecté est identifié via la table `rod_marker` (association
   fixe marqueur → réseau + tige, définie à la fabrication).
6. Les positions pixel des marqueurs reconnus sont converties en coordonnées réelles
   locales via la transformation de calage de l'étape 2.
7. Chaque point est **enregistré directement** comme `FeltPoint` — rattaché au
   `Plan` extérieur de la mission (`exteriorPlan.id`, déjà disponible dans l'état de
   `MissionWorkspace` au moment où la galerie de photos est affichée ; `FeltPoint`
   exige un `planId`, pas seulement une mission) — visible immédiatement dans la
   couche "Ressenti terrain" (déjà visible par défaut, Plan 1 Chunk 8). Pas d'étape
   de prévisualisation/validation intermédiaire — Laurent corrige après coup comme
   n'importe quel point posé à la main (via le nouveau `deleteFeltPoint`, §5).

**Une photo peut contenir des tiges de plusieurs réseaux mélangées** — chaque
marqueur est identifié individuellement par son propre ID, donc aucune ambiguïté
même si Hartmann et Peyré (même angle théorique 0°) apparaissent sur la même photo.

## 5. Composants

| Composant | Rôle | Testabilité |
|---|---|---|
| `rod_marker` (table) | `marker_id → {network_name, rod_number}`, fixé à la fabrication des tiges | — (données de config) |
| `arucoMapping.ts` | Logique pure : détections brutes + transformation de calage + table `rod_marker` → liste de points `{réseau, x, y}` | 100% testable avec des détections simulées, sans image réelle |
| `arucoDetector.ts` | Charge js-aruco2, lance la détection sur une image, retourne les détections brutes `{marker_id, position pixel}` | Test de fumée + tests avec de vraies images de marqueurs générées (js-aruco2 étant du JS pur, testable directement en Vitest/jsdom sans souci de chargement WASM) — la précision en conditions réelles (éclairage terrain) se valide avec de vrais marqueurs imprimés, pas par test automatisé |
| `RodDetectionPanel` (UI, nouveau) | Câble le flux complet depuis `MissionPhotosGallery` : ouvre `PlanCalibrationTool` pour caler la photo sélectionnée (réutilisation, pas de nouveau calage), déclenche `arucoDetector` + `arucoMapping`, affiche le message "X marqueurs détectés, Y reconnus" (§6), persiste les points via `feltPointsRepo.createFeltPoint` avec `planId = exteriorPlan.id` | Logique de câblage testée en mockant `arucoDetector`/`arucoMapping`/le repo — pas de dépendance à js-aruco2 réel dans ses propres tests |
| Extension de `feltPointsRepo` | Ajout de `deleteFeltPoint` (**manquant actuellement** — nécessaire pour "corriger après coup") | Testé comme les autres fonctions du repo |

**Frontière de responsabilité :** `arucoDetector.ts` est la seule brique qui touche
js-aruco2 directement — si son API réelle diffère de ce qui est documenté (même
traitement d'incertitude que Leaflet.DistortableImage et Leaflet-Geoman ailleurs
dans Plan 1, bien que le risque soit moindre ici : JS pur, pas de binaire externe),
seule cette brique doit changer. `arucoMapping.ts` ne dépend que de types de
données simples (positions, IDs), jamais de js-aruco2 directement.

## 6. Gestion des erreurs

| Cas | Comportement |
|---|---|
| Aucun marqueur détecté | Message clair, aucun `FeltPoint` créé, pas de plantage |
| Marqueur détecté mais absent de `rod_marker` (marqueur inconnu/mal imprimé) | Ignoré silencieusement pour la création de points, mais Laurent est informé ("X marqueurs détectés, Y reconnus") — jamais une perte de donnée totalement silencieuse |
| Une seule extrémité d'une tige détectée (l'autre masquée/floue) | Le point détecté est quand même créé — mieux qu'une perte totale de la donnée pour cette tige |
| Le même `marker_id` détecté deux fois sur une photo (marqueur dupliqué/mal imprimé) | Chaque détection est traitée indépendamment (`arucoMapping.ts` ne déduplique pas) — crée deux points ; un marqueur physique dupliqué est une erreur de fabrication à corriger en amont, pas quelque chose que la détection doit deviner |

## 7. Hors périmètre (explicite)

- **Hors-ligne complet de la phase relevé** (mission, points ressentis, grilles) —
  chantier séparé, voir §3.
- **Prévisualisation/validation avant enregistrement** — Laurent a choisi
  l'enregistrement direct avec correction après coup.
- **Tracé visuel reliant les deux extrémités d'une tige** — les deux marqueurs
  produisent deux `FeltPoint` indépendants, pas un segment explicite. `rod_number`
  est conservé dans `rod_marker` (donnée de fabrication) mais n'est pas consommé
  pour un rendu de segment dans ce sous-projet — pourrait servir à une amélioration
  future sans changement de modèle.
- **Interface de gestion de la table `rod_marker`** — donnée de fabrication qui
  change rarement ; seed initial + édition directe en base (Supabase dashboard)
  suffisent, pas d'écran dédié pour l'instant.
- **Stitching multi-photos** pour de grandes surfaces — une photo par calibration de
  réseau, comme décrit par Laurent.

## 8. Points ouverts à vérifier en implémentation

**Résolus par le passage à js-aruco2 (2026-07-16) :**
- ~~Test dans l'environnement Vitest/jsdom~~ — js-aruco2 est du JS pur, pas de WASM
  à charger, testable directement en Vitest/jsdom sans souci particulier.
- ~~Packaging de l'asset WASM~~ — sans objet, js-aruco2 est un simple import npm.

**Encore ouverts :**
1. Taille exacte des marqueurs ArUco (~8-15cm estimé pour une perche à 3m) — à
   valider avec de vrais marqueurs imprimés et une vraie photo test.
2. API exacte de js-aruco2 pour la détection (noms de fonctions/classes, format des
   détections retournées) — à vérifier contre la documentation/le code source du
   projet au moment de l'implémentation.
3. Fiabilité de détection en conditions d'éclairage réelles variables (soleil direct,
   ombre partielle) — limite documentée de la famille d'algorithmes ArUco en
   général, pas spécifique à js-aruco2 ; à valider empiriquement, pas à supposer
   résolue par le choix de bibliothèque.

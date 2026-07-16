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

**Choix technique : OpenCV.js** (la bibliothèque OpenCV C++ de référence, compilée en
WebAssembly, exécutée dans le navigateur). Ce choix résout un dilemme apparent —
Laurent voulait à la fois une solution robuste/évolutive (pensant à Python/OpenCV
serveur) et un fonctionnement hors-ligne (incompatible avec un serveur distant) :
OpenCV.js est le même moteur de détection que la version Python (module ArUco
inclus), mais s'exécute 100% localement, sans serveur.

**Périmètre de ce sous-projet vs. futur chantier "hors-ligne complet" :** Laurent a
décrit un modèle en 4 phases pour l'usage terrain : préparation (online : adresse,
fond de carte, parcelles) → relevé terrain (hors-ligne prioritaire : ressenti,
photos, détection, positionnement de grilles) → remontée des données (online) →
édition du rapport (online). Rendre **toute** la phase 2 utilisable hors-ligne
(stockage local + synchronisation différée pour la création de mission, les points
ressentis, les grilles...) est un chantier d'architecture séparé et plus large, qui
touche tout ce qui a déjà été construit en Plan 1 — explicitement **hors périmètre
ici**. Ce sous-projet garantit seulement que **la détection elle-même** ne dépend
d'aucune connexion, ce qui est vrai par construction avec OpenCV.js.

## 4. Flux utilisateur

1. Laurent prend une photo aérienne (perche ~3 m) et l'ajoute à la galerie de photos
   de la mission (`MissionPhotosGallery`, déjà construit — Plan 1, Chunk 10).
2. Il cale la photo sur la carte IGN — 2 à 4 points de repère communs (coin de
   bâtiment, allée...) entre la photo et la vue aérienne, exactement le même
   mécanisme que le calage du plan intérieur (`calibratePlan`, déjà construit,
   Plan 1 Chunk 2/4). Réutilisation directe, pas de nouvelle logique de calage.
3. Il clique "Détecter les tiges".
4. La détection s'exécute dans le navigateur (OpenCV.js) sur l'image calée.
5. Chaque marqueur détecté est identifié via la table `rod_marker` (association
   fixe marqueur → réseau + tige, définie à la fabrication).
6. Les positions pixel des marqueurs reconnus sont converties en coordonnées réelles
   locales via la transformation de calage de l'étape 2.
7. Chaque point est **enregistré directement** comme `FeltPoint` (réseau, x, y) —
   visible immédiatement dans la couche "Ressenti terrain" (déjà visible par défaut,
   Plan 1 Chunk 8). Pas d'étape de prévisualisation/validation intermédiaire —
   Laurent corrige après coup comme n'importe quel point posé à la main.

**Une photo peut contenir des tiges de plusieurs réseaux mélangées** — chaque
marqueur est identifié individuellement par son propre ID, donc aucune ambiguïté
même si Hartmann et Peyré (même angle théorique 0°) apparaissent sur la même photo.

## 5. Composants

| Composant | Rôle | Testabilité |
|---|---|---|
| `rod_marker` (table) | `marker_id → {network_name, rod_number}`, fixé à la fabrication des tiges | — (données de config) |
| `arucoMapping.ts` | Logique pure : détections brutes + transformation de calage + table `rod_marker` → liste de points `{réseau, x, y}` | 100% testable avec des détections simulées, sans image réelle |
| `arucoDetector.ts` | Charge OpenCV.js, lance la détection sur une image, retourne les détections brutes `{marker_id, position pixel}` | Test de fumée seulement (charge sans planter) — la précision réelle se valide avec de vrais marqueurs imprimés, pas par test automatisé |
| Extension de `feltPointsRepo` | Ajout de `deleteFeltPoint` (**manquant actuellement** — nécessaire pour "corriger après coup") | Testé comme les autres fonctions du repo |

**Frontière de responsabilité :** `arucoDetector.ts` est la seule brique qui touche
OpenCV.js directement — si son API réelle diffère de ce qui est documenté (même
traitement d'incertitude que Leaflet.DistortableImage et Leaflet-Geoman ailleurs
dans Plan 1), seule cette brique doit changer. `arucoMapping.ts` ne dépend que de
types de données simples (positions, IDs), jamais d'OpenCV directement.

## 6. Gestion des erreurs

| Cas | Comportement |
|---|---|
| Aucun marqueur détecté | Message clair, aucun `FeltPoint` créé, pas de plantage |
| Marqueur détecté mais absent de `rod_marker` (marqueur inconnu/mal imprimé) | Ignoré silencieusement pour la création de points, mais Laurent est informé ("X marqueurs détectés, Y reconnus") — jamais une perte de donnée totalement silencieuse |
| Une seule extrémité d'une tige détectée (l'autre masquée/floue) | Le point détecté est quand même créé — mieux qu'une perte totale de la donnée pour cette tige |

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

1. OpenCV.js (WebAssembly) doit être testé dans l'environnement de test actuel
   (Vitest/jsdom) — possible que le chargement du WASM nécessite un vrai navigateur
   (Playwright) plutôt que jsdom. À confirmer tôt, avant d'écrire beaucoup de code
   autour de `arucoDetector.ts`.
2. Taille exacte des marqueurs ArUco (~8-15cm estimé pour une perche à 3m) — à
   valider avec de vrais marqueurs imprimés et une vraie photo test.
3. API exacte d'OpenCV.js pour la détection ArUco (noms de fonctions, format des
   détections retournées) — à vérifier contre la documentation au moment de
   l'implémentation.

# Calage à 1 point pour les photos de tiges — Design

## Contexte

Aujourd'hui, chaque photo de tiges (prise pour la détection automatique de
marqueurs ArUco) doit être calée manuellement avant que "Détecter les tiges"
puisse s'exécuter : `PlanCalibrationTool.tsx` demande 2 à 4 "points de
contrôle", chacun nécessitant un clic sur la photo ET un clic au même
endroit réel sur une petite carte intégrée (400px de haut, zoom non forcé).
`calibratePlan` (`src/geometry/calibration.ts`) ajuste ensuite une
transformation "similarité" (rotation + échelle uniforme + translation, sans
cisaillement) par moindres carrés à partir de ces points.

Ce calage manuel est le principal facteur de précision (ou d'imprécision)
de toute la chaîne : chaque tige détectée sur la photo passe par CETTE
UNIQUE transformation pour obtenir sa position réelle sur le plan
(`arucoMapping.ts`, `mapDetectionsToPoints`). Une imprécision de clic sur
la petite carte de calage — d'autant plus probable qu'aucun zoom minimum
n'est imposé — se répercute sur toutes les tiges de la photo.

Laurent prend systématiquement ses photos avec un trépied + un bras
télescopique de 3m + une télécommande de déclenchement, garantissant une
prise de vue verticale et centrée sur l'endroit où il se tient. Il ne
photographie que des croisements de réseaux (au moins 2 réseaux différents
toujours visibles sur une même photo). Chaque tige physique porte 2
marqueurs ArUco espacés d'exactement 1m (même convention que le segment
ressenti placé manuellement, `FELT_SEGMENT_HALF_LENGTH_M = 0.5`).

Ces 3 faits permettent de dériver automatiquement l'échelle et la rotation
du calage directement depuis le contenu de la photo, sans intervention
manuelle — il ne reste alors qu'**un seul point** à préciser : où, sur le
plan, se trouve le centre de la photo (= où Laurent se tenait).

## Objectifs

- Remplacer le calage manuel à 2-4 points, pour les photos de tiges
  uniquement, par un calage à 1 clic : centre de la photo (calculé
  automatiquement) → 1 clic sur le plan.
- Dériver l'échelle depuis la distance mesurée (en pixels) entre les 2
  marqueurs de chaque tige complète détectée, comparée à la distance réelle
  connue de 1m.
- Dériver la rotation globale de la photo depuis les familles d'angles
  connues des tiges détectées (`networkBearings.ts`), **avec une
  ambiguïté résiduelle à 90° acceptée** (voir "Limite connue, acceptée"
  ci-dessous) — pas une désambiguïsation complète : les 5 réseaux connus
  n'ont que 2 familles (Hartmann/Palm/Peyré = 0°/90°, Curry/Wissmann =
  45°/135°), toutes deux invariantes sous une rotation de 90°, donc aucune
  combinaison de tiges/réseaux ne peut lever ce doute à 90° près par le
  seul calcul.
- Afficher en dur dans l'interface l'hypothèse de prise de vue (trépied +
  bras 3m + télécommande = vertical, centré) — non configurable.

## Non-objectifs (hors périmètre de ce chantier)

- Le calage du plan intérieur (`PlanCalibrationTool` utilisé depuis
  `MissionWorkspace.tsx`, sans marqueurs ArUco) — reste inchangé, aucune
  tige n'y est détectable pour dériver quoi que ce soit automatiquement.
- Tout repli vers l'ancien calage manuel en cas d'échec de détection —
  périmètre volontairement strict (voir "Gestion des erreurs").
- La distinction visuelle ressenti/théorique et la duplication de lignes
  théoriques depuis un segment réel — sous-projet B, spécifié séparément.
- La correction de distorsion de perspective (photo pas parfaitement à la
  verticale) — l'hypothèse de prise de vue verticale est admise telle
  quelle, pas de correction algorithmique de tilt.

## Flux utilisateur

1. Laurent importe une photo dans `RodDetectionPanel` (via
   `MissionPhotosGallery`, comme aujourd'hui).
2. La détection ArUco (`detectMarkers`) se lance **automatiquement dès
   l'import**, sans étape de calage préalable et sans confirmation
   intermédiaire.
3. Selon le résultat de la détection, 3 issues possibles (alternatives,
   pas des étapes séquentielles — voir "Gestion des erreurs" pour le
   détail des 2 cas d'erreur) :
   - **Aucune tige complète détectée** → erreur bloquante, fin du flux
     pour cette photo.
   - **Tige(s) complète(s) détectée(s), mais aucune de réseau à famille
     d'angles connue** → erreur bloquante distincte, fin du flux.
   - **Cas nominal** (≥1 tige complète, dont ≥1 de réseau à famille
     connue) → l'app demande "Cliquez sur le plan à l'endroit où vous vous
     teniez pour cette photo" — un seul clic sur la carte. Suite au point 4.
4. Le clic déclenche le calcul de la transformation complète (voir
   "Dérivation de la transformation"), puis la création directe des
   `FeltPoint`/`FeltSegment` correspondants — même comportement final
   qu'aujourd'hui une fois le calage obtenu. Pas d'étape d'aperçu/
   confirmation intermédiaire avant création : `createFeltPoint`/
   `createFeltSegment` passent déjà par `undoableWrite` (vérifié dans
   `feltPointsRepo.ts`/`feltSegmentsRepo.ts`) — un clic mal placé reste
   rattrapable via le "Annuler" global déjà existant, sans qu'une UI de
   confirmation dédiée soit nécessaire pour ce chantier. **Note** : une
   photo crée typiquement plusieurs entités (une par tige complète + une
   par marqueur isolé) — chacune est sa propre entrée d'historique
   indépendante (`undoableWrite` n'accepte pas de `batchId` sur un
   `insert`, vérifié dans `actionHistory.ts`), donc défaire tout le lot
   d'une photo demande plusieurs clics Annuler successifs, pas un seul.
   Accepté tel quel pour ce chantier — pas d'extension du système
   d'historique pour permettre un `batchId` sur les insertions.
5. Un bouton "Inverser l'orientation (90°)" reste disponible juste après
   cette création, pour corriger l'ambiguïté de rotation résiduelle si le
   résultat ne correspond pas au terrain (voir "Correction manuelle" plus
   bas).

## Dérivation de la transformation

### Flux de données : grouper les marqueurs en tiges AVANT que la transformation existe

`mapDetectionsToPoints(detections, calibration, rodMarkers)` (déjà
existant, `arucoMapping.ts`) exige un `AffineTransform` en entrée pour
produire les `RecognizedPoint` (en coordonnées RÉELLES) que
`pairIntoSegmentsAndPoints` regroupe ensuite par tige. Or ce chantier a
besoin l'inverse : grouper les marqueurs par tige EN ESPACE PIXEL d'abord,
pour calculer l'échelle et la rotation à partir de CE groupement, avant
qu'un `AffineTransform` existe.

Résolu en appelant `mapDetectionsToPoints` **deux fois**, sans le
modifier :

1. **Premier appel, transform identité** (`{a:1, b:0, c:0, d:1, e:0, f:0}`)
   → chaque `RecognizedPoint` a alors `x, y` = les coordonnées PIXEL brutes
   (l'identité ne change rien). `pairIntoSegmentsAndPoints` sur ce
   résultat donne les tiges groupées EN ESPACE PIXEL — c'est ce
   groupement qui sert de base au calcul d'échelle/rotation ci-dessous.
2. Calcul de `s`, `θ`, `(e, f)` à partir de ce groupement pixel (détail
   plus bas) → construction du vrai `AffineTransform`.
3. **Second appel, avec la vraie transformation** → les `RecognizedPoint`
   obtenus sont maintenant en coordonnées RÉELLES, prêts pour
   `createFeltPoint`/`createFeltSegment` — chemin final identique à
   aujourd'hui.

`arucoMapping.ts` n'est donc pas modifié — seulement appelé 2 fois
depuis la nouvelle logique de calage, avec 2 transformations différentes.

Réutilise le même type `AffineTransform` (`{a, b, c, d, e, f}`) et la même
sémantique d'application déjà en place (`applyAffineTransform.ts`,
vérifiée dans le code existant) :

```
x' = a·x + b·y + e
y' = c·x + d·y + f
```

Pour une similarité pure (échelle uniforme `s`, rotation `θ`, sans
cisaillement — même famille de transformation que `calibratePlan`
aujourd'hui) :

```
a = s·cos(θ)   b = -s·sin(θ)
c = s·sin(θ)   d = s·cos(θ)
```

### Échelle `s`

Pour chaque tige complète détectée : distance en pixels entre les
centroïdes de ses 2 marqueurs (`D_px`). `s` doit convertir des pixels en
unités réelles (voir les formules `x' = a·x + b·y + e` ci-dessus, où
`x, y` sont en pixels et `x', y'` en mètres réels) :

```
s = 1m ÷ D_px
```

(pas `D_px ÷ 1m`, qui donnerait une unité px/m — l'inverse de ce qu'il
faut — bien vérifier ce sens en implémentation, cf. le test dédié
ci-dessous.)

`s` final = moyenne arithmétique de cette estimation sur toutes les tiges
complètes détectées dans la photo (plus robuste au bruit de détection
qu'une seule tige — confirmé avec Laurent).

### Rotation `θ`

Une SEULE valeur de `θ` pour toute la photo. Seules les tiges dont
`allowedBearingsForNetwork(networkName)` renvoie une famille non-nulle
participent ; les autres (réseau personnalisé/"Autre", famille inconnue)
sont ignorées pour la rotation, mais comptent toujours pour l'échelle.

Algorithme (délibérément simple — voir "Limite connue, acceptée"
ci-dessous pour pourquoi un algorithme plus élaboré n'apporterait rien
contre l'ambiguïté à 90°, même si inclure plus de tiges réduirait un peu
le bruit de mesure sur l'angle d'UN candidat donné) :
1. Prendre la première tige à famille connue détectée. Ses 2 marqueurs
   donnent un angle mesuré en pixels.
2. `θ = (premier membre de sa famille, ex. 0° pour Hartmann, 45° pour
   Curry) − (angle mesuré)`.
3. Les autres tiges à famille connue, s'il y en a, ne participent pas à ce
   calcul volontairement simplifié.

⚠️ **Point technique à vérifier empiriquement en implémentation, pas
figé ici** : le sens exact de `θ` (le signe de la conversion angle-pixel
→ rotation réelle) dépend de la convention d'axes de l'espace image
(Y vers le bas) par rapport à l'espace local (Y vers le nord). Le calage
manuel actuel s'en accommode implicitement via l'ajustement par moindres
carrés ; le nouveau calcul direct doit être validé contre une vraie photo
de test avec une orientation de tige connue avant d'être considéré
correct — ne pas supposer un signe sans test réel (même leçon que le bug
d'ordre des axes BBOX du 23/07/2026, jamais détecté par un test avec
fetch mocké). Cette validation contre une vraie photo est distincte de
l'ambiguïté à 90° ci-dessous : la résoudre ne résout PAS l'ambiguïté, ce
sont deux problèmes différents.

### Translation `(e, f)`

Le point unique cliqué sur le plan par Laurent est converti en
coordonnées locales (`latLngToLocal`), donnant `realCenter`. Le centre de
la photo en pixels `(cx, cy)` est calculé automatiquement
(`naturalWidth / 2`, `naturalHeight / 2`). `e` et `f` sont alors résolus
pour que ce point du centre corresponde exactement à `realCenter` :

```
e = realCenter.x − (a·cx + b·cy)
f = realCenter.y − (c·cx + d·cy)
```

### Limite connue, acceptée : ambiguïté résiduelle à 90°

Les 5 réseaux connus n'ont que 2 familles d'angles
(`networkBearings.ts`) : Hartmann/Palm/Peyré = 0°/90°, Curry/Wissmann =
45°/135°. **Les deux sont invariantes sous une rotation globale de 90°**
(tourner toute la photo de 90° laisse chaque famille inchangée comme
ensemble). Conséquence vérifiée par le calcul lors de la revue de ce
spec : aucune combinaison de tiges, aucun nombre de réseaux différents
visibles dans une même photo, ne peut lever cette ambiguïté à 90° par le
seul calcul — une tentative de "score global sur toutes les tiges" (testée
et rejetée en revue) donne une erreur totale strictement égale pour les 2
candidats, systématiquement. Ce n'est pas une limite d'implémentation,
c'est une propriété mathématique des familles d'angles telles qu'elles
existent aujourd'hui.

**Décision de Laurent : le risque est accepté.** Le calage peut donc, dans
certains cas, être tourné de 90° par rapport à la réalité — de façon
silencieuse, sans erreur levée (les `FeltPoint`/`FeltSegment` sont créés
normalement, juste dans la mauvaise orientation). Laurent vérifie
visuellement le résultat et corrige manuellement si besoin (voir
"Correction manuelle" ci-dessous).

## Correction manuelle : "Inverser l'orientation"

Puisque l'ambiguïté est **binaire** (exactement 2 candidats possibles,
toujours à 90° l'un de l'autre, jamais plus), la correction est un simple
bouton bascule, affiché juste après la création des points/segments d'une
photo, tant que Laurent est encore sur cet écran :

> "Ça ne correspond pas au terrain ? Inverser l'orientation (90°)"

Au clic, réutilise ce qui doit être gardé en état local du composant
depuis la détection initiale (rien de persisté) :
- les `detections` brutes (sortie de `detectMarkers`) et `rodMarkers`
  (nécessaires pour rappeler `mapDetectionsToPoints`, voir sa signature en
  "Flux de données" plus haut) ;
- le groupement par tige en espace pixel (sortie du premier appel à
  `pairIntoSegmentsAndPoints`, voir "Flux de données") ;
- l'échelle `s` déjà calculée (ne change pas, seule la rotation change) ;
- le point cliqué `realCenter` (ne change pas non plus).

1. Recalcule `θ` avec le SECOND membre de la famille de la tige de
   référence (`(second membre) − (angle mesuré)`), reconstruit
   `AffineTransform` (même `s`, même `realCenter`, nouveau `θ`), puis
   relance le 2e appel à `mapDetectionsToPoints` (voir "Flux de données"
   plus haut) avec cette transformation corrigée.
2. Supprime les `FeltPoint`/`FeltSegment` créés par la détection initiale
   (`deleteFeltPoint`/`deleteFeltSegment`, déjà existants) puis recrée
   l'ensemble avec les positions corrigées (`createFeltPoint`/
   `createFeltSegment`, déjà existants) — suppression + recréation plutôt
   qu'une mise à jour en place, pour réutiliser les primitives de repo
   existantes sans en ajouter une nouvelle. Chaque suppression et création
   passe par `undoableWrite` comme d'habitude — un "Inverser l'orientation"
   reste lui-même annulable via le "Annuler" global (au prix de plusieurs
   clics Annuler pour tout défaire, comme pour la création initiale —
   même limite que notée au Flux utilisateur étape 4).

Ce bouton n'est utile/affiché que s'il existe au moins une tige à famille
d'angles connue (sinon la rotation n'a pas pu être calculée du tout — voir
"Gestion des erreurs").

## Gestion des erreurs

- **Aucune tige complète détectée** : erreur bloquante affichée, pas de
  calcul de transformation, pas de calage possible pour cette photo tant
  qu'une tige n'y est pas visible. Pas de repli vers l'ancien calage
  manuel pour ce flux (décision explicite de Laurent — périmètre volontai-
  rement strict).
- **Tige(s) complète(s) détectée(s), mais aucune de réseau à famille
  d'angles connue** (`allowedBearingsForNetwork` renvoie `null` pour
  toutes — réseau "Autre"/personnalisé, ou tout `rod_marker.network_name`
  hors des 5 valeurs connues ; rien en base n'empêche une valeur
  arbitraire ici) : la rotation ne peut pas être dérivée. Erreur bloquante
  distincte de la précédente ("Aucune tige de réseau reconnu détectée —
  impossible de calculer l'orientation."), même absence de repli manuel.
- **Détection ArUco elle-même échoue** (erreur technique, pas "0 résultat")
  : géré comme aujourd'hui par le mode d'échec déjà existant de
  `detectMarkers`/`RodDetectionPanel` — inchangé par ce chantier, mais son
  déclencheur change (aujourd'hui lié au clic du bouton "Détecter les
  tiges" dans `handleDetect` ; demain à un effet déclenché à l'import de
  la photo) — l'implémenteur doit adapter CE déclencheur, pas juste
  supposer qu'aucun code n'est à toucher sur ce chemin.

## Portée technique (fichiers concernés)

- `src/components/RodDetectionPanel.tsx` — nouveau flux (détection
  automatique à l'import, calcul de calage au clic sur le plan), remplace
  l'usage actuel de `PlanCalibrationTool` **pour ce composant uniquement**.
  `MissionWorkspace.tsx`'s usage de `PlanCalibrationTool` pour le plan
  intérieur reste identique, aucun changement.
- Nouvelle fonction de dérivation de transformation (échelle + rotation +
  translation depuis 1 point + tiges détectées) — nouveau fichier dans
  `src/geometry/` ou `src/vision/`, nom à trancher en plan
  d'implémentation, réutilise `AffineTransform`/`applyAffineTransform`
  existants sans les modifier.
- `src/domain/networkBearings.ts` — réutilisé tel quel
  (`allowedBearingsForNetwork`), aucune modification attendue.
- Texte d'interface fixe (hypothèse trépied/bras/télécommande) — ajouté
  dans `RodDetectionPanel.tsx`, non configurable.
- Bouton "Inverser l'orientation" et sa logique de recalcul/remplacement
  — même nouveau fichier de dérivation que ci-dessus, plus les appels
  `deleteFeltPoint`/`deleteFeltSegment`/`createFeltPoint`/
  `createFeltSegment` (existants, réutilisés tels quels) depuis
  `RodDetectionPanel.tsx`.

## Tests

- Dérivation d'échelle : une tige connue à une distance pixel donnée doit
  produire l'échelle attendue (`s = 1m ÷ D_px`, **pas** `D_px ÷ 1m` — sens
  à vérifier explicitement dans le test, c'est l'erreur trouvée en revue
  de ce spec) ; plusieurs tiges doivent donner la moyenne correcte.
- Dérivation de rotation : la première tige à famille connue doit aligner
  son angle mesuré sur le PREMIER membre de sa famille (ex. 0° pour
  Hartmann, 45° pour Curry) — règle déterministe, pas une recherche parmi
  plusieurs candidats (voir "Limite connue, acceptée" : une recherche plus
  élaborée ne changerait rien au résultat).
- Tiges à réseau sans famille connue : ignorées pour le calcul de
  rotation, mais toujours prises en compte pour l'échelle.
- "Inverser l'orientation" : partant d'un résultat initial connu, le clic
  doit produire l'AUTRE candidat (second membre de la famille de la tige
  de référence), supprimer les entités initialement créées et en recréer
  de nouvelles aux positions corrigées — vérifier qu'aucune entité de
  l'ancien calage ne subsiste après coup.
- Translation : le centre de la photo doit se mapper exactement sur le
  point réel cliqué, quels que soient l'échelle et la rotation calculées.
- Bout en bout (synthétique) : un jeu de marqueurs de test avec
  position/rotation/échelle connues doit, après calcul de la
  transformation puis application via `applyAffineTransform`, retrouver
  les positions réelles attendues à une tolérance flottante près.
- Bout en bout (vraie photo) : requis par le point ⚠️ ci-dessus — au moins
  une vraie photo de tige avec orientation connue doit être utilisée pour
  valider empiriquement le sens de `θ`, en plus du test synthétique (qui
  ne peut pas, par construction, révéler une erreur de signe cohérente
  entre la génération du jeu de test et le code testé).
- Erreur : aucune tige complète détectée → l'erreur attendue est levée,
  aucun appel à `createFeltPoint`/`createFeltSegment`.
- Erreur : tige(s) complète(s) détectée(s) mais aucune de réseau à famille
  connue → l'erreur d'orientation attendue est levée, aucun appel à
  `createFeltPoint`/`createFeltSegment`.
- Flux de groupement pixel : vérifier que le premier appel à
  `mapDetectionsToPoints` avec la transformation identité produit bien des
  `RecognizedPoint` en coordonnées PIXEL (égales aux centroïdes bruts des
  marqueurs), et que `pairIntoSegmentsAndPoints` les regroupe correctement
  par tige à partir de ce résultat.
- Non-régression : le calage du plan intérieur
  (`PlanCalibrationTool`/`MissionWorkspace.tsx`) reste inchangé et ses
  tests existants continuent de passer sans modification.

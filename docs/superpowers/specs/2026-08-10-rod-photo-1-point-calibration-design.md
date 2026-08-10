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
- Dériver la rotation depuis la famille d'angles connue du réseau de
  chaque tige détectée (`networkBearings.ts`), désambiguïsée par la
  présence garantie d'au moins 2 réseaux différents dans la photo.
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
3. Si au moins une tige complète (2 marqueurs de la même tige, même
   `rodNumber`/`networkName`) est détectée : l'app demande "Cliquez sur le
   plan à l'endroit où vous vous teniez pour cette photo" — un seul clic
   sur la carte.
4. Le clic déclenche le calcul de la transformation complète (voir
   ci-dessous), puis la création directe des `FeltPoint`/`FeltSegment`
   correspondants — même comportement final qu'aujourd'hui une fois le
   calage obtenu.
5. Si aucune tige complète n'est détectée : message d'erreur clair
   ("Aucune tige complète détectée — impossible de calculer l'échelle."),
   aucun calcul, aucun repli vers le calage manuel. Laurent peut réessayer
   avec une autre photo ou annuler.

## Dérivation de la transformation

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

**Échelle `s`** — pour chaque tige complète détectée : distance en pixels
entre les centroïdes de ses 2 marqueurs, divisée par 1m réel, donnant une
estimation `s` en (unités réelles)/pixel. `s` final = moyenne arithmétique
de ces estimations sur toutes les tiges complètes détectées dans la photo
(plus robuste au bruit de détection qu'une seule tige — confirmé avec
Laurent).

**Rotation `θ`** — pour chaque tige complète détectée : angle mesuré (en
pixels) de la droite reliant ses 2 marqueurs, puis rotation nécessaire
pour aligner cet angle sur la valeur la plus proche dans la famille
d'angles connue du réseau de cette tige (`allowedBearingsForNetwork`,
`networkBearings.ts` — ex. Hartmann : 0°/90°, Curry : 45°/135°). `θ` final
= moyenne de ces rotations sur toutes les tiges détectées (même principe
que pour l'échelle).

⚠️ **Point technique à vérifier empiriquement en implémentation, pas
figé ici** : le sens exact de `θ` (le signe de la conversion angle-pixel
→ rotation réelle) dépend de la convention d'axes de l'espace image
(Y vers le bas) par rapport à l'espace local (Y vers le nord). Le calage
manuel actuel s'en accommode implicitement via l'ajustement par moindres
carrés ; le nouveau calcul direct doit être validé contre une vraie photo
de test avec une orientation de tige connue avant d'être considéré
correct — ne pas supposer un signe sans test réel (même leçon que le bug
d'ordre des axes BBOX du 23/07/2026, jamais détecté par un test avec
fetch mocké).

**Translation `(e, f)`** — le point unique cliqué sur le plan par Laurent
est converti en coordonnées locales (`latLngToLocal`), donnant
`realCenter`. Le centre de la photo en pixels `(cx, cy)` est calculé
automatiquement (`naturalWidth / 2`, `naturalHeight / 2`). `e` et `f` sont
alors résolus pour que ce point du centre corresponde exactement à
`realCenter` :

```
e = realCenter.x − (a·cx + b·cy)
f = realCenter.y − (c·cx + d·cy)
```

## Gestion des erreurs

- **Aucune tige complète détectée** : erreur bloquante affichée, pas de
  calcul de transformation, pas de calage possible pour cette photo tant
  qu'une tige n'y est pas visible. Pas de repli vers l'ancien calage
  manuel pour ce flux (décision explicite de Laurent — périmètre volontai-
  rement strict).
- **Détection ArUco elle-même échoue** (erreur technique, pas "0 résultat")
  : géré comme aujourd'hui par le mode d'échec déjà existant de
  `detectMarkers`/`RodDetectionPanel` — inchangé par ce chantier.

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

## Tests

- Dérivation d'échelle : une tige connue à une distance pixel donnée doit
  produire l'échelle attendue ; plusieurs tiges doivent donner la moyenne
  correcte.
- Dérivation de rotation : un angle pixel connu doit s'aligner sur le
  membre de famille le plus proche (ex. un angle mesuré à 88° pour
  Hartmann doit converger vers 90°, pas 0°) ; plusieurs tiges de réseaux
  différents doivent donner la moyenne correcte de leurs rotations
  individuelles.
- Translation : le centre de la photo doit se mapper exactement sur le
  point réel cliqué, quels que soient l'échelle et la rotation calculées.
- Bout en bout : un jeu de marqueurs de test avec position/rotation/
  échelle connues doit, après calcul de la transformation puis application
  via `applyAffineTransform`, retrouver les positions réelles attendues à
  une tolérance flottante près.
- Erreur : aucune tige complète détectée → l'erreur attendue est levée,
  aucun appel à `createFeltPoint`/`createFeltSegment`.
- Non-régression : le calage du plan intérieur
  (`PlanCalibrationTool`/`MissionWorkspace.tsx`) reste inchangé et ses
  tests existants continuent de passer sans modification.

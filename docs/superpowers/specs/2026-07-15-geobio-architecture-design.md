# GEOBIO Software — Architecture globale & Spec du premier sous-projet

**Date :** 2026-07-15
**Statut :** Design validé par Laurent — prêt pour plan d'implémentation
**Auteur :** Laurent Perret (géobiologue) + Claude (architecture)

## 1. Contexte

Laurent est géobiologue indépendant. Il réalise des diagnostics pour particuliers et
agences immobilières :

1. Relevés terrain (extérieur + intérieur) : sources d'eau, failles, réseaux telluriques
   (Hartmann, Curry, Peyré, or, argent)
2. Relevé des ondes nocives (électrique, électromagnétique, wifi)
3. Recommandations pratiques (mise à la terre, câblage...)
4. Optimisation d'agencement intérieur (+ option Feng Shui)

Livrable actuel : rapport avec plans annotés + recommandations + plan d'action, produit
manuellement. Objectif du projet : automatiser au maximum la production du rapport pour
que Laurent se consacre au relevé lui-même plutôt qu'à la mise en forme.

**Usage :** personnel d'abord (outil interne à sa pratique), avec une architecture qui
n'interdit pas d'ouvrir à d'autres géobiologues plus tard (sans sur-ingénierie
immédiate — pas de multi-comptes/facturation en Phase 1).

## 2. Découpage en sous-systèmes

Le projet est trop large pour une spec unique. Il se découpe en sous-systèmes
indépendants, chacun avec son propre cycle spec → plan → implémentation :

| # | Sous-système | Rôle |
|---|---|---|
| A | App terrain | Saisie des relevés sur tablette/smartphone, extérieur + intérieur |
| **B** | **Moteur réseaux telluriques** | **Génère la grille théorique par type de réseau, permet l'ajustement manuel point par point — cœur métier du projet. Premier sous-projet spécifié ci-dessous.** |
| C | Digitalisation de plans | Extérieur (import IGN) + intérieur (plan papier → numérique + mobilier) |
| D | Mesures ondes nocives | Saisie/import électrique, électromagnétique, wifi |
| E | Moteur de recommandations | Règles reliant relevés → actions concrètes |
| F | Feng Shui | Fusionné dans B — le Bagua est un gabarit de grille de plus, pas un module séparé |
| G | Générateur de rapport | Assemble plans + reco + plan d'action en livrable exportable |
| H | Balises terrain | Voir Phase 1bis ci-dessous — approche optique retenue, pas de matériel radio |

## 3. Principes d'architecture transverses

### 3.1 Référentiel de coordonnées (fondation de tout le système)

- **Extérieur :** géoréférencement natif via les fonds de carte IGN Géoplateforme
  (WMTS pour l'imagerie/plan/cadastre, WFS pour les couches vectorielles : hydrographie,
  géologie). Chaque point placé sur ces fonds hérite directement de la précision
  cartographique IGN, sans calibration.
- **Intérieur :** le plan (photo d'un plan papier fourni par le propriétaire) est
  géoréférencé par corrélation — 2 à 4 points identifiables à la fois sur le plan
  intérieur et sur la vue aérienne IGN (coins de bâtiment généralement visibles sur
  l'orthophoto). Le logiciel calcule automatiquement la transformation
  (échelle + rotation + position) pour caler le plan intérieur dans le même
  référentiel que l'extérieur. Si moins de 2 points de contrôle sont posés, ou si les
  points posés sont trop proches les uns des autres (< 2 m à l'échelle du plan), le
  calage est refusé avec un message explicite plutôt que silencieusement approximatif.
- Tous les points sont stockés en **coordonnées métriques locales** relatives au
  référentiel de la mission, convertibles vers GPS réel à tout moment — compatible
  nativement avec une future source de positionnement plus précise (RTK, UWB) sans
  changement de modèle.
- **Référence d'angle : nord vrai**, pas nord magnétique. Les fonds IGN et le calage
  par corrélation (ci-dessus) sont nativement en nord vrai, et le nord magnétique
  dérive dans le temps (déclinaison variable) — un mauvais choix pour un référentiel
  qui doit rester stable d'une mission à l'autre. Les `GridTemplate` (§3.2) expriment
  donc leur angle en nord vrai. Si le ressenti terrain de Laurent est habituellement
  calé sur le nord magnétique, un simple champ de déclinaison (par mission, valeur
  connue pour la région/date) permet de convertir à l'affichage sans changer le
  stockage.

### 3.2 Réseaux telluriques = grilles paramétrables, jamais codées en dur

Chaque type de réseau (Hartmann, Curry, Peyré, or, argent, **Bagua**) est un **gabarit
de grille configurable** (espacement X/Y, angle vs nord, décalage d'origine) — pas une
théorie codée en dur. Laurent peut ajuster ou créer un gabarit sans dépendre d'un
redéploiement logiciel.

## 4. Stack technique

| Brique | Choix | Justification |
|---|---|---|
| Frontend | PWA (une seule base de code) | Installable tablette + smartphone sans store, itération rapide en solo |
| Cartographie | MapLibre GL JS ou Leaflet + tuiles IGN Géoplateforme | Fonds officiels français, gratuits |
| Calage plan intérieur | **Leaflet.DistortableImage** (open source, publiclab) | Résout exactement le rubber-sheeting sur points de contrôle — brique existante, éprouvée, à vérifier la licence exacte avant intégration |
| Backend | Supabase (Postgres + **PostGIS**) hébergé en région UE | RGPD (données de biens/particuliers), PostGIS natif pour géométries/requêtes spatiales, Auth prête pour une éventuelle ouverture multi-praticiens |
| Rapport | Template HTML/CSS → export PDF client-side (MVP) | Pas de serveur de rendu à maintenir au départ |
| Hébergement app | Vercel / Netlify | Déploiement simple, gratuit à ce stade |

**Connectivité terrain :** confirmé par Laurent — connexion généralement disponible sur
ses missions (pas de contrainte hors-ligne systématique type cave/zone rurale isolée).
En conséquence, **le Plan 1 ne construit pas de synchronisation offline-first** (pas de
queue locale, pas de résolution de conflits) : les écritures se font directement contre
Supabase. Seule résilience prévue : si une requête échoue (coupure ponctuelle), l'action
reste visible localement dans l'UI avec un indicateur "non synchronisé" et une reprise
automatique dès que la connexion revient — pas une architecture offline complète, un
filet de sécurité minimal pour un aléa ponctuel de terrain.

### Briques open source identifiées (Feng Shui / réseaux)

| Brique | Usage prévu | Lien |
|---|---|---|
| Leaflet.DistortableImage | Calage plan intérieur (points de contrôle) | github.com/publiclab/Leaflet.DistortableImage |
| leaflet-indoor | Gestion multi-niveaux si maisons à étages | github.com/cbaines/leaflet-indoor |
| fengshui-master (script luopan.py) | Référence de calcul angle boussole → secteur bagua | github.com/JackieL233/fengshui-master |
| bazi-calculator-by-alvamind (npm) | Réserve si évolution future vers Xuan Kong Flying Stars avancé (hors périmètre actuel) | npm |

**Non réutilisable :** fscalc.com, apps Luopan (App Store), FST Feng Shui Tools, Four
Pillars & Feng Shui 4.2 — logiciels commerciaux fermés, sans code public ni API
ouverte. Inspiration UX uniquement (déjà intégrée aux principes ci-dessus), jamais de
copie de code ni de scraping.

## 5. Roadmap des phases

| Phase | Contenu |
|---|---|
| **1 — MVP** | Fondations (mission, référentiel de coordonnées), plan extérieur (IGN) + plan intérieur calé (minimal, sans mobilier — voir §6.0), moteur de grilles (tous gabarits dont Bagua), lignes déformables, **saisie tap terrain manuelle**. Pas d'export/rapport en Plan 1 : la consultation à l'écran suffit pour valider le cœur métier, l'export exploitable reste le rôle du Sous-système G (Phase 3) |
| **1bis — Capture optique des baguettes** | Mode de saisie alternatif : photo aérienne (perche télescopique ou drone grand public) des baguettes colorées posées au sol → détection automatique par vision par ordinateur (segmentation couleur) → pré-remplissage des `GridLine`/`FreeformNetwork`, ajustables ensuite à la main comme en saisie manuelle. Peu coûteux (pas de matériel radio), sert directement le cœur métier — remonté juste après le MVP plutôt que différé |
| **2** | Mesures ondes nocives sur le plan, placement mobilier (bibliothèque d'objets simples) |
| **3** | Moteur de recommandations (règles configurables), rapport professionnel soigné |
| **4 — Positionnement radio (optionnel, si l'optique ne suffit pas)** | RTK GPS extérieur + UWB ou triangulation laser intérieur — repli seulement si la précision optique s'avère insuffisante en usage réel |
| **5 (si devient produit)** | Multi-comptes, isolation données clients, facturation |

**Verdict de faisabilité :** Phases 1 à 3 reposent sur des briques matures et éprouvées
(Leaflet, PostGIS, Leaflet.DistortableImage, OpenCV pour la détection couleur) —
ingénierie web/SIG standard, aucun blocage identifié. Le risque technique du projet est
concentré et isolé en Phase 4, qui n'est plus un prérequis.

## 6. Spec détaillée — Sous-système B : Moteur réseaux telluriques (premier sous-projet)

### 6.0 Périmètre exact du premier plan d'implémentation

Ce sous-projet couvre deux plans d'implémentation séquentiels, pas un seul :

- **Plan 1 (MVP réseaux) :** §6.1, §6.2, §6.4 — modèle de données, calage minimal de
  plan (voir ci-dessous), saisie manuelle tap, ajustement/déformation des lignes,
  gabarit Bagua. C'est ce périmètre qui doit être découpé en tâches d'implémentation
  en premier.
- **Plan 2 (Phase 1bis, capture optique) :** §6.3 — pipeline de vision par ordinateur,
  domaine technique différent (traitement d'image vs CRUD/UI), à spécifier et
  implémenter une fois le Plan 1 en usage réel. Ne pas mélanger les deux dans un même
  plan d'implémentation.

**Frontière avec le Sous-système C (Digitalisation de plans) :** le Plan 1 inclut un
objet `Plan` minimal — import du fond IGN (extérieur) et calage par corrélation d'une
image de plan intérieur (points de contrôle, §3.1) — strictement suffisant pour servir
de support aux grilles. Le Plan 1 ne comprend **pas** : la bibliothèque de mobilier, la
retouche/vectorisation avancée du plan intérieur, ni la gestion multi-niveaux
(étages) — ces sujets restent entièrement dans le périmètre du futur Sous-système C,
qui aura sa propre spec. `leaflet-indoor` (§4) n'est donc pas requis pour ce
sous-projet.

### 6.1 Modèle de données

| Objet | Champs clés | Relations |
|---|---|---|
| `Mission` | id, adresse, date, nord vrai (référence), déclinaison magnétique (optionnel, pour affichage) | 1 Mission → N `Plan` |
| `Plan` | id, type (`exterieur` \| `interieur`), source (référence tuile IGN, ou image + points de contrôle de calage), transformation de calage (matrice affine, figée une fois calculée) | Appartient à 1 `Mission` |
| `GridTemplate` | id, nom (Hartmann/Curry/Peyré/Or/Argent/Bagua...), espacement_x (m), espacement_y (m), angle_nord_vrai (degrés), décalage_origine (x,y) | Réutilisable entre missions, pas lié à une `Mission` |
| `GridInstance` | id, référence à son `GridTemplate` **en copie figée** (snapshot des paramètres au moment de la génération, pas une simple clé étrangère) — modifier le `GridTemplate` plus tard n'affecte jamais rétroactivement les instances déjà générées ; point d'origine réel (x,y) posé par Laurent sur le terrain | Appartient à 1 `Plan` |
| `GridLine` | id, liste ordonnée de points de contrôle `{x, y}` (coordonnées métriques 2D — pas d'altitude en Plan 1, hors périmètre), tracé théorique d'origine conservé séparément du tracé déformé pour permettre un "reset à la théorie" | Appartient à 1 `GridInstance` |
| `FreeformNetwork` | id, type (source d'eau, faille...), liste ordonnée de points `{x, y}` | Appartient à 1 `Plan`, indépendant de tout `GridTemplate` |

### 6.2 Interaction terrain — saisie manuelle

**Créer un point/ligne :** un geste par point ressenti — tap sur le plan à l'endroit
repéré visuellement (éléments visibles : murs, limites de terrain, mobilier),
sélection rapide du type de réseau, ajout à la ligne en cours. Pas de formulaire long
en plein relevé.

**Ajuster un point existant (le geste central du sous-projet) :**
- Tap-and-drag sur un point de contrôle déjà posé (théorique ou déjà ajusté) pour le
  déplacer — pas de mode "édition" séparé à activer, le glissé est toujours actif sur
  un point existant.
- Pas de snapping automatique à la grille théorique : le principe même du module est
  que le ressenti prime sur la théorie, un magnétisme vers la grille irait à
  l'encontre du besoin.
- Suppression d'un point : appui long sur le point → confirmation → retrait (les
  points voisins de la même `GridLine` se relient directement).
- **Undo** : pile d'annulation locale à la session de relevé (dernier geste
  déplacer/supprimer/ajouter annulable), pas d'historique long terme en Plan 1.
- **Reset à la théorie** : action explicite par `GridLine` qui restaure son tracé
  théorique d'origine (conservé dans `GridLine`, voir §6.1) et efface les ajustements
  manuels de cette ligne — utile si Laurent veut repartir de zéro sur une ligne mal
  ajustée sans tout re-générer.

**Assistant d'orthogonalité (précision opérationnelle) :** chaque `GridTemplate` définit
une famille de lignes à un angle théorique donné par rapport au nord vrai — Hartmann :
lignes nord/sud et est/ouest (0°/90° depuis `angle_nord_vrai`) ; Curry : lignes à 45°/135°
(décalées de 45° par rapport à Hartmann). Après chaque ajustement d'une `GridLine`
(glissé manuel, §6.2, ou segment pré-rempli par capture optique en Plan 2, §6.3),
l'interface calcule l'écart angulaire entre le tracé posé et la direction théorique de
sa famille, et affiche une **suggestion de micro-ajustement** : un aperçu superposé du
tracé "redressé à l'orthogonal théorique" à côté du tracé actuel. Laurent accepte (la
ligne se redresse sur ce tracé) ou ignore (le tracé ressenti est conservé tel quel).
Ceci ne contredit pas le "pas de snapping automatique" ci-dessus : c'est une suggestion
visible et explicite déclenchée par une action de Laurent, jamais un magnétisme
silencieux qui déplacerait un point sans qu'il l'ait demandé. Aucune donnée
supplémentaire requise : l'angle théorique de référence est déjà stocké dans le
`GridTemplate` (§6.1).

### 6.3 Interaction terrain — capture optique (Phase 1bis)

- Laurent pose ses baguettes de bois (~1 m, posées à plat, non plantées) au sol selon
  son ressenti, une couleur par réseau (rouge = Hartmann, jaune = Curry, vert = Peyré,
  bleu = eaux souterraines, formes non linéaires).
- Prise de vue en hauteur (perche télescopique + téléphone, ou drone grand public) au
  nadir de la zone couverte.
- Détection automatique par segmentation couleur (HSV, OpenCV) : position **et**
  orientation de chaque baguette (une baguette posée à plat donne un segment orienté,
  pas juste un point).
- Projection pixel → coordonnées réelles via les mêmes points de contrôle que le
  calage de plan intérieur (§3.1).
- Pré-remplissage des `GridLine` / `FreeformNetwork` à partir des segments détectés,
  ajustables ensuite manuellement comme en saisie tap.
- **Point ouvert matériel** (à trancher avant implémentation) : peinture dans la masse
  recommandée plutôt que ruban coloré, teintes saturées "sécurité" plutôt que
  naturelles — vigilance particulière sur le **vert (Peyré)**, à décliner en vert
  fluo/sécurité pour trancher avec l'herbe naturelle en toute luminosité. Non figé,
  à valider avec Laurent avant de lancer le pipeline de détection.

### 6.4 Bagua (Feng Shui simple)

Gabarit `GridTemplate` supplémentaire (8 secteurs), généré sur un `Plan` calé au nord
comme n'importe quel autre réseau — aucune logique spécifique à développer au-delà du
moteur de grilles générique. Le Xuan Kong Flying Stars avancé est explicitement hors
périmètre (voir §7).

### 6.5 Pourquoi ce découpage tient pour la Phase 4 (si nécessaire)

`GridLine` et `FreeformNetwork` stockent déjà des points en coordonnées réelles — une
future source RTK/UWB alimenterait directement ces mêmes objets au lieu d'un tap
manuel ou d'une détection optique. Aucun changement de modèle nécessaire.

## 7. Hors périmètre (YAGNI explicite)

- Xuan Kong Flying Stars avancé (BaZi, tables d'étoiles par période) — s'appuyer sur
  un outil existant (fscalc.com) plutôt que construire, si jamais requis un jour
- Positionnement radio (RTK/UWB) — Phase 4, seulement si l'optique s'avère
  insuffisante en usage réel
- Multi-comptes, facturation, isolation données clients — Phase 5, seulement si le
  projet devient un produit
- Moteur de recommandations et rapport soigné — Phase 3, pas nécessaire pour valider
  le cœur métier (Sous-système B)

## 8. Points ouverts à trancher avant/pendant l'implémentation

1. Matériau exact des baguettes (peinture vs ruban, teintes précises) — impacte
   directement la fiabilité de la détection optique (§6.3). Ne bloque pas le Plan 1
   (saisie manuelle), à trancher avant de spécifier le Plan 2 (§6.3).
2. Licence exacte de Leaflet.DistortableImage à vérifier avant intégration — bloquant
   pour le Plan 1 si la licence s'avère incompatible avec un usage commercial futur
   (Phase 5).
3. Taille type des parcelles extérieures traitées — dimensionne le besoin de
   stitching multi-photos pour la capture optique (perche vs drone). Ne concerne que
   le Plan 2 (§6.3).

*(L'angle de référence nord vrai vs magnétique, initialement listé ici, est tranché
au §3.1.)*

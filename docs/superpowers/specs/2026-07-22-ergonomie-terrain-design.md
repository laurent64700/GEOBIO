# Ergonomie terrain — panneau latéral, point ressenti, boussole, géocodage, reprise de mission — Design

**Date :** 2026-07-22
**Statut :** Brainstorm mené avec Laurent (compagnon visuel utilisé pour le panneau
latéral et la boussole), toutes les sections validées. À faire relire par
spec-document-reviewer avant passage au plan d'implémentation.
**Contrainte :** Laurent veut tester le logiciel en conditions réelles sur le terrain la
semaine du 27/07/2026 — les 5 paquets ci-dessous doivent être livrables un par un et
testables indépendamment, dans l'ordre où ils sont numérotés.

## 1. Contexte et objectif

Testé en conditions réelles fin juillet, GEOBIO a révélé des trous fonctionnels et une
interface jugée inutilisable en l'état par Laurent : panneaux flottants empilés en boîtes
blanches dans les 4 coins de la carte, sans organisation ni hiérarchie, et plusieurs
briques manquantes qui bloquent un relevé réel (voir §3-§6).

**Principe directeur, posé fermement par Laurent (repris de sessions précédentes) : pas
de travail visuel/esthétique.** "Je ne veux pas de design, je veux du fonctionnel pur :
comme Paint." Icônes/boutons clairs, groupés par fonction, zéro décoratif. Ce document ne
propose aucune palette de couleurs, aucune typographie, aucune animation — uniquement de
la structure et du comportement.

**Découpage du plan d'implémentation :** un seul plan, 5 tâches/chunks ordonnés (même
pattern que `docs/superpowers/plans/2026-07-21-freeform-followups-plan.md`, qui a bien
fonctionné le 22/07/2026) — pas 5 documents de plan séparés. Chaque paquet reste commité
et testé indépendamment (suite verte + `tsc` clean après chacun), livrable/testable par
Laurent dès qu'il est mergé, sans attendre les 4 autres.

**Périmètre de ce document, confirmé avec Laurent :** cinq paquets indépendants mais
livrés dans cet ordre (le paquet 2 dépend de la structure posée par le paquet 1) :

1. Panneau latéral (remplace les 4 `OverlayPanel` flottants actuels)
2. Outil "placer un point ressenti" (comble le trou fonctionnel le plus critique)
3. Boussole permanente
4. Géocodage de l'adresse (centrage carte)
5. Liste des missions + reprise d'une mission existante

**Hors périmètre, explicitement écarté de ce chantier** (confirmé avec Laurent) :
génération de rapport/preview terrain (chantier de conception à part, voir mémoire
projet), mode hors-ligne, système Or/Argent/Cuivre, détection automatique de croisements
pathogènes (spec/plan séparés, statut d'exécution à vérifier indépendamment).

## 2. État du code au 22/07/2026 (vérifié, pas supposé)

- `src/components/SiteMapView.tsx` (772 lignes après l'extraction de `usePlacementMode`
  faite ce jour) rend 4 `OverlayPanel` (top-right, top-left, bottom-left, bottom-right)
  contenant au total 9 groupes de contrôles distincts : `LayerPanel` + `GridCreationPanel`
  (top-right, 2), ligne guide + `PhenomenonPicker` + tracé eau/faille + statut bâtiment
  (top-left, 4 cartes empilées), mode édition de grille (bottom-left, 1), revue
  d'orthogonalité + légende Bagua (bottom-right, 2).
- `src/hooks/usePlacementMode.ts` gère déjà `PlacementMode` (union discriminée
  grid-origin/guide-line/phenomenon/freeform) — ce document y ajoute une 5ᵉ variante.
- `FeltPoint` (`src/domain/types.ts`) a `networkName: string` (texte libre, pas un enum
  fermé — commentaire du code : "Laurent may search for a network before its
  GridTemplate row exists"). `createFeltPoint` (`src/data/feltPointsRepo.ts`) existe déjà
  et fonctionne ; **il est même déjà appelé**, mais uniquement par
  `RodDetectionPanel.tsx` (flux de détection ArUco des tiges, dans
  `MissionPhotosGallery`) — **aucun outil de placement manuel n'existe** : pas
  d'interaction clic-bouton puis clic-carte comme pour les phénomènes. C'est ce trou-là
  (le placement manuel, pas la fonction de données) que le paquet 2 comble. Les deux
  voies de création resteront indépendantes après ce paquet, sans conflit identifié.
  `FeltPointsLayer` affiche les points en lecture seule quelle que soit leur origine.
- `src/components/PhenomenonPicker.tsx` est le pattern de référence à reproduire pour le
  point ressenti : liste de boutons, clic = arme `placementMode`, reclic sur le même =
  désarme (`aria-pressed`), clic carte = crée via le hook.
- `src/pages/MissionWorkspace.tsx` : `DEFAULT_CENTER` = centre approximatif de la France
  métropolitaine, utilisé sans conditions dès la phase `setting-origin` — le commentaire
  du code confirme que le géocodage n'a jamais été implémenté.
- Aucune boussole permanente n'existe : le code contient plusieurs occurrences de
  "compass" (`COMPASS_DIRECTIONS`/`COMPASS_ORDER`, le type `CompassDirection`, le champ
  `compassDirection` — déclaré dans `bagua.ts` sur `BaguaSector`, lu dans
  `BaguaLayer.tsx`), mais aucune n'est un indicateur visuel sur la carte — toutes
  servent uniquement au tri/légende Bagua ou au modèle de correspondances Bagua
  (`baguaCorrespondences.ts` importe seulement le type `CompassDirection` comme clé,
  sans champ `compassDirection` propre).
- `MissionWorkspace`'s `WorkspacePhase` est un état 100% local (`useState`), jamais
  persisté ni reconstruit depuis la base — fermer l'onglet ou recharger perd la mission
  en cours. `listMissions()` (`src/data/missionsRepo.ts`) et
  `listPlansForMission()` (`src/data/plansRepo.ts`) existent déjà mais ne sont appelés
  nulle part dans le code applicatif (uniquement dans leurs propres tests).
- Pas de dépendance de routing (`react-router` absent de `package.json`) — l'app entière
  tourne sur une machine à états locale dans `App.tsx`/`MissionWorkspace.tsx`.

## 3. Paquet 1 — Panneau latéral

**Remplace les 4 `OverlayPanel` actuels par un seul panneau à gauche, pleine hauteur,
scrollable**, organisé en deux zones :

- **Bande épinglée en haut, toujours visible** (ne fait pas partie de l'accordéon,
  jamais masquée même si tout le reste est replié) : les boutons du paquet 2
  (point ressenti). C'est l'action la plus fréquente du relevé terrain, elle ne doit
  jamais nécessiter un clic supplémentaire pour apparaître.
- **Accordéon en dessous**, sections repliables, une seule section ouverte à la fois
  (au choix de Laurent) ou plusieurs (à trancher en plan si ambigu — comportement
  standard d'accordéon HTML `<details>` : indépendant par défaut) :
  - **Grille / Réseaux** — contenu actuel de `GridCreationPanel` + le "Mode édition"
    (aujourd'hui bottom-left : case à cocher + Annuler/Réinitialiser)
  - **Calques** — contenu actuel de `LayerPanel`, inchangé
  - **Phénomènes** — contenu actuel de `PhenomenonPicker`, inchangé
  - **Tracés eau/faille** — les 2 boutons "Tracer l'eau"/"Tracer une faille" +
    `FreeformMetadataForm` quand un tracé est en attente
  - **Ligne guide** — les boutons N/S, E/O, 45°, 135°, angle personnalisé, Placer ici,
    Effacer (aujourd'hui top-left)
  - **Bâtiment** — la carte de statut bâtiment (Changer de bâtiment / recherche
    infructueuse / erreur dismissible), affichée seulement si pertinente comme
    aujourd'hui
  - **Bagua** — la légende Bagua, affichée seulement si le calque est actif (comme
    aujourd'hui)
- **Reste sur la carte, ne rejoint pas le panneau** (contenu contextuel/transitoire,
  pas un outil qu'on va chercher) : la carte de revue d'orthogonalité
  (`reviewTarget`/`reviewSuggestion`) — elle apparaît juste après un glissement de
  ligne, en overlay flottant minimal près de la ligne concernée ou dans un coin libre de
  la carte (à trancher en plan selon ce qui reste le plus simple techniquement).

**Aucune logique métier ne change dans ce paquet** — uniquement le composant conteneur.
Les composants enfants (`LayerPanel`, `GridCreationPanel`, `PhenomenonPicker`, etc.)
gardent leurs props et comportements actuels.

## 4. Paquet 2 — Outil "placer un point ressenti"

**Comble le trou fonctionnel le plus critique** (jamais câblé malgré la donnée et le
calque déjà prêts) : la toute première étape du protocole terrain de Laurent.

- Nouveau composant `FeltPointPicker`, même pattern que `PhenomenonPicker` : boutons
  fixes **Hartmann / Curry / Palm / Peyré / Wissmann**, plus un bouton **Autre** qui
  révèle un champ texte libre + validation (couvre le cas `networkName` non standard que
  le type autorise déjà).
- Clic sur un réseau arme le mode de placement, clic sur la carte crée le point via
  `createFeltPoint({ planId, networkName, x, y })` (déjà existant, aucun changement côté
  données). Reclic sur le même bouton désarme (même convention que
  `PhenomenonPicker`/tracé eau-faille : `aria-pressed`, auto-annulation).
- Nouvelle variante de `PlacementMode` dans `usePlacementMode.ts` :
  `{ kind: 'felt-point'; networkName: string }`, suivant exactement le patron de la
  variante `'phenomenon'` existante — y compris la gestion d'erreur : un échec de
  `createFeltPoint` route vers le callback `onError` du hook (même chemin que
  `handlePlacePhenomenon`), pas un état d'erreur dédié. `handleMapClick` gagne un cas de
  plus, `onFeltPointCreated` callback pour que `SiteMapView` ajoute le point créé à son
  état `feltPoints` local, `FeltPointsLayer` n'a besoin d'aucun changement.
- **Vit dans la bande épinglée du paquet 1**, pas dans l'accordéon.

## 5. Paquet 3 — Boussole permanente

Un indicateur fixe, non interactif, confirmant visuellement que le haut de la carte est
le Nord vrai (Leaflet ne fait jamais tourner la carte — ce n'est donc jamais faux, juste
jamais rappelé à l'écran aujourd'hui) — utile pendant le ressenti aveugle où Laurent ne
regarde pas forcément la grille théorique.

- **Position : coin haut-droit de la carte**, superposé (petit rond blanc, flèche + "N").
  Choisi plutôt qu'une bande verticale ou un indicateur bas-gauche plus gros : léger, ne
  prend pas de place dans le panneau latéral, le coin haut-droit de la carte est
  aujourd'hui libre (LayerPanel qui l'occupait migre dans le panneau latéral au paquet 1).
- Toujours visible, à tout zoom/pan, indépendamment de tout calque activé ou de l'état de
  `placementMode` — c'est un élément de chrome de la carte, pas un outil.
- Composant simple, pas de dépendance nouvelle (pas de librairie de boussole/rose des
  vents) — un petit SVG ou une combinaison de caractères/CSS suffit, cohérent avec le
  principe "fonctionnel pur, pas de polish".

## 6. Paquet 4 — Géocodage de l'adresse

- **API Adresse française (BAN)**, `api-adresse.data.gouv.fr/search/` — gratuite, sans
  clé, même famille d'appel HTTP que le WFS IGN déjà utilisé pour le cadastre/bâtiments
  (`cadastreService.ts`/`buildingFootprintService.ts`).
- Déclenché à l'entrée dans la phase `setting-origin` de `MissionWorkspace` : l'adresse
  de la mission (`mission.address`, saisie dans `MissionForm`) est envoyée à la BAN ; si
  une réponse exploitable revient, ses coordonnées remplacent `DEFAULT_CENTER` comme
  centre initial de la carte affichée à cette étape.
- **Centre la carte uniquement — ne pose jamais l'origine automatiquement.** L'origine
  reste un clic délibéré de Laurent sur le point exact du terrain (l'adresse géocodée
  est approximative, pas le point de référence géobiologique).
- Échec de géocodage (adresse introuvable, API indisponible) : comportement actuel
  inchangé, `DEFAULT_CENTER`, aucun blocage, aucune erreur qui casse le flux — même
  principe que `buildingError`/`freeformSaveError` (échec optionnel, jamais bloquant).

## 7. Paquet 5 — Liste des missions + reprise

- Nouvel écran d'accueil, avant la création de mission : liste des missions existantes
  (`listMissions()`, déjà fonctionnel côté données, jamais branché à une UI), triée par
  date (l'API trie déjà par `mission_date` décroissant), affichant adresse + date par
  ligne. Bouton "Nouvelle mission" à côté, qui va vers le flux `creating-mission` actuel
  inchangé.
- Cliquer une mission existante récupère d'abord ses plans via
  `listPlansForMission(missionId)` (filtré sur `kind === 'exterieur'` — nécessaire dès
  qu'un plan intérieur existe aussi, puisque la requête renvoie les deux), puis recalcule
  la bonne `WorkspacePhase` à partir de ce qui est déjà en base (pas de champ "phase"
  stocké séparément — dérivé de l'état réel) :
  - **Aucun plan extérieur trouvé** (mission créée mais `createPlan` a échoué juste
    après — les deux appels de `handleMissionCreated` ne sont pas transactionnels,
    connexion terrain potentiellement instable) → cas à ne pas laisser tomber
    silencieusement : retenter la création du plan extérieur directement (mission déjà
    là, il ne manque que le plan, aucune saisie perdue) plutôt qu'afficher une erreur
    bloquante ou masquer la mission de la liste.
  - Plan extérieur trouvé mais bilan global pas encore rempli (`bovisRate === null` —
    voir §9, remplissage tout-ou-rien) → phase `global-assessment`, avec le plan
    extérieur existant plutôt que recréé
  - Bilan rempli mais `originLat`/`originLng` encore `null` → phase `setting-origin`
  - Origine posée → phase `ready-no-interior` directement ; `SiteMapView` recharge déjà
    tout son état (grilles, points ressentis, phénomènes, tracés, bâtiment) depuis la
    base à l'ouverture, donc rien de plus à faire ici pour que le relevé en cours
    réapparaisse tel quel
- **Aucune nouvelle dépendance** (pas de `react-router`) : un état d'écran de plus tout
  en haut de l'app, même style de machine à états que celle déjà utilisée dans
  `MissionWorkspace`. **Vit dans `src/App.tsx`** (qui aujourd'hui se contente de rendre
  `<MissionWorkspace />` directement, sans aucun état), pas dans `MissionWorkspace.tsx`
  lui-même — `MissionWorkspace` garde sa propre machine à états interne inchangée, mais
  reçoit en plus une mission existante (optionnelle) en prop pour démarrer directement
  à la bonne phase au lieu de toujours partir de `creating-mission`. Pas d'URL par
  mission — Laurent a explicitement choisi la liste plutôt qu'un lien direct.

## 8. Ce qui ne change pas

Tous les composants/handlers déplacés dans un paquet gardent leur comportement exact
(paquets 1 et une partie du 3) ou s'appuient sur des fonctions de données déjà testées et
inchangées (`createFeltPoint`, `listMissions`, `listPlansForMission`) — ce document ne
remet en cause aucune décision déjà prise sur les réseaux telluriques, le calage de
grille, ou le modèle Bagua.

## 9. Hypothèses à confirmer en plan (pas tranchées ici, faible impact si erronées)

- Accordéon : une seule section ouverte à la fois, ou plusieurs indépendamment ? (par
  défaut technique le plus simple : indépendant, comme `<details>` HTML natif)
- Carte de revue d'orthogonalité : reste un petit overlay flottant sur la carte — exact
  positionnement à trancher en implémentation, pas un enjeu de design.
- "Bilan global rempli" pour la reprise de mission (paquet 5) : tous les champs non-null,
  ou au moins un renseigné ? Recommandation : exiger que la sauvegarde ait eu lieu au
  moins une fois (l'action `setGlobalAssessment` s'appelle en un seul appel avec tous les
  champs dans `GlobalAssessmentForm` actuel, donc soit tout est rempli, soit rien ne
  l'est — pas de cas intermédiaire réel à gérer).

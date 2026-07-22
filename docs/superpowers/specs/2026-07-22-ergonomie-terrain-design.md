# Ergonomie terrain — panneau latéral, point ressenti, boussole, ligne guide, bilan global, géocodage, reprise de mission, packaging — Design

**Date :** 2026-07-22
**Statut :** Brainstorm mené avec Laurent (compagnon visuel utilisé pour le panneau
latéral et la boussole), relecture de Laurent sur la v1 ayant fait grandir le périmètre
(v2 : ligne guide contrainte, barre du bilan global, packaging). Toutes les sections
validées. À faire relire par spec-document-reviewer avant passage au plan
d'implémentation.
**Contrainte :** Laurent veut tester le logiciel en conditions réelles sur ce PC la
semaine du 27/07/2026 — les 8 paquets ci-dessous doivent être livrables un par un et
testables indépendamment, dans l'ordre où ils sont numérotés.

## 1. Contexte et objectif

Testé en conditions réelles fin juillet, GEOBIO a révélé des trous fonctionnels et une
interface jugée inutilisable en l'état par Laurent : panneaux flottants empilés en boîtes
blanches dans les 4 coins de la carte, sans organisation ni hiérarchie, plusieurs briques
manquantes qui bloquent un relevé réel, et un lancement du logiciel qui demande de
connaître les internes du projet (serveur de dev, URL locale) plutôt qu'un simple clic.

**Principe directeur, posé fermement par Laurent (repris de sessions précédentes) : pas
de travail visuel/esthétique.** "Je ne veux pas de design, je veux du fonctionnel pur :
comme Paint." Icônes/boutons clairs, groupés par fonction, zéro décoratif. Ce document ne
propose aucune palette de couleurs, aucune typographie, aucune animation — uniquement de
la structure et du comportement.

**Découpage du plan d'implémentation :** un seul plan, 8 tâches/chunks ordonnés (même
pattern que `docs/superpowers/plans/2026-07-21-freeform-followups-plan.md`, qui a bien
fonctionné le 22/07/2026) — pas 8 documents de plan séparés. Chaque paquet reste commité
et testé indépendamment (suite verte + `tsc` clean après chacun), livrable/testable par
Laurent dès qu'il est mergé, sans attendre les autres.

**Périmètre de ce document, confirmé avec Laurent :** huit paquets, livrés dans cet ordre
(le paquet 2 dépend de la structure posée par le paquet 1 ; le paquet 3 dépend du paquet 2
pour connaître le réseau actif ; le paquet 4 profite du coin haut-droit de la carte
libéré par le paquet 1, qui y déplace `LayerPanel` dans le panneau latéral) :

1. Panneau latéral (remplace les 4 `OverlayPanel` flottants actuels)
2. Outil "placer un point ressenti" (comble le trou fonctionnel le plus critique)
3. Ligne guide contrainte par le réseau actif
4. Boussole permanente à 8 points cardinaux
5. Barre permanente du bilan global
6. Géocodage de l'adresse (centrage carte)
7. Liste des missions + reprise d'une mission existante
8. Packaging / lancement en un clic

**Hors périmètre, explicitement écarté de ce chantier** (confirmé avec Laurent) :
génération de rapport/preview terrain (chantier de conception à part, voir mémoire
projet), mode hors-ligne, système Or/Argent/Cuivre, détection automatique de croisements
pathogènes (spec/plan séparés, statut d'exécution à vérifier indépendamment), packaging
multi-appareils/tablette (Laurent testera sur ce PC uniquement — voir §10 packaging).

## 2. État du code au 22/07/2026 (vérifié, pas supposé)

- `src/components/SiteMapView.tsx` (772 lignes après l'extraction de `usePlacementMode`
  faite ce jour) rend 4 `OverlayPanel` (top-right, top-left, bottom-left, bottom-right)
  contenant au total 9 groupes de contrôles distincts : `LayerPanel` + `GridCreationPanel`
  (top-right, 2), ligne guide + `PhenomenonPicker` + tracé eau/faille + statut bâtiment
  (top-left, 4 cartes empilées), mode édition de grille (bottom-left, 1), revue
  d'orthogonalité + légende Bagua (bottom-right, 2).
- `src/hooks/usePlacementMode.ts` gère déjà `PlacementMode` (union discriminée
  grid-origin/guide-line/phenomenon/freeform) — ce document y ajoute une 5ᵉ variante
  (paquet 2) et fait évoluer la variante `guide-line` existante (paquet 3).
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
- Les 5 réseaux telluriques ont un angle connu (mémoire projet, table confirmée par le
  manuel physique de Laurent) : **Hartmann 0°, Curry 45°, Palm 0°, Peyré 0°, Wissmann
  45°** (ce dernier non confirmé à 100%, assumé = Curry). C'est cette table que le
  paquet 3 utilise pour contraindre la ligne guide.
- Ligne guide actuelle (top-left de `SiteMapView.tsx`) : 4 boutons de préréglage (N/S,
  E/O, 45°, 135°) + un champ d'angle personnalisé + son bouton "Valider" (commit
  l'angle personnalisé) + "Placer ici" (clic carte ensuite) + "Effacer". Tous les
  boutons sont toujours proposés, sans lien avec un réseau quelconque — c'est ce que le
  paquet 3 change.
- `src/geometry/bagua.ts`'s `COMPASS_ORDER` n'est **pas exporté** (`const` module-privé)
  — `SiteMapView.tsx` le sait déjà et duplique le même tableau littéral localement
  (`COMPASS_DIRECTIONS`, avec un commentaire explicite sur cette duplication volontaire).
  Le paquet 4 devra soit exporter `COMPASS_ORDER` et l'importer, soit dupliquer le
  littéral une troisième fois — à trancher en plan, détail d'implémentation mineur.
- `src/components/GlobalAssessmentForm.tsx` : 6 curseurs (`causeArchitectural`,
  `causeElectromagnetique`, `causeGeobiologique`, `causeParanormale`, `causeAutres` —
  échelle 0-10 — et `bovisRate` — échelle 0-180000), état local, **un seul bouton
  "Enregistrer les mesures globales"** qui envoie les 6 valeurs d'un coup via
  `setGlobalAssessment(missionId, input)`. Rendu uniquement comme écran plein (phase
  `global-assessment` de `MissionWorkspace`, avant la carte) — jamais visible ni
  modifiable une fois passé à l'étape suivante.
- `src/pages/MissionWorkspace.tsx` : `DEFAULT_CENTER` = centre approximatif de la France
  métropolitaine, utilisé sans conditions dès la phase `setting-origin` — le commentaire
  du code confirme que le géocodage n'a jamais été implémenté.
- Aucune boussole permanente n'existe : le code contient plusieurs occurrences de
  "compass" (`COMPASS_DIRECTIONS`/`COMPASS_ORDER`, le type `CompassDirection`, le champ
  `compassDirection` — déclaré dans `bagua.ts` sur `BaguaSector`, lu dans
  `BaguaLayer.tsx`), mais aucune n'est un indicateur visuel sur la carte — toutes
  servent uniquement au tri/légende Bagua ou au modèle de correspondances Bagua
  (`baguaCorrespondences.ts` importe seulement le type `CompassDirection` comme clé,
  sans champ `compassDirection` propre). `COMPASS_ORDER` dans `bagua.ts` vaut déjà
  exactement `['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']` — le paquet 4 réutilise ces
  8 mêmes libellés, pas une nouvelle convention.
- `MissionWorkspace`'s `WorkspacePhase` est un état 100% local (`useState`), jamais
  persisté ni reconstruit depuis la base — fermer l'onglet ou recharger perd la mission
  en cours. `listMissions()` (`src/data/missionsRepo.ts`) et
  `listPlansForMission()` (`src/data/plansRepo.ts`) existent déjà mais ne sont appelés
  nulle part dans le code applicatif (uniquement dans leurs propres tests).
- Pas de dépendance de routing (`react-router` absent de `package.json`) — l'app entière
  tourne sur une machine à états locale dans `App.tsx`/`MissionWorkspace.tsx`.
- `vite.config.ts` a déjà `VitePWA` configuré (`registerType: 'autoUpdate'`, manifest
  avec nom/icônes/`display: 'standalone'`/`start_url: '.'`) — jamais exploité : personne
  n'a encore fait de build de production ni d'installation. Le raccourci bureau actuel
  (`C:\Users\laurent\geobio-dev-server.cmd`) lance `npm run dev` (serveur de
  développement, pas un build de production) et **pointait, avant sa correction ce
  jour (22/07/2026), vers un worktree supprimé** — cassé indépendamment de ce chantier,
  déjà réparé (repointé vers `D:\LAURENT PC\GEOBIO`) en attendant le paquet 8.
  `package.json` a déjà les scripts `build` (`tsc -b && vite build`) et `preview`
  (sert le build de production en local).

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
  - **Ligne guide** — contenu du paquet 3 (voir §5 : les boutons N/S, E/O, 45°, 135°
    deviennent conditionnels au réseau actif ; angle personnalisé + Valider, Placer ici
    et Effacer restent inchangés)
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
- **Ne vit pas dans ce panneau** (voir §7 pour où ils vivent à la place) : les curseurs
  du bilan global — Laurent les veut dans une barre horizontale séparée, en bas d'écran,
  pas dans le panneau latéral ("c'est un élément d'arborescence logique" distinct des
  outils de placement).

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
- **Le réseau actuellement armé (`networkName` du mode `'felt-point'`) devient
  l'information dont le paquet 3 a besoin** pour contraindre la ligne guide — ce paquet
  doit exposer cette info (le hook la possède déjà via `placementMode`, rien de plus à
  construire ici).

## 5. Paquet 3 — Ligne guide contrainte par le réseau actif

**Évolution de la ligne guide existante** (pas un nouvel outil) : Laurent continue de
placer l'ancre manuellement ("je la place manuellement à l'endroit où je veux faire le
relevé"), mais l'orientation proposée n'est plus un choix totalement libre — elle est
**contrainte par le réseau tellurique actuellement armé** dans le point ressenti
(paquet 2), en s'appuyant sur la table d'angles confirmée en §2 :

- **Hartmann, Palm, Peyré** (réseaux à 0°) → seuls les boutons **N/S** et **E/O**
  restent proposés (les 2 orientations perpendiculaires d'une grille non tournée) ; les
  boutons 45°/135° sont masqués ou désactivés.
- **Curry, Wissmann** (réseaux à 45°) → seuls les boutons **45°** et **135°** restent
  proposés ; N/S et E/O sont masqués ou désactivés.
- **Aucun réseau armé** (le point ressenti n'est pas en cours de sélection) → tous les
  boutons restent disponibles, comportement actuel inchangé — pas de régression pour un
  usage de la ligne guide indépendant du protocole réseau (ex. calage général).
- Le champ d'angle personnalisé **et son bouton "Valider" restent toujours
  disponibles**, quel que soit le réseau actif — échappatoire explicite pour l'angle non
  confirmé de Wissmann (voir §2) ou tout cas hors norme.
- Le bouton "Placer ici" et le clic carte pour ancrer la ligne ne changent pas —
  uniquement le sous-ensemble de boutons de préréglage d'angle proposés change selon
  `placementMode`.
- Techniquement : `usePlacementMode.ts` expose déjà `placementMode` ; ce paquet ajoute
  une fonction pure (ex. `allowedBearingsForNetwork(networkName): number[]`) mappant les
  5 noms de réseaux connus vers `[0, 90]` ou `[45, 135]`, et un réseau inconnu (cas
  "Autre" du paquet 2) vers `null` (= tous les boutons, comportement actuel).

## 6. Paquet 4 — Boussole permanente à 8 points cardinaux

Un indicateur fixe, non interactif, confirmant visuellement l'orientation complète
(Leaflet ne fait jamais tourner la carte, le haut est donc toujours le Nord vrai — ce
n'est donc jamais faux, juste jamais rappelé à l'écran aujourd'hui) — utile pendant le
ressenti aveugle où Laurent ne regarde pas forcément la grille théorique.

- **8 points cardinaux** (N, NE, E, SE, S, SW, W, NW), pas seulement N — réutilise
  exactement les libellés de `COMPASS_ORDER` (déjà dans `bagua.ts`), cohérent avec le
  modèle Bagua/Pakua déjà utilisé ailleurs dans le logiciel plutôt qu'une nouvelle
  convention à 4 points.
- **Position : coin haut-droit de la carte**, superposé (rond avec les 8 points
  libellés autour, N mis en évidence). Choisi plutôt qu'une bande verticale ou un
  indicateur bas-gauche : léger, ne prend pas de place dans le panneau latéral, le coin
  haut-droit de la carte est aujourd'hui libre (`LayerPanel` qui l'occupait migre dans
  le panneau latéral au paquet 1).
- Toujours visible, à tout zoom/pan, indépendamment de tout calque activé ou de l'état de
  `placementMode` — c'est un élément de chrome de la carte, pas un outil.
- Composant simple, pas de dépendance nouvelle (pas de librairie de boussole/rose des
  vents) — un petit SVG ou une combinaison de caractères/CSS suffit, cohérent avec le
  principe "fonctionnel pur, pas de polish".

## 7. Paquet 5 — Barre permanente du bilan global

Rend les 6 curseurs du bilan global (§2) accessibles et modifiables **pendant tout le
relevé**, pas seulement une fois au tout début — Laurent affine son impression des 5
causes au fil du terrain, "c'est le premier ressenti global qui conditionne et oriente
les recherches à creuser", donc l'étape initiale reste obligatoire, mais n'est plus la
seule occasion d'ajuster ces valeurs.

- **Étape initiale (`global-assessment`, `GlobalAssessmentForm`) : inchangée et
  toujours obligatoire** avant d'accéder à la carte — confirmé explicitement par
  Laurent, ce paquet ne la supprime pas.
- **Nouvelle barre horizontale fixe en bas de l'écran**, toujours visible pendant la
  phase `ready-no-interior` (la carte de relevé). **Absente pendant `calibrating-interior`**
  (l'écran de calage du plan intérieur importé n'est pas la carte de relevé — pas de
  bilan global à ajuster sur cet écran-là, cohérent avec le fait que ce n'est déjà pas
  un endroit où `SiteMapView`/le panneau latéral sont rendus). Pas dans le panneau
  latéral (Laurent :
  "je les vois en permanent pas en latéral... c'est un élément d'arborescence logique"),
  un élément de chrome au même niveau que la carte elle-même, pas un outil rangé parmi
  les autres.
- Contient les mêmes 6 curseurs que `GlobalAssessmentForm` (réutilise `CauseSlider` ou
  un composant équivalent), pré-remplis avec les valeurs actuelles de la mission
  (`mission.causeArchitectural`, etc. — déjà chargées, `SiteMapView`/`MissionWorkspace`
  ont déjà accès à `Mission`).
- **Auto-enregistrement à chaque changement** ("s'enregistre tout seul") — pas de
  bouton "Enregistrer" dans la barre, chaque glissement de curseur déclenche
  `setGlobalAssessment(missionId, { ...toutes les valeurs actuelles })` (l'API existante
  n'accepte qu'une mise à jour complète des 6 champs à la fois, donc chaque appel envoie
  l'état courant complet de la barre, pas juste le champ modifié) — à débouncer en plan
  pour éviter un appel réseau à chaque pixel de glissement plutôt qu'à chaque relâchement
  de curseur (détail d'implémentation, pas un enjeu de design).
- `GlobalAssessmentForm` (l'écran plein initial) et la nouvelle barre partagent la même
  fonction de sauvegarde (`setGlobalAssessment`) mais restent deux composants distincts
  — l'écran initial garde son propre bouton "Enregistrer" explicite (geste délibéré de
  clôture du premier ressenti), la barre n'en a pas (ajustement continu).

## 8. Paquet 6 — Géocodage de l'adresse

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

## 9. Paquet 7 — Liste des missions + reprise

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
    voir §12, remplissage tout-ou-rien) → phase `global-assessment`, avec le plan
    extérieur existant plutôt que recréé
  - Bilan rempli mais `originLat`/`originLng` encore `null` → phase `setting-origin`
  - Origine posée → phase `ready-no-interior` directement ; `SiteMapView` recharge déjà
    tout son état (grilles, points ressentis, phénomènes, tracés, bâtiment) depuis la
    base à l'ouverture, donc rien de plus à faire ici pour que le relevé en cours
    réapparaisse tel quel — la barre du bilan global (paquet 5) se pré-remplit de la
    même façon, à partir de la `Mission` déjà chargée
- **Aucune nouvelle dépendance** (pas de `react-router`) : un état d'écran de plus tout
  en haut de l'app, même style de machine à états que celle déjà utilisée dans
  `MissionWorkspace`. **Vit dans `src/App.tsx`** (qui aujourd'hui se contente de rendre
  `<MissionWorkspace />` directement, sans aucun état), pas dans `MissionWorkspace.tsx`
  lui-même — `MissionWorkspace` garde sa propre machine à états interne inchangée, mais
  reçoit en plus une mission existante (optionnelle) en prop pour démarrer directement
  à la bonne phase au lieu de toujours partir de `creating-mission`. Pas d'URL par
  mission — Laurent a explicitement choisi la liste plutôt qu'un lien direct.

## 10. Paquet 8 — Packaging / lancement en un clic

**Objectif confirmé par Laurent : un icône sur le bureau, un clic, le logiciel
s'ouvre** — plus de "je me connecte au serveur, j'ouvre le navigateur". Test prévu sur
ce PC Windows uniquement (pas de tablette/téléphone dans le périmètre de ce chantier).

- **Build de production**, pas le serveur de développement : `npm run build` (script
  déjà présent, `tsc -b && vite build`) génère les fichiers statiques dans `dist/`.
- **Servir ce build en continu** : le script `preview` existant (`vite preview`) ou un
  petit serveur statique équivalent, démarré en arrière-plan sur un port fixe.
- **Un seul raccourci bureau** qui : démarre le serveur de preview s'il ne tourne pas
  déjà (sans le redémarrer inutilement à chaque clic), puis ouvre le navigateur sur
  l'URL locale — idéalement en tant qu'application installée (PWA "Ouvrir en tant
  qu'application" d'Edge/Chrome, exploitant le manifest déjà configuré dans
  `vite.config.ts` : `display: 'standalone'` supprime la barre d'adresse/les onglets,
  ça s'ouvre comme un vrai logiciel). L'installation PWA elle-même (clic "Installer"
  dans le navigateur, une fois) est un geste manuel ponctuel à faire une seule fois par
  Laurent — pas quelque chose que le script peut automatiser depuis l'extérieur du
  navigateur.
- **Remplace le raccourci actuel** (`geobio-dev-server.cmd`, réparé en urgence ce jour
  mais qui reste un lancement de serveur de développement, pas ce que Laurent demande
  ici) plutôt que d'en ajouter un deuxième.
- Hors périmètre explicite : Electron/Tauri ou tout autre empaquetage en exécutable
  autonome, distribution multi-appareils, mode hors-ligne au-delà de ce que le plugin
  PWA fournit déjà par défaut — sur-dimensionné par rapport au besoin exprimé ("teste sur
  ce PC").

## 11. Ce qui ne change pas

Tous les composants/handlers déplacés dans un paquet gardent leur comportement exact
(paquet 1, et paquet 4 qui ne fait que réutiliser `COMPASS_ORDER` sans rien modifier) ou
s'appuient sur des fonctions de données déjà testées et inchangées (`createFeltPoint`,
`setGlobalAssessment`, `listMissions`, `listPlansForMission`) — ce document ne remet en
cause aucune décision déjà prise sur les réseaux telluriques, le calage de grille, ou le
modèle Bagua. Seul le paquet 6 (géocodage) change un comportement existant côté succès
(le centrage initial de la carte) ; son chemin d'échec reste, lui, inchangé (§8).

## 12. Hypothèses à confirmer en plan (pas tranchées ici, faible impact si erronées)

- Accordéon (paquet 1) : une seule section ouverte à la fois, ou plusieurs
  indépendamment ? (par défaut technique le plus simple : indépendant, comme `<details>`
  HTML natif)
- Carte de revue d'orthogonalité (paquet 1) : reste un petit overlay flottant sur la
  carte — exact positionnement à trancher en implémentation, pas un enjeu de design.
- "Bilan global rempli" pour la reprise de mission (paquet 7) : tous les champs
  non-null, ou au moins un renseigné ? Recommandation : exiger que la sauvegarde ait eu
  lieu au moins une fois (l'action `setGlobalAssessment` s'appelle en un seul appel avec
  tous les champs, donc soit tout est rempli, soit rien ne l'est — pas de cas
  intermédiaire réel à gérer côté écran initial ; la barre permanente du paquet 5 change
  ça après coup, mais uniquement pour une mission déjà passée par l'écran initial une
  première fois).
- Débounce exact de l'auto-enregistrement de la barre du bilan global (paquet 5) : durée
  précise (ex. 500ms après le dernier changement) à trancher en implémentation.

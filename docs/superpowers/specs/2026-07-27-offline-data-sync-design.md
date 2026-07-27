# Mode hors-ligne terrain — cache et synchronisation des données — Design

**Date :** 2026-07-27
**Statut :** Brainstorm mené avec Laurent (questions fermées, une à la fois). Laurent a
ensuite dit "avance tout seul" avant la dernière confirmation explicite — les deux
hypothèses restées sans réponse ferme (ordre A/B, pas de gestion de conflits) sont donc
retenues comme proposées par Claude, pas comme validées mot pour mot par Laurent.
Relu par un reviewer de spec (subagent, 5 passes) le 2026-07-27 : trous réels trouvés et
corrigés (`freeformNetworksRepo` oublié du périmètre, `missionOrigin`/point d'entrée
hors-ligne incomplet — App.tsx n'a aucun moyen d'atteindre une mission sans réseau sans
ce correctif, `plansRepo` oublié) — voir §2/§4.4/§4.5. **Approuvé** au round 5. À
présenter à Laurent pour validation avant de coder quoi que ce soit.

## 1. Contexte et objectif

Laurent (géobiologue indépendant) ne veut pas de wifi/GSM actif sur le terrain (perturbe
le ressenti + zones rurales souvent sans réseau). Modèle en 4 phases, déjà articulé par
Laurent dans une session précédente : **préparation** (en ligne) → **relevé terrain**
(hors-ligne prioritaire) → **remontée des données** (en ligne) → **édition du rapport**
(en ligne, chantier séparé, hors périmètre ici).

Périmètre confirmé par questions fermées (2026-07-27) :
- Le fond de carte (photo IGN) doit rester visible/navigable hors-ligne.
- La préparation de mission (adresse, géocodage, sélection des parcelles, pose de
  l'origine) se fait toujours en ligne, avant de partir sur site.
- Une fois sur site, tout le relevé (grilles, points/segments ressentis, objets de
  contexte, photos) doit fonctionner sans réseau.
- La synchronisation au retour se fait automatiquement dès que le réseau revient, sans
  action de Laurent.
- Les données déjà existantes d'une mission (visite précédente) doivent être
  consultables ET modifiables hors-ligne, pas seulement l'ajout de données neuves.
- Le téléchargement des tuiles de carte se déclenche automatiquement à la confirmation
  de la sélection des parcelles.

**Ce chantier se scinde en deux sous-projets largement indépendants :**
- **B — Cache et synchronisation des données terrain** (grilles, points/segments
  ressentis, phénomènes, objets de contexte) : le plus gros morceau, touche toute la
  couche de données actuelle. **Ce document couvre uniquement B.**
- **A — Cache des tuiles de carte IGN** (revoir la photo aérienne hors-ligne) : plus
  mécanique (Workbox/Cache API), ne touche pas au modèle de données. Chantier séparé,
  volontairement laissé pour un document/plan ultérieur — proposé par Claude comme
  second sous-projet à spécifier une fois B construit et testé, **non confirmé
  explicitement par Laurent**.

**Hypothèse de conception non confirmée explicitement, à valider avec Laurent avant
implémentation :** pas de gestion de conflits — un seul appareil, une seule session
hors-ligne à la fois pour une mission donnée ("dernière écriture gagne" suffit, pas
d'interface de fusion). Cohérent avec sa pratique solo (mémoire projet : "Laurent est
géobiologue indépendant"), mais reste une hypothèse de Claude, pas une confirmation
explicite de Laurent — la question posée est restée sans réponse ferme (fermée par
Laurent avec "OK AVANCE TOUT SEUL" plutôt qu'un choix explicite parmi les options).

**Hors périmètre de ce document, explicitement écarté :**
- Cache des tuiles de carte (sous-projet A)
- Photos (upload de fichiers hors-ligne) — complexité propre au stockage de blobs
  volumineux en IndexedDB et à la gestion de quota ; traité comme itération séparée
  après validation du reste (voir §6, paquet 9)
- Gestion de conflits multi-appareils
- Correctif du bug de cache Service Worker périmé déjà identifié en dev (mémoire
  projet) — problème distinct (bundle JS périmé lors d'itérations rapides), pas un
  obstacle structurel à ce travail
- Création de mission hors-ligne (reste en ligne, cf. périmètre confirmé ci-dessus)
- Mode hors-ligne pour la recherche de bâtiment (Bagua/cadastre WFS) — reste une
  fonctionnalité en ligne uniquement, comme la préparation de mission
- `rodMarkersRepo.ts` (table `rod_marker`, référentiel global des marqueurs ArUco) —
  exclu explicitement : le sous-projet de reconnaissance d'image des tiges (Plan 2,
  spec+plan déjà écrits) n'est toujours pas exécuté, donc aucune fonctionnalité vivante
  ne dépend aujourd'hui de lire/écrire cette table pendant le relevé terrain
- Reprendre la liste complète des missions (`missionsRepo.listMissions`) hors-ligne —
  reste une action en ligne. Seule la mission **actuellement ouverte** au moment du
  passage hors-ligne est mise en cache (voir §4.4) pour survivre à un rechargement
  de page fait sans réseau ; changer de mission depuis la liste reste une action en
  ligne, cohérent avec "la préparation de mission... se fait toujours en ligne"

## 2. État du code actuel (vérifié, pas supposé)

- `src/data/gridInstancesRepo.ts`, `gridLinesRepo.ts`, `feltPointsRepo.ts`,
  `feltSegmentsRepo.ts`, `phenomenaRepo.ts`, `contextObjectsRepo.ts`,
  `gridTemplatesRepo.ts`, **et `freeformNetworksRepo.ts`** (tracés eau/faille — omis
  d'un premier jet de cette spec, trouvé par la relecture du 2026-07-27 : mêmes
  caractéristiques que `feltSegmentsRepo`, indexé par `plan_id`, tracé pendant le relevé
  terrain via `FreeformDrawTool.tsx` — n'expose aujourd'hui que `createFreeformNetwork`
  et `listFreeformNetworksForPlan`, pas de fonction de mise à jour/suppression, donc le
  patron cache-through de §4.5 ne s'applique qu'à ces deux-là pour ce repo — chargé dans
  le même `Promise.all` de `SiteMapView.tsx` que les autres) appellent chacun
  directement `supabase.from(...)` — aucune couche de cache local n'existe nulle part
  dans le projet.
- `src/data/missionsRepo.ts` n'a pas de fonction "lire une seule mission par id" — juste
  `listMissions()` (toutes les missions), `createMission`, `setMissionOrigin`,
  `setGlobalAssessment`, `setSelectedParcels`, `setBuildingFootprint` (toutes des
  actions de préparation, en ligne uniquement par ce document). `missionOrigin` est
  aujourd'hui reçu par `SiteMapView` en prop depuis son parent — rien ne le persiste
  localement pour survivre à un rechargement de page fait hors-ligne (voir §4.4 pour le
  correctif).
- **Point d'entrée de l'app, vérifié — trou réel trouvé par une seconde relecture
  (2026-07-27) :** `src/App.tsx` appelle *inconditionnellement* `listMissions()` au
  montage (aucun routing, aucune persistance de "quelle mission est ouverte" —
  `react-router` absent de `package.json`, aucune occurrence de `localStorage` dans
  `src/`). Si cet appel échoue (hors-ligne), l'app tombe en phase `error` et
  **rien n'est atteignable, y compris une mission déjà entièrement préchargée**. Le
  chemin normal est : liste → clic sur une mission → `handleSelectMission` →
  `deriveResumePhase(mission)` (`src/pages/deriveResumePhase.ts`) →
  `listPlansForMission(mission.id)` (`src/data/plansRepo.ts`, **pas dans la première
  version de ce document**) → `AppPhase` passe à `{ name: 'resuming', resumePhase }` →
  `<MissionWorkspace initialResumePhase={resumePhase} />`. Sans un chemin d'entrée
  alternatif hors-ligne, tout le travail de cache décrit plus bas dans ce document
  serait construit mais jamais atteint en pratique — voir §4.4 pour le correctif (mission
  ouverte + plans persistés, réutilisant `ResumePhase`/`initialResumePhase`, déjà des
  mécanismes existants dans le code).
- Chaque table concernée a son `id` généré côté serveur via `default gen_random_uuid()`
  (ex. `context_object.id uuid primary key default gen_random_uuid()`,
  `supabase/migrations/0019_context_object.sql`) — une colonne avec valeur par défaut,
  pas une contrainte `generated always as identity`, donc un `insert` peut fournir
  explicitement sa propre valeur d'`id` sans migration de schéma.
- `vite.config.ts` : `VitePWA({ registerType: 'autoUpdate', manifest: {...} })`, sans
  bloc `workbox` custom — le build (JS/CSS/HTML) est précaché par défaut (comportement
  Workbox `generateSW`), mais aucune requête vers Supabase ni vers les tuiles IGN
  (`data.geopf.fr`, cross-origin) n'est mise en cache runtime actuellement.
- Aucune dépendance IndexedDB (`idb`, `dexie`, etc.) dans `package.json`.
- `SiteMapView.tsx` charge toutes ses données via un seul `useEffect` avec un
  `Promise.all(...)` (voir la refonte de cette semaine pour `listContextObjectsForPlan`)
  — un point d'extension naturel pour brancher le comportement cache-through.

## 3. Approche retenue

**"Cache-through repository wrapper"** : chaque fonction repo essaie d'abord Supabase ;
en cas d'échec réseau, elle bascule sur IndexedDB (lecture depuis le cache local,
écriture mise en file d'attente). Les lectures réussies en ligne rafraîchissent aussi le
cache local à chaque appel, pour rester à jour la prochaine fois que Laurent repart hors
ligne.

**Alternative écartée — "queue-only" (pas de cache de lecture, juste une file
d'écriture) :** rejetée car Laurent a confirmé vouloir revoir/modifier les données déjà
existantes d'une mission hors-ligne, pas seulement en ajouter.

**Alternative écartée — librairie de synchronisation complète (RxDB, WatermelonDB,
PouchDB/CouchDB) :** trop lourd et trop de nouveaux concepts pour un besoin borné (un
seul utilisateur, pas de conflits, une poignée de types de données). `idb` (wrapper
minimal d'IndexedDB, par Jake Archibald, une seule dépendance légère sans transitives)
plus une logique de synchronisation maison restent lisibles et déboguables — cohérent
avec le style du projet (pas de dépendance lourde ajoutée sans nécessité claire, comme
`js-aruco2` ne l'a été que pour un problème réellement dur).

## 4. Design détaillé

### 4.1 IDs générés côté client

Chaque `createX(...)` génère son UUID via `crypto.randomUUID()` et l'inclut
explicitement dans l'insert Supabase, au lieu de laisser Postgres le générer via son
défaut. Un enregistrement créé hors-ligne a ainsi son ID final dès sa création — aucun
remappage d'ID à faire une fois synchronisé. Aucune migration de schéma requise (voir
§2). `crypto.randomUUID()` est disponible nativement dans tout navigateur moderne
(contexte sécurisé HTTPS/localhost, déjà le cas ici).

### 4.2 Stockage local (IndexedDB via `idb`)

Nouvelle base `geobio-offline`, un object store par type de donnée synchronisable :
`grid_instance`, `grid_line`, `felt_point`, `felt_segment`, `phenomenon`,
`context_object`, `freeform_network`, `plan` (tous indexés par `plan_id` sauf `plan`
lui-même, indexé par `mission_id`), et `grid_template` (indexé globalement, pas de
`plan_id`). Un store séparé `current_session` (une seule entrée :
`{ mission, exteriorPlan }`, voir §4.4 pour son rôle de point d'entrée hors-ligne). Un
store séparé `pending_mutations` :
`{ id, table, operation: 'insert' | 'update' | 'delete', payload, createdAt, attempts }`.

### 4.3 Détection de connectivité

`navigator.onLine` seul peut mentir (vrai même sans connectivité internet réelle, par
exemple connecté à un routeur local sans accès WAN) — combiné à un test réseau léger
(`fetch` HEAD vers l'endpoint Supabase avec timeout court) avant de déclarer "en ligne"
pour de vrai. Écouteurs `online`/`offline` sur `window` en complément, pour réagir vite
au changement d'état plutôt que de sonder en continu.

### 4.4 Préchargement ("mise en cache pour le terrain")

Déclenché automatiquement au moment où la sélection des parcelles est confirmée (même
point de déclenchement que le futur sous-projet A) : télécharge et stocke localement
tout ce que la phase terrain va lire pour ce plan — instances de grille et leurs lignes,
points ressentis, segments ressentis, phénomènes, objets de contexte, tracés eau/faille,
templates de grille (liste globale).

**Point d'entrée hors-ligne (correctif du trou trouvé en relecture, voir §2) :** en plus
des données ci-dessus, le préchargement stocke aussi dans un object store
`current_session` (une seule entrée) exactement la paire `{ mission, exteriorPlan }` —
c'est-à-dire un `ResumePhase` de type `'ready-no-interior'` déjà entièrement formé
(`src/pages/deriveResumePhase.ts` définit ce type ; `MissionWorkspace` sait déjà
consommer un `ResumePhase` via sa prop `initialResumePhase` existante — aucun nouveau
mécanisme de résumé n'est inventé, celui-ci est réutilisé tel quel). Cette entrée est
retenue à jour à chaque fois que la mission est rouverte avec succès en ligne (dans
`App.tsx`, après un `deriveResumePhase` réussi), pas seulement à la confirmation des
parcelles — pour couvrir le cas "visite suivante" (§1) où l'app a pu tourner plusieurs
fois en ligne entre deux passages hors-ligne.

`App.tsx` est modifié : au montage, la détection de connectivité (§4.3, test réseau
proactif, pas une simple lecture de `navigator.onLine`) tranche *avant* tout appel
Supabase. Si elle indique "hors-ligne" **et** qu'une entrée `current_session` existe en
cache, l'app saute directement à
`{ name: 'resuming', resumePhase: { name: 'ready-no-interior', mission, exteriorPlan } }`
sans jamais appeler ni `listMissions()` ni `deriveResumePhase()` (pas de
tentative-puis-repli sur échec : la branche est choisie avant le premier appel réseau).
Ni la liste des missions, ni le changement de mission ne sont possibles hors-ligne
(cohérent avec §1 : la préparation reste en ligne), seule la reprise directe de LA
mission déjà ouverte au moment du passage hors-ligne l'est.

**Cas limite — aucune session en cache :** si l'app démarre hors-ligne sans qu'aucune
entrée `current_session` n'existe (ex. jamais ouverte en ligne depuis l'activation de
cette fonctionnalité, ou stockage local vidé), le comportement retombe sur le chemin
actuel non modifié — `listMissions()` est tentée, échoue, phase `error` (voir §2). Ce
document ne change rien à ce cas ; le résoudre proprement (par ex. un message dédié
"aucune mission préchargée, reconnectez-vous") reste un raffinement possible mais pas
requis pour ce plan.

**Effet de bord bénin, à anticiper plutôt qu'à découvrir en testant :** la phase
`ready-no-interior` de `MissionWorkspace` rend aussi `<MissionPhotosGallery>`, qui fait
son propre appel réseau (`listMissionPhotos`, hors périmètre de ce document — voir §1,
photos = paquet 9) dans un `useEffect` séparé, avec son propre état d'erreur local
(`<p role="alert">` contenu au composant, jamais l'`error` qui remplacerait toute la
page). Hors-ligne, cet appel échouera systématiquement et affichera un encart d'erreur
visible dans la galerie photo — sans casser `SiteMapView` ni le reste de la page, qui
restent pleinement fonctionnels. De la même façon, la recherche de bâtiment de
`SiteMapView` (`fetchBuildingsInBounds`, Bagua/cadastre IGN WFS) est déjà, dans le code
actuel, non-bloquante par construction : ses erreurs vont dans `buildingError`, un état
séparé de l'`error` qui remplacerait toute la carte (voir le commentaire existant dans
`SiteMapView.tsx` à ce sujet). Les deux resteront simplement "en échec visible mais
contenu" hors-ligne, sans traitement spécial requis par ce document.

`src/data/plansRepo.ts` (`listPlansForMission`, oublié de la première version de ce
document — voir §2) est ajouté à la liste des repos avec cache-through (§4.5), **mais
uniquement pour sa fonction de lecture** : `createPlan` (utilisé par
`deriveResumePhase` pour l'auto-réparation d'une mission orpheline sans plan extérieur,
et par la calibration de plan intérieur) reste strictement en ligne — ce cas ne devrait
jamais se produire pour une mission dont le préchargement a réussi (elle a par
construction déjà un plan extérieur), donc pas de comportement hors-ligne à définir pour
lui.

### 4.5 Repos modifiés

Chaque fonction `listX` / `createX` / `updateX` / `deleteX` des 9 repos concernés (§2) —
`gridTemplatesRepo`, `gridInstancesRepo`, `gridLinesRepo`, `feltPointsRepo`,
`feltSegmentsRepo`, `phenomenaRepo`, `contextObjectsRepo`, `freeformNetworksRepo`, et
`plansRepo` (uniquement `listPlansForMission`, voir §4.4 pour la restriction sur
`createPlan`) — est enveloppée dans le même patron :
- `listX` : tente Supabase ; en cas d'échec réseau, lit depuis IndexedDB. En cas de
  succès, écrit aussi le résultat dans IndexedDB (rafraîchit le cache).
- `createX` / `updateX` / `deleteX` : tente Supabase ; en cas d'échec réseau, écrit dans
  `pending_mutations` ET applique immédiatement le changement au cache IndexedDB local
  (pour que l'UI reflète le changement tout de suite, sans attendre la synchro).

Aucun changement de signature TypeScript — mêmes types d'entrée/sortie qu'aujourd'hui.
`SiteMapView.tsx` et les autres appelants ne changent pas.

### 4.6 Synchronisation automatique

Un hook `useOfflineSync()` (ou service singleton monté une fois au niveau app) écoute
les évènements de connectivité (§4.3) ; à la reconnexion confirmée, rejoue
`pending_mutations` dans l'ordre FIFO, une entrée à la fois, supprimant chaque entrée de
la file une fois confirmée par Supabase. Une erreur de synchro individuelle (ex. donnée
désormais invalide côté serveur) incrémente `attempts` et reste dans la file plutôt que
de bloquer les suivantes ; affichée dans un indicateur discret, pas une erreur bloquante
pleine page.

### 4.7 Indicateur UI

Petit indicateur permanent et discret (texte, pas une modale) : `Hors-ligne — N
modification(s) en attente` ou `Synchronisé`. Aucun blocage de l'interface pendant la
synchronisation, qui se déroule en fond.

## 5. Ce qui ne change pas

- Les fonctions repo gardent exactement leurs signatures et types de retour actuels.
- Aucune donnée de préparation de mission (adresse, parcelles, bâtiment) n'est mise en
  cache par ce travail — reste strictement en ligne.
- Les tests existants (mocks `vi.mock('../data/...')`) continuent de fonctionner sans
  changement, puisque l'enveloppe cache-through est interne à chaque fonction repo, pas
  un changement d'interface publique.

## 6. Découpage en paquets livrables

Même convention que les chantiers précédents (`docs/superpowers/plans/`) : un seul plan,
paquets ordonnés, chacun commité et testé indépendamment (suite verte + `tsc` clean après
chaque paquet).

1. **Infrastructure** — dépendance `idb`, ouverture/schéma de la base locale, détection
   de connectivité, générateur d'ID côté client. Aucun comportement visible pour Laurent
   à ce stade — fondations pures, testées unitairement.
2. **Cache-through pour les grilles** — `gridTemplatesRepo`, `gridInstancesRepo`,
   `gridLinesRepo`.
3. **Cache-through pour le ressenti** — `feltPointsRepo`, `feltSegmentsRepo`.
4. **Cache-through pour phénomènes, objets de contexte et tracés eau/faille** —
   `phenomenaRepo`, `contextObjectsRepo`, `freeformNetworksRepo`.
5. **Cache-through pour `plansRepo.listPlansForMission`** (lecture seule, §4.4).
6. **Point d'entrée hors-ligne** — object store `current_session`, mise à jour de
   `App.tsx` pour sauter directement en phase `resuming` (via `ResumePhase`/
   `initialResumePhase`, déjà existants) quand la détection de connectivité (§4.3)
   indique hors-ligne dès le montage et qu'une session est en cache. Sans ce paquet, les
   paquets 2 à 5 sont construits mais jamais atteints en pratique (voir §2).
7. **Préchargement automatique** à la confirmation de sélection des parcelles, et mise à
   jour de `current_session` à chaque reprise réussie d'une mission en ligne (§4.4) —
   remplit pour de vrai, pour le plan/mission concernés, les caches que les paquets 2 à
   6 ont seulement rendu possibles.
8. **Synchronisation automatique + indicateur UI.**

Photos (upload hors-ligne) explicitement en itération séparée (paquet 9, hors ce plan —
voir §1).

## 7. Tests et vérification

Chaque paquet suit la même discipline que le reste du projet cette semaine : TDD pour
chaque fonction (tests avec `fetch`/`supabase` mocké simulant un échec réseau, vérifiant
la bascule vers IndexedDB), puis vérification en direct dans le navigateur avec le
réseau réellement coupé (DevTools "offline" ou équivalent), pas seulement des tests
unitaires — cohérent avec la discipline de vérification déjà établie sur ce projet
(mémoire : "ne jamais affirmer qu'une fonctionnalité marche sans preuve concrète").

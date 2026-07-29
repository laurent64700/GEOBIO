# Annuler/Refaire pour le relevé terrain — Design

**Statut : à relire (spec-document-reviewer).**

## 1. Contexte et objectif

Laurent (géobiologue) a demandé cette fonctionnalité après avoir regardé
[github.com/pascalorg/editor](https://github.com/pascalorg/editor) (éditeur 3D
architectural avec undo/redo natif). Trois douleurs concrètes confirmées comme
motivation (pas une généralisation abstraite du concept, un vrai besoin terrain) :

1. Mauvais placement d'un point/segment ressenti, d'un phénomène ou d'un objet de
   contexte — aujourd'hui, il faut supprimer puis refaire manuellement.
2. Recalage de grille sur un croisement de 2 tiges (chantier livré le 23/07/2026)
   raté — si le croisement choisi était le mauvais, toute la grille part de travers,
   difficile à rattraper.
3. Édition d'une ligne de grille ou d'un segment ressenti par glissement, dont on
   se rend compte après coup que l'ancien positionnement était le bon.

Le chantier "mode hors-ligne terrain" (25 tâches, mergé sur `master` le 27/07/2026) a
livré un cache-through IndexedDB complet sur 9 repos, avec IDs générés côté client et
synchronisation automatique vers Supabase via une file `pending_mutations`. Ce chantier
réutilise directement cette infrastructure : annuler/refaire passe par les mêmes
fonctions de repo déjà cache-through, donc fonctionne identiquement en ligne ou
hors-ligne, sans aucun code de synchronisation dédié à écrire.

## 2. Périmètre

**Inclus — toutes les actions de relevé terrain** (écran `ready-no-interior`) :
- Points ressentis (`feltPointsRepo`) : création, suppression.
- Segments ressentis (`feltSegmentsRepo`) : création, suppression.
- Phénomènes (`phenomenaRepo`) : création, suppression.
- Objets de contexte (`contextObjectsRepo`) : création, suppression.
- Réseaux freeform / tracés eau-faille (`freeformNetworksRepo`) : **exclu de
  l'annulation pour ce chantier** — vérifié dans le code réel, ce repo n'expose que
  `createFreeformNetwork`/`listFreeformNetworksForPlan`, aucune fonction de
  suppression. Annuler une création nécessiterait d'en ajouter une, ce qui est un
  changement de périmètre au-delà de "ajouter annuler/refaire" — hors de ce chantier.
  Une création de tracé freeform reste donc possible comme aujourd'hui, simplement pas
  annulable via les boutons Annuler/Refaire.
- Instances de grille (`gridInstancesRepo`) : **recalage d'origine seulement**
  (`updateGridInstanceOrigin` — couvre la douleur n°2 ci-dessus). La création
  (`createGridInstance`) est exclue : vérifié dans le code réel, ce repo n'expose
  aucune fonction de suppression (seulement `createGridInstance`,
  `listGridInstancesForPlan`, `updateGridInstanceOrigin`) — même raisonnement que pour
  `freeformNetworksRepo` ci-dessus, ajouter une suppression serait un changement de
  périmètre au-delà de ce chantier.
- Lignes de grille (`gridLinesRepo`) : **édition de points ajustés/théoriques
  seulement** (`updateAdjustedPoints`/`updateLinePoints` — couvre la douleur n°3). La
  création en masse (`createGridLines`, génération initiale d'une grille) est exclue :
  même vérification, ce repo n'expose que `createGridLines`, `listGridLinesForInstance`,
  `updateAdjustedPoints`, `updateLinePoints` — aucune suppression, même raisonnement
  d'exclusion.

**Principe général retenu** (règle simple, vérifiable par repo) : une opération n'est
annulable que si le repo expose déjà, ou peut recevoir sans changement de périmètre,
les deux directions nécessaires — soit une paire création/suppression déjà existante
(l'annulation de la suppression utilise la nouvelle `restoreX`, §3.2, une petite
variante de code que ce chantier ajoute — pas une réutilisation de fonctionnalité déjà
là), soit une mise à jour qui peut être réappliquée dans l'autre sens avec la fonction
de mise à jour déjà existante (aucun nouveau code de repo nécessaire dans ce cas).
Une création SANS suppression existante reste hors périmètre plutôt que de justifier
l'ajout d'une nouvelle fonction de suppression (qui poserait ses propres questions,
ex. suppression en cascade des lignes d'une instance de grille — hors sujet ici).

**Exclu explicitement** (actions de préparation, pas de relevé — cohérent avec les
exclusions déjà actées pour le mode hors-ligne et pour le chantier "erreurs non
bloquantes") :
- `plansRepo` (création/calage du plan extérieur ou intérieur).
- `gridTemplatesRepo` (référentiel global des 5 réseaux confirmés, pas une donnée de
  mission).
- Bilan global (`setGlobalAssessment`), sélection de parcelles, création de mission.

## 3. Conception

### 3.0 Migration du schéma IndexedDB — point critique

Le mode hors-ligne est déjà en production (mergé sur `master` le 27/07/2026) : des
utilisateurs ont déjà une base `geobio-offline` en version 1 sur leur machine.
`src/offline/db.ts`'s `upgrade(db)` actuel (sans paramètre `oldVersion`) recrée
inconditionnellement TOUS les stores à chaque fois qu'il s'exécute — `createObjectStore`
lève une exception si le store existe déjà. Bumper `DB_VERSION` à `2` pour ajouter
`action_history` SANS modifier `upgrade()` ferait planter l'ouverture de la base pour
tout utilisateur ayant déjà l'ancienne version, dès son prochain chargement de l'app.

**Fix requis** : restructurer `upgrade(db, oldVersion)` pour ne créer que ce qui manque
selon `oldVersion`, patron standard idb :

```ts
const DB_VERSION = 2

upgrade(db, oldVersion) {
  if (oldVersion < 1) {
    // ... exactement le contenu actuel de upgrade() (tous les stores existants)
  }
  if (oldVersion < 2) {
    const historyStore = db.createObjectStore('action_history', {
      keyPath: 'id', autoIncrement: true,
    })
    historyStore.createIndex('plan_id', 'planId')
  }
}
```

`db.ts` documente déjà `STORE_NAMES` comme "source de vérité à synchroniser à la main"
avec le contenu de `upgrade()` — `'action_history'` doit être ajouté à `STORE_NAMES`
en même temps que le bloc `upgrade()` ci-dessus, pour respecter cet invariant déjà
établi par le fichier (sinon rien ne casse aujourd'hui, mais l'invariant documenté du
fichier serait silencieusement violé).

### 3.1 Mécanisme central : actions compensatoires

Chaque action annulable enregistre un instantané complet dans le nouveau store
IndexedDB `action_history` (indexé par `plan_id`, voir §3.0 — chaque requête décrite
ci-dessous filtre d'abord par `planId`) :

```ts
interface ActionHistoryEntry {
  id: number              // clé auto-incrémentée
  planId: string           // fourni explicitement par l'appelant (pas déduit de
                            // l'indexation propre de chaque type d'entité — grid_line
                            // par ex. est indexé par grid_instance_id, pas planId)
  entityType: 'felt_point' | 'felt_segment' | 'phenomenon' | 'context_object'
    | 'grid_instance' | 'grid_line'
    // freeform_network est explicitement hors périmètre (§2) — pas dans cette union.
  entityId: string
  operation: 'insert' | 'update' | 'delete'
  before: unknown | null   // objet domaine complet avant l'action (null si insert)
  after: unknown | null    // objet domaine complet après l'action (null si delete)
  batchId: string | null   // partagé entre plusieurs entrées d'un même geste
                            // utilisateur (ex. recalage de grille) — voir plus bas
  undone: boolean
  createdAt: string
}
```

**Annuler** = trouve la dernière entrée non annulée (`undone: false`, `id` maximum)
pour le plan courant (via l'index `plan_id`). Si son `batchId` est non nul, TOUTES les
entrées non annulées partageant ce `batchId` sont incluses dans l'opération (voir
"Regroupement en lot" plus bas — cas du recalage de grille). Pour chaque entrée
concernée, applique l'inverse :
- `insert` → appelle la fonction `deleteX` déjà existante du repo concerné.
- `delete` → appelle une nouvelle fonction `restoreX(item)` (une par repo concerné —
  voir §3.2) qui réinsère l'objet exact avec son id d'origine.
- `update` sur `grid_instance` → appelle `updateGridInstanceOrigin` avec les
  coordonnées de `before`.
- `update` sur `grid_line` → appelle **toujours** `updateLinePoints` (jamais
  `updateAdjustedPoints`), avec `before.theoreticalPoints` ET `before.adjustedPoints` —
  jamais `updateAdjustedPoints` seul. Raison (point de conception important, pas un
  détail) : `before`/`after` sont des instantanés complets de l'objet `GridLine`, qui
  portent toujours les deux champs, quelle que soit la fonction d'origine réellement
  appelée par l'action (`updateAdjustedPoints` OU `updateLinePoints`). Si l'annulation
  utilisait `updateAdjustedPoints` (qui ne touche que `adjustedPoints`), un recalage de
  grille (qui modifie `theoreticalPoints` via `updateLinePoints`) ne serait restauré
  qu'à moitié — reproduirait exactement le bug "la grille part de travers" qui motive
  ce chantier (douleur n°2). `updateLinePoints` fixe les deux champs
  inconditionnellement, donc l'utiliser systématiquement pour l'annulation est toujours
  correct, quelle que soit l'action d'origine.

Puis marque toutes les entrées concernées (le lot entier, ou l'entrée seule si
`batchId` est nul) `undone: true`.

**Refaire** = trouve la plus ANCIENNE entrée annulée (`undone: true`, `id` minimum
parmi les annulées — les entrées annulées forment toujours un suffixe contigu du plus
récent au plus ancien non-encore-refait, grâce à la purge décrite ci-dessous). Si son
`batchId` est non nul, inclut de la même façon toutes les entrées annulées partageant
ce `batchId`. Réapplique l'action d'origine vers `after` au lieu de `before` pour
chaque entrée concernée (même règle de dispatch que ci-dessus — `grid_line` toujours
via `updateLinePoints`), marque l'entrée (ou le lot)
`undone: false`.

**Pile vide** : `undo()`/`redo()` sur une pile vide (pour le plan courant) est un
no-op silencieux — cohérent avec le fait que les boutons sont grisés dans ce cas
(§3.4), mais la fonction elle-même doit aussi être sûre à appeler sans précondition
(défense en profondeur).

**Requêtes d'état pour l'UI** : deux fonctions `hasUndoableAction(planId): Promise<boolean>`
et `hasRedoableAction(planId): Promise<boolean>` (existence d'au moins une entrée
`undone: false` / `undone: true` pour ce `planId`) pilotent le grisage des boutons
(§3.4).

**Regroupement en lot (`batchId`) — point critique découvert en relecture.** Certains
gestes utilisateur déclenchent PLUSIEURS appels de repo distincts qui doivent
s'annuler/se refaire comme UNE SEULE étape. Le cas réel le plus important : le recalage
de grille sur un croisement de 2 tiges (douleur n°2, `SiteMapView.tsx`, fonction de
recalage autour de la ligne 448) appelle `updateGridInstanceOrigin` UNE fois puis
`updateLinePoints` UNE fois PAR LIGNE de l'instance — et une grille générée avec le
rayon par défaut (`DEFAULT_GRID_RADIUS_M`, `createGridForPlan.ts`) dépasse couramment
10 lignes. Sans regroupement, ce geste unique produirait 1+N entrées d'historique
séparées ; avec la limite FIFO à 10 par plan (ci-dessous), cela viderait à lui seul tout
le budget d'historique du plan et évincerait l'entrée de recalage d'origine (la plus
ancienne des N+1) — rendant impossible d'annuler complètement le recalage, exactement
le problème que ce chantier doit résoudre.

**Fix** : `ActionHistoryEntry` gagne un champ `batchId: string | null` (id généré côté
client, `null` pour une action simple à un seul appel). `undoableWrite` accepte un
`batchId` optionnel ; un geste qui déclenche plusieurs appels de repo (aujourd'hui, un
seul cas réel : le recalage de grille) génère UN `batchId` partagé et le passe à chaque
appel `undoableWrite` de la séquence. **Annuler/refaire opèrent au niveau du lot, pas
de la ligne individuelle** : annuler la dernière entrée non annulée trouve d'abord son
`batchId` (si non nul), puis annule TOUTES les entrées de ce plan partageant ce
`batchId` en une seule opération logique (chacune via sa propre fonction inverse, comme
d'habitude) avant de marquer le tout `undone: true`. Refaire fonctionne à l'identique
dans l'autre sens. Une entrée à `batchId: null` reste un lot à elle seule (comportement
inchangé pour toutes les autres actions de ce chantier, qui restent à un seul appel).

**Purge sur nouvelle action** : dès qu'une nouvelle action (autre qu'un
annuler/refaire) est enregistrée pour un plan, TOUTES les entrées `undone: true` de ce
plan sont supprimées avant d'insérer la nouvelle — comportement standard de tout
éditeur (impossible de "refaire" une branche qu'une nouvelle action a rendue
obsolète).

**Éviction FIFO à 10 lots (pas 10 lignes)** : la limite de 10 s'applique au nombre de
LOTS distincts pour un plan (un `batchId` non nul compte pour un seul lot, quel que
soit le nombre d'entrées qu'il regroupe ; une entrée à `batchId: null` compte aussi
pour un lot à elle seule), pas au nombre brut de lignes dans `action_history`. Après
insertion d'un nouveau lot, si le plan a plus de 10 lots, TOUTES les entrées du lot le
plus ancien (celui dont l'entrée avec l'`id` minimum pour ce `planId` a le `id` le plus
petit) sont supprimées ensemble. La limite est **par plan**, pas globale. Comme la
purge ci-dessus s'exécute toujours avant cette étape, le compte de lots peut déjà être
bien en dessous de 10 au moment de l'éviction — dans ce cas l'éviction ne se déclenche
simplement pas (condition `> 10`, pas de contradiction avec la purge).

**Croissance à long terme (limite acceptée)** : la limite de 10 est par plan, pas
globale — le nombre total d'entrées dans `action_history` grossit donc avec le nombre
de missions relevées au fil des mois (aucune fonctionnalité de suppression de
plan/mission n'existe dans l'app aujourd'hui). Accepté comme limite connue plutôt que
de construire une purge inter-missions hors sujet ici (YAGNI) — 10 entrées par plan
reste un volume négligeable pour IndexedDB même sur des centaines de missions.

### 3.2 Nouvelle primitive par repo : `restoreX`

Les 4 repos concernés par ce chantier qui ont création+suppression annulables
(`feltPointsRepo`, `feltSegmentsRepo`, `phenomenaRepo`, `contextObjectsRepo`) gagnent
une fonction `restoreX(item: X): Promise<X>` qui réinsère l'objet domaine complet
(id compris) via `cachedWrite(store, table, 'insert', item, toRow, writer)` — la même
signature que `createX` utilise déjà, sauf que `item`/`writer` portent l'id ORIGINAL de
l'objet (celui qu'il avait avant suppression) au lieu d'appeler `generateClientId()`
pour en créer un nouveau. C'est du code nouveau (une petite variante du chemin
d'insertion déjà éprouvé par `createX`), pas une fonctionnalité déjà existante à
réutiliser telle quelle. `gridInstancesRepo` et
`gridLinesRepo` n'ont besoin d'aucune `restoreX` : seules leurs opérations de mise à
jour sont annulables (§2), et annuler une mise à jour utilise la fonction de mise à
jour déjà existante, jamais une réinsertion. `freeformNetworksRepo` est explicitement
exclu de l'annulation (§2), donc n'a pas besoin de `restoreX` non plus.

### 3.3 Wrapper d'enregistrement : `undoableWrite`

Plutôt que de compter sur chaque composant UI pour se souvenir d'enregistrer une
action, un petit wrapper `undoableWrite(planId, entityType, operation, before, after,
writer: () => Promise<T>, batchId?: string): Promise<T>` s'intercale entre chaque
fonction de repo concernée et son `cachedWrite`/`cachedList` déjà existant : il exécute
l'écriture normale, puis (si elle réussit) enregistre l'entrée d'historique — y compris
la purge et l'éviction FIFO au niveau du lot décrites en §3.1. Seuls les 6 repos avec au
moins une opération annulable du §2 l'utilisent (`feltPointsRepo`, `feltSegmentsRepo`,
`phenomenaRepo`, `contextObjectsRepo`, `gridInstancesRepo`, `gridLinesRepo`) ;
`plansRepo`, `gridTemplatesRepo` et `freeformNetworksRepo` n'y touchent pas.

Pour les opérations `update` (recalage de grille, édition de ligne), le `before` est
déjà naturellement disponible : les fonctions concernées (`updateGridInstanceOrigin`,
`updateAdjustedPoints`/`updateLinePoints`) lisent déjà l'entité existante du cache
avant de la patcher (patron établi lors du chantier hors-ligne, Task 3.7/4.1) — pas de
lecture supplémentaire à ajouter.

**Site d'appel du recalage de grille** (`SiteMapView.tsx`, fonction autour de la ligne
448) génère un `batchId` (`crypto.randomUUID()`) une fois pour tout le geste, et le
passe à l'appel `undoableWrite` enveloppant `updateGridInstanceOrigin` ET à chacun des
appels `undoableWrite` enveloppant `updateLinePoints` (un par ligne translatée) — tous
partagent le même `batchId`, formant un seul lot annulable/refaisable (§3.1).

### 3.4 UI

Deux boutons dans la sidebar, visibles en permanence pendant le relevé terrain
(écran `ready-no-interior`), grisés quand la pile correspondante (undo/redo) est vide
pour le plan courant : **↶ Annuler** / **↷ Refaire**. Style cohérent avec l'existant
("fonctionnel pur, comme Paint").

### 3.5 Gestion des erreurs

Un échec pendant un annuler/refaire est traité comme n'importe quelle autre action
terrain : passe par le même circuit cache-through, donc soit ça réussit, soit ça part
en file d'attente hors-ligne comme toute autre écriture (spec du mode hors-ligne
§4.5/§4.6) — pas de nouveau mode d'échec à inventer, pas de bannière d'erreur
spécifique à ce chantier.

### 3.6 Remplacement du mécanisme d'annulation local déjà existant

**Découvert en relecture, point à traiter explicitement.** `SiteMapView.tsx` a déjà,
depuis avant ce chantier, un mécanisme d'annulation LOCAL et non persistant, limité aux
éditions de lignes de grille par glissement : un état `undoStack` en mémoire
(`Record<gridInstanceId, GridLine[]>`, ligne ~166), une fonction `handleLineChanged`
qui y empile l'état précédent à chaque glissement (ligne ~368), une fonction
`handleUndo` qui dépile et rappelle `updateAdjustedPoints` (ligne ~390), et un bouton
"Annuler" dans l'UI (ligne ~708) actif seulement si `editMode` est armé.

Une fois `updateAdjustedPoints` enveloppé par `undoableWrite` (§3.3), l'appel que fait
CE bouton local à `updateAdjustedPoints` serait lui-même enregistré comme une NOUVELLE
action dans l'historique global (`undoableWrite` ne peut pas distinguer "ceci est un
appel normal" de "ceci est déjà un geste d'annulation") — les deux mécanismes
entreraient en collision : cliquer sur l'ancien bouton local pourrait par exemple
réappliquer une modification que l'utilisateur venait d'annuler via le nouveau bouton
global, ou remplir le lot d'historique global avec des entrées qui n'ont plus de sens
une fois le lot correspondant déjà annulé/refait globalement.

**Décision retenue** : ce chantier **supprime** `undoStack`, `handleUndo` et le bouton
"Annuler" local de `SiteMapView.tsx`, entièrement remplacés par le nouveau mécanisme
global (§3.1-§3.4), qui couvre le même besoin (annuler un glissement de ligne) en
mieux — persistant, pas limité à `editMode`, pas limité aux lignes de grille. `handleLineChanged`
reste, moins l'empilement dans `undoStack` (l'enregistrement dans l'historique se fait
désormais automatiquement via `undoableWrite`, à l'intérieur de `updateAdjustedPoints`
lui-même — plus besoin que `SiteMapView` s'en occupe). `handleResetLine`
(réinitialisation au tracé théorique) continue de fonctionner à l'identique, simplement
via `handleLineChanged` inchangé.

## 4. Tests

Pour la migration IndexedDB (§3.0) : un test dédié simulant une base déjà en version 1
(stores existants pré-créés) puis ouvrant en version 2, vérifiant qu'aucune exception
n'est levée et que les stores existants ET `action_history` sont tous présents à la
fin — c'est le test qui aurait attrapé le bug de migration identifié en relecture.

Pour chaque repo concerné : test de la nouvelle fonction `restoreX` (réinsère avec
l'id d'origine, pas un nouvel id généré). Pour `gridLinesRepo` spécifiquement : un test
qui annule une action enregistrée à l'origine via `updateAdjustedPoints` (donc dont
seul `adjustedPoints` a changé au moment de l'action) et vérifie que l'annulation
restaure bien `theoreticalPoints` ET `adjustedPoints` à leurs valeurs `before` — pas
seulement `adjustedPoints` — pour garantir que le dispatch "toujours via
`updateLinePoints`" (§3.1) est réellement appliqué, pas contourné.

Pour le mécanisme central : purge sur nouvelle action, éviction FIFO à 10 LOTS par plan
(pas 10 lignes brutes, pas globale — un test dédié doit couvrir le cas d'un seul lot
regroupant plus de 10 entrées : il doit compter pour un seul lot, ne doit jamais être
partiellement évincé, et ne doit jamais à lui seul déclencher une éviction), annuler/
refaire une séquence d'actions couvrant un mélange d'entités (une insertion sur
`felt_point`, une mise à jour sur `grid_instance`, une suppression sur `phenomenon` par
exemple — pas une seule entité qui passerait par les 3 opérations, puisqu'aucun repo
ne les expose toutes les 3) et vérifier l'état final du cache à chaque étape ;
`undo()`/`redo()` sur une pile vide ne fait rien et ne lève pas d'erreur ; persistance
de l'historique après un rechargement simulé (fermeture/réouverture de la connexion
IndexedDB).

**Test dédié au regroupement en lot (§3.1/§3.3)** : simuler un recalage de grille
touchant plusieurs lignes (au moins 3, pour dépasser un cas trivial à une seule ligne) —
un appel `updateGridInstanceOrigin` + plusieurs appels `updateLinePoints`, tous avec le
même `batchId`. Vérifier : (a) une seule opération "Annuler" restaure l'origine de
l'instance ET les points de TOUTES les lignes du lot en une fois, pas seulement la
dernière ligne touchée ; (b) le lot compte comme une seule entrée pour la limite FIFO
de 10 (§3.1) ; (c) "Refaire" réapplique le lot entier de la même façon.

Pour l'UI : boutons grisés quand `hasUndoableAction`/`hasRedoableAction` renvoie
`false` pour le plan courant, clic déclenche bien la bonne fonction de repo selon
`entityType`/`operation`.

## 5. Ce qui ne change pas

Le mode hors-ligne déjà livré (cache-through, synchro, indicateur) et le chantier
"erreurs non bloquantes" (upload plan intérieur, calibration, bilan global) restent
inchangés. `handleResetLine` et le reste de `SiteMapView.tsx` en dehors du mécanisme
d'annulation local retiré (§3.6) restent inchangés. Ce chantier ajoute de nouvelles
fonctions et un nouveau store, modifie `db.ts` (migration, §3.0), et retire le
mécanisme d'annulation local devenu redondant (§3.6) — aucune autre modification de
l'existant en dehors de l'ajout de l'appel à `undoableWrite` dans les fonctions de
repo concernées.

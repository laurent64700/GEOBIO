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

**Point critique découvert en relecture — annuler/refaire ne doivent JAMAIS
s'enregistrer eux-mêmes comme une nouvelle action.** `undo()`/`redo()` appellent les
mêmes fonctions de repo déjà existantes que l'action d'origine. Pour `deleteX`,
`updateGridInstanceOrigin` et `updateLinePoints` (§3.3 explique que ces fonctions
passent normalement par `undoableWrite`, qui enregistre une entrée d'historique à
chaque appel réussi), sans précaution le simple fait de les appeler DEPUIS `undo()`
enregistrerait une toute nouvelle entrée `undone: false` — au lieu de marquer l'entrée
existante `undone: true`, ce qui casserait la règle "annuler = dernière entrée non
annulée, `id` maximum" (le deuxième clic sur Annuler retrouverait cette entrée
fantôme au lieu de continuer à remonter dans le vrai historique), et contredirait
directement la règle de purge (§3.1 plus bas), qui suppose déjà implicitement une
distinction entre "vraie nouvelle action utilisateur" et "écriture déclenchée par un
annuler/refaire" sans jamais préciser comment cette distinction est faite.
`restoreX` n'est PAS concernée par ce risque précis — voir §3.2 (corrigé en relecture,
round 4) : elle n'appelle jamais `undoableWrite`, donc aucun enregistrement fantôme
n'est possible de ce côté ; mais elle partage le même besoin de bookkeeping manuel sur
`undone` décrit ci-dessous.

**Fix retenu** : pour `deleteX`, `updateGridInstanceOrigin` et `updateLinePoints`,
chacune accepte un paramètre optionnel `options?: { record?: boolean; batchId?: string }`
(défaut `record: true`), transmis tel quel à `undoableWrite` (§3.3). `undo()`/`redo()`
appellent ces fonctions avec `{ record: false }` — l'écriture réelle a bien lieu (même
chemin cache-through/hors-ligne que d'habitude), mais AUCUNE entrée d'historique n'est
créée. Pour `restoreX` (§3.2), qui n'a pas de paramètre `options` du tout, `undo()`/
`redo()` l'appellent directement — le même résultat (écriture réelle, zéro entrée
créée) est obtenu structurellement, puisque `restoreX` ne passe jamais par
`undoableWrite`. Dans les deux cas, `undo()`/`redo()` sont eux-mêmes responsables de
basculer le champ `undone` des entrées concernées (une opération directe sur
`action_history`, distincte de `undoableWrite`), APRÈS que l'écriture compensatoire a
réussi. La règle de purge (plus bas) ne se déclenche donc jamais pour une écriture
faite par `undo()`/`redo()`, puisqu'aucune entrée n'est enregistrée pour ces
écritures-là (que ce soit via `{ record: false }` ou structurellement pour `restoreX`)
— la distinction "action normale" vs "annuler/refaire" est donc bien réelle, pas
seulement supposée.

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
ce `batchId`. Réapplique l'action d'origine pour chaque entrée concernée — **règle de
dispatch pour refaire, symétrique de celle d'annuler ci-dessus, PAS un simple "rejouer
la même fonction que l'action d'origine"** :
- `insert` → appelle **`restoreX(after)`** (jamais `createX` à nouveau : `createX`
  génère systématiquement un nouvel id via `generateClientId()`, ce qui produirait un id
  différent de celui déjà enregistré dans `entityId`/`after`, orphelinerait l'entrée
  d'historique, et casserait un futur "annuler" de ce même refaire — qui chercherait à
  supprimer l'id d'origine, pas le nouveau). `restoreX(after)` réinsère avec le MÊME id
  que l'insertion d'origine, exactement symétrique de `delete` → `restoreX(before)` côté
  annuler.
- `delete` → appelle la fonction `deleteX` déjà existante (symétrique de `insert` →
  `deleteX` côté annuler).
- `update` → même règle de dispatch que pour annuler (`grid_instance` via
  `updateGridInstanceOrigin`, `grid_line` toujours via `updateLinePoints`), avec les
  valeurs de `after` au lieu de `before`.

Marque l'entrée (ou le lot) `undone: false`.

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
une fonction `restoreX(item: X): Promise<X>` qui réinsère l'objet domaine complet (id
compris) via `cachedWrite(store, table, 'insert', item, toRow, writer)` — la même
signature que `createX` utilise déjà, sauf que `item`/`writer` portent l'id ORIGINAL de
l'objet (celui qu'il avait avant suppression) au lieu d'appeler `generateClientId()`
pour en créer un nouveau. C'est du code nouveau (une petite variante du chemin
d'insertion déjà éprouvé par `createX`), pas une fonctionnalité déjà existante à
réutiliser telle quelle.

**`restoreX` n'accepte PAS d'`options?: UndoableOptions` et n'appelle PAS
`undoableWrite` — point précisé en relecture (round 4), pour lever une ambiguïté entre
cette sous-section et §3.1/§3.3.** Contrairement à `createX`/`deleteX`/
`updateGridInstanceOrigin`/`updateLinePoints` (qui sont des fonctions déjà appelées par
l'UI pour de vraies actions utilisateur, et qui ont donc besoin de savoir, via
`options.record`, si l'appel en cours vient d'un annuler/refaire ou d'un geste normal),
`restoreX` n'a **aucun autre appelant que `undo()`/`redo()`** dans toute la conception :
une action de relevé "restaure un objet supprimé" n'existe pas comme geste utilisateur
direct, seulement comme la moitié annuler-d'une-suppression ou refaire-d'une-insertion
(§3.1). `restoreX` serait donc TOUJOURS appelée avec l'équivalent de `{ record: false }`
— un paramètre `options` sur cette fonction ne serait jamais utilisé avec une autre
valeur, du code mort. `undo()`/`redo()` appellent `restoreX` directement (écriture
réelle via `cachedWrite`, sans passer par `undoableWrite`) puis basculent eux-mêmes le
champ `undone` de l'entrée concernée, exactement comme §3.1 le décrit déjà pour le reste
de leur logique de bookkeeping sur `action_history`.

`gridInstancesRepo` et `gridLinesRepo` n'ont besoin d'aucune `restoreX` : seules leurs
opérations de mise à jour sont annulables (§2), et annuler une mise à jour utilise la
fonction de mise à jour déjà existante, jamais une réinsertion. `freeformNetworksRepo`
est explicitement exclu de l'annulation (§2), donc n'a pas besoin de `restoreX` non
plus.

### 3.3 Wrapper d'enregistrement : `undoableWrite`

**Corrigé en relecture (deux fois — voir note en fin de sous-section).** La version
précédente disait "`gridInstancesRepo`/`gridLinesRepo` n'appellent PAS `cachedWrite`/
`cachedList`" — **inexact pour `gridInstancesRepo`**, vérifié en lisant le fichier
réel dans son intégralité : `createGridInstance` (ligne 54), `listGridInstancesForPlan`
(ligne 63) ET `updateGridInstanceOrigin` (ligne 90) utilisent bien `cachedWrite`/
`cachedList`. **Seul `gridLinesRepo` est réellement une variante écrite à la main**
(son propre branchement en ligne/hors-ligne via `isOnlineNow()`/`tryOnlineLineUpdate`,
confirmé en lisant le fichier réel dans son intégralité — aucun appel à
`cachedWrite`/`cachedList` nulle part dans ce fichier). Peu importe : `undoableWrite`
doit envelopper l'ENSEMBLE de l'appel existant (peu importe sa forme interne —
`cachedWrite` générique ou branchement manuel), pas un point précis à l'intérieur —
cette partie de la conception reste correcte et fonctionne uniformément pour les deux
formes.

```ts
interface UndoableOptions {
  record?: boolean   // défaut true — false quand appelé depuis undo()/redo() (§3.1)
  batchId?: string    // défaut absent — regroupe plusieurs appels en un seul lot (§3.1)
}

async function undoableWrite<T>(
  planId: string,
  entityType: ActionHistoryEntry['entityType'],
  operation: ActionHistoryEntry['operation'],
  before: unknown | null,
  perform: () => Promise<T>,   // l'appel complet à cachedWrite OU au branchement
                                // manuel existant — undoableWrite ne regarde jamais
                                // à l'intérieur, juste avant/après
  options?: UndoableOptions,
): Promise<T> {
  const result = await perform()
  if (options?.record ?? true) {
    // enregistre l'entrée d'historique (planId, entityType, operation, before,
    // after: operation === 'delete' ? null : result, options?.batchId ?? null)
    // — y compris purge et éviction FIFO §3.1
  }
  return result
}
```

**Précision ajoutée en relecture (round 5)** : `perform()` retourne la valeur que
`deleteX`/`createX`/`updateX` retournent déjà normalement (ex. `deleteFeltPoint` ne
retourne que `{ id }`, pas l'objet domaine complet — confirmé dans `cacheThrough.ts`,
overload `delete`). `after` dans `ActionHistoryEntry` (§3.1, `null` pour un `delete`)
n'est donc PAS simplement `result` : `undoableWrite` force `after` à `null` quand
`operation === 'delete'`, indépendamment de ce que `perform()` a retourné, exactement
comme l'interface de §3.1 l'exige. Pour `insert`/`update`, `result` EST déjà l'objet
domaine complet retourné par `createX`/`updateX` — pas de transformation nécessaire dans
ces deux cas.

Chaque fonction de repo concernée gagne un paramètre optionnel final
`options?: UndoableOptions`, transmis tel quel à son appel `undoableWrite`. Plutôt que
de compter sur chaque composant UI pour se souvenir d'enregistrer une action, c'est la
fonction de repo elle-même qui appelle `undoableWrite` — mais désormais avec un
mécanisme explicite (`options.record`) pour que `undo()`/`redo()` (§3.1) puissent
réutiliser cette même fonction SANS déclencher un nouvel enregistrement. Seuls les 6
repos avec au moins une opération annulable du §2 gagnent ce paramètre
(`feltPointsRepo`, `feltSegmentsRepo`, `phenomenaRepo`, `contextObjectsRepo`,
`gridInstancesRepo`, `gridLinesRepo`) ; `plansRepo`, `gridTemplatesRepo` et
`freeformNetworksRepo` n'y touchent pas.

**`before` et `planId` — vérifié précisément fonction par fonction dans le code réel,
les deux repos se comportent différemment :**

- `updateGridInstanceOrigin` (`gridInstancesRepo.ts:70-101`) : lit déjà
  inconditionnellement `existing` du cache AVANT toute branche en ligne/hors-ligne
  (lignes 81-87, patron déjà établi lors du chantier hors-ligne, Task 3.7) — `before`
  est directement `existing`, aucune lecture supplémentaire à ajouter. `GridInstance` a
  un champ `planId` propre (`existing.planId`), donc l'appel `undoableWrite` interne
  peut l'utiliser directement — aucun paramètre `planId` supplémentaire nécessaire sur
  cette fonction.
- `updateAdjustedPoints`/`updateLinePoints` (`gridLinesRepo.ts:196-261`) :
  **actuellement, `existing` n'est lu QUE dans la branche hors-ligne/repli**
  (`getCachedLineOrThrow`, lignes 214/247) — la branche en ligne réussie
  (`tryOnlineLineUpdate` retourne une ligne non nulle) ne lit jamais l'état précédent,
  elle écrit directement la ligne retournée par Supabase dans le cache. **Ce chantier
  modifie ces deux fonctions** pour lire `existing` inconditionnellement, AVANT toute
  branche, exactement comme `updateGridInstanceOrigin` le fait déjà — c'est un vrai
  changement de code, pas juste une réutilisation de logique déjà là. De plus, `GridLine`
  n'a PAS de champ `planId` (seulement `gridInstanceId`, confirmé dans
  `domain/types.ts` et par grep sur tout `gridLinesRepo.ts`) — ces deux fonctions
  gagnent donc un paramètre `planId: string` explicite, fourni par l'appelant (qui le
  connaît déjà — `SiteMapView.tsx` reçoit `planId` en prop), suivant le même principe
  déjà retenu pour `ActionHistoryEntry.planId` lui-même (§3.1 : fourni explicitement,
  jamais déduit de l'indexation propre de l'entité).

**Signatures publiques modifiées — liste complète des 11 fonctions concernées (précisée
en relecture, round 4, et corrigée en relecture round 5 — le décompte affiché en round 4
disait "10", erroné : 8 fonctions `createX`/`deleteX` sur les 4 repos à paire
création/suppression, + `updateGridInstanceOrigin`, + `updateAdjustedPoints`, +
`updateLinePoints` = 11 ; la version d'avant round 4 n'énumérait que ces 3 dernières,
alors que le paragraphe juste au-dessus annonce 6 repos concernés) :**
- `feltPointsRepo` : `createFeltPoint(..., options?: UndoableOptions)`,
  `deleteFeltPoint(id, options?: UndoableOptions)` (`restoreFeltPoint(item)` existe
  aussi, §3.2, mais n'a pas de paramètre `options` — voir §3.2).
- `feltSegmentsRepo` : `createFeltSegment(..., options?: UndoableOptions)`,
  `deleteFeltSegment(id, options?: UndoableOptions)` (+ `restoreFeltSegment(item)`).
- `phenomenaRepo` : `createPhenomenon(..., options?: UndoableOptions)`,
  `deletePhenomenon(id, options?: UndoableOptions)` (+ `restorePhenomenon(item)`).
- `contextObjectsRepo` : `createContextObject(..., options?: UndoableOptions)`,
  `deleteContextObject(id, options?: UndoableOptions)` (+ `restoreContextObject(item)`).
- `gridInstancesRepo` : `updateGridInstanceOrigin(instanceId, x, y, options?: UndoableOptions)`.
- `gridLinesRepo` : `updateAdjustedPoints(lineId, adjustedPoints, planId: string, options?: UndoableOptions)`,
  `updateLinePoints(lineId, theoreticalPoints, adjustedPoints, planId: string, options?: UndoableOptions)`.

`createX` dans les 4 premiers repos n'est en pratique jamais appelée avec
`options.record: false` (aucun chemin d'annuler/refaire ne rappelle `createX` — un
refaire d'insertion utilise `restoreX`, §3.1/§3.2) ni avec `batchId` (aucune création
n'est groupée en lot dans ce chantier) ; le paramètre existe malgré tout par uniformité
avec `deleteX` et pour rester cohérent avec la règle générale du paragraphe précédent
("chaque fonction de repo concernée gagne ce paramètre"), sans code mort réel côté
`undoableWrite` puisque `undoableWrite` reste appelée normalement (juste toujours avec
les valeurs par défaut dans ce cas précis).

`options?: UndoableOptions` est nécessaire pour que le site d'appel du recalage
(ci-dessous) puisse passer un `batchId` partagé, et pour que `undo()`/`redo()` (§3.1)
puissent passer `{ record: false }`.

**Site d'appel du recalage de grille** (`SiteMapView.tsx`, fonction autour de la ligne
448) a déjà `instance.planId` en scope (`GridInstance` le porte). Il génère un
`batchId` (`crypto.randomUUID()`) une fois pour tout le geste, et l'utilise pour
CHAQUE appel de la séquence : `updateGridInstanceOrigin(instance.id, crossing.x,
crossing.y, { batchId })`, puis chaque `updateLinePoints(line.id,
line.theoreticalPoints, line.adjustedPoints, instance.planId, { batchId })` — tous
partagent le même `batchId`, formant un seul lot annulable/refaisable (§3.1). L'appel à
`updateAdjustedPoints` dans `handleLineChanged` (§3.6, glissement de ligne manuel —
cette fonction survit, seul l'empilement dans l'ancien `undoStack` local est retiré)
passe de même le `planId` déjà reçu par `SiteMapView` en prop ; pas de `batchId` dans
ce cas, c'est une action simple à un seul appel.

**Séquentiel, pas `Promise.all`** : le code actuel utilise `Promise.all(...)` pour
lancer toutes les mises à jour de lignes en parallèle (`SiteMapView.tsx:452`). Ce
chantier remplace ce `Promise.all` par une boucle séquentielle (`for...of` avec
`await`) sur les lignes du lot. Raison : chaque `updateLinePoints` réussi déclenche la
logique de purge/éviction FIFO (§3.1), qui lit puis écrit l'état de `action_history`
pour ce plan — plusieurs appels concurrents sur le même plan pourraient interférer
(l'un lit le compte avant que l'autre ait fini d'écrire). Un recalage de grille reste
une action ponctuelle, pas un chemin chaud ; le coût d'une exécution séquentielle
plutôt que parallèle est négligeable pour l'utilisateur (quelques dizaines de lignes au
pire), largement compensé par la garantie de ne pas avoir à raisonner sur des écritures
concurrentes dans `action_history`.

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
mieux — persistant, pas limité à `editMode`, pas limité aux lignes de grille. Les deux
boutons globaux **↶ Annuler** / **↷ Refaire** de la sidebar (§3.4), toujours visibles
pendant le relevé terrain, sont ce qui prend la place du bouton local retiré à cet
endroit précis de l'écran. `handleLineChanged`
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

**Test dédié à la lecture inconditionnelle de `existing` (§3.3, point ajouté en
relecture round 4) — spécifiquement sur la branche en ligne réussie, POUR CHACUNE des
deux fonctions séparément (précisé en relecture round 5 : `updateAdjustedPoints` et
`updateLinePoints` ont chacune leur propre branchement `if (isOnlineNow())` et leur
propre appel à `getCachedLineOrThrow` en repli, `gridLinesRepo.ts:196-224` vs
`229-261` — un test qui ne couvrirait que l'une des deux ne prouverait rien pour
l'autre, une régression sur la fonction non testée passerait inaperçue).** Le bug que
ce chantier corrige est que `updateAdjustedPoints`/`updateLinePoints` ne lisaient
`existing` QUE dans leur branche hors-ligne/repli — un test qui laisserait
`isOnlineNow()` non forcé (donc potentiellement toujours hors-ligne dans l'environnement
de test) passerait même si cette correction n'était jamais implémentée, et ne
prouverait rien. **Deux tests distincts, un par fonction** : chacun force explicitement
`isOnlineNow()` à `true` et `tryOnlineLineUpdate` à réussir (mock), puis vérifie que le
`before` enregistré dans `action_history` correspond bien à l'état PRÉ-mise à jour de la
ligne — pas `undefined`, pas l'état post-mise à jour, pas une erreur — pour prouver que
la lecture de `existing` a bien lieu AVANT l'appel réseau sur ce chemin précis,
symétriquement au test déjà décrit ci-dessus pour le chemin hors-ligne.

**Test dédié à la non-réenregistrement de undo()/redo() (§3.1, point critique)** :
créer une action réelle (ex. `createFeltPoint`), l'annuler, puis vérifier
explicitement que le nombre TOTAL d'entrées dans `action_history` pour ce plan n'a
PAS augmenté après l'annulation (seul le champ `undone` de l'entrée existante a
changé). Ensuite, appeler `undo()` une seconde fois sur ce même plan (pile déjà vide
après le premier undo) et vérifier que c'est un no-op — PAS une ré-annulation de la
même entrée, PAS la création d'une entrée fantôme. Ce test aurait attrapé le bug de
ré-enregistrement identifié en relecture.

**Test dédié au dispatch refaire d'une insertion (§3.1, point critique)** : créer une
action réelle (`createFeltPoint`), l'annuler (supprime l'entité), puis la refaire.
Vérifier que le point ressenti réapparaît avec le MÊME id que l'original (pas un id
généré à nouveau), et que le nombre d'entités dans le cache local est bien revenu à ce
qu'il était avant l'annulation (pas deux entités si un nouvel id avait été généré par
erreur). Vérifier ensuite qu'annuler à nouveau ce refaire fonctionne correctement
(supprime bien la bonne entité, celle avec l'id d'origine). **Vérifier aussi (précisé en
relecture round 4, pour couvrir `restoreX` par le même test de non-réenregistrement que
celui décrit ci-dessus pour `deleteX`)** que le nombre TOTAL d'entrées dans
`action_history` pour ce plan n'a PAS augmenté ni pendant l'annulation ni pendant le
refaire (seul le champ `undone` de l'entrée d'origine change, dans un sens puis dans
l'autre) — ce test couvre spécifiquement `restoreX`, qui n'appelle jamais
`undoableWrite` (§3.2) et doit donc être vérifié séparément du test de non-
réenregistrement ci-dessus, qui ne couvre que `deleteX`.

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

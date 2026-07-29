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
annulable que si le repo expose déjà les deux directions nécessaires — soit une paire
création/suppression existante (l'annulation de la suppression utilise la nouvelle
`restoreX`, §3.2), soit une mise à jour qui peut être réappliquée dans l'autre sens.
Une création sans suppression existante reste hors périmètre plutôt que de justifier
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

### 3.1 Mécanisme central : actions compensatoires

Chaque action annulable enregistre un instantané complet dans un nouveau store
IndexedDB, `action_history` :

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
  undone: boolean
  createdAt: string
}
```

**Annuler** = trouve la dernière entrée non annulée (`undone: false`, `id` maximum)
pour le plan courant, applique l'inverse :
- `insert` → appelle la fonction `deleteX` déjà existante du repo concerné.
- `delete` → appelle une nouvelle fonction `restoreX(item)` (une par repo concerné —
  voir §3.2) qui réinsère l'objet exact avec son id d'origine.
- `update` → appelle la fonction `updateX` déjà existante avec les valeurs de
  `before`.

Puis marque l'entrée `undone: true`.

**Refaire** = trouve la plus ANCIENNE entrée annulée (`undone: true`, `id` minimum
parmi les annulées — les entrées annulées forment toujours un suffixe contigu du plus
récent au plus ancien non-encore-refait, grâce à la purge décrite ci-dessous),
réapplique l'action d'origine (même logique que l'action initiale, vers `after` au
lieu de `before` pour un update), marque l'entrée `undone: false`.

**Purge sur nouvelle action** : dès qu'une nouvelle action (autre qu'un
annuler/refaire) est enregistrée pour un plan, TOUTES les entrées `undone: true` de ce
plan sont supprimées avant d'insérer la nouvelle — comportement standard de tout
éditeur (impossible de "refaire" une branche qu'une nouvelle action a rendue
obsolète).

**Éviction FIFO à 10** : après insertion d'une nouvelle entrée (non-undo/redo), si le
plan a plus de 10 entrées au total, la plus ancienne (`id` minimum pour ce `planId`)
est supprimée. La limite est **par plan**, pas globale.

### 3.2 Nouvelle primitive par repo : `restoreX`

Les 4 repos concernés par ce chantier qui ont création+suppression annulables
(`feltPointsRepo`, `feltSegmentsRepo`, `phenomenaRepo`, `contextObjectsRepo`) gagnent
une fonction `restoreX(item: X): Promise<X>` qui réinsère l'objet domaine complet
(id compris) via `cachedWrite('insert', ...)`, en sautant la génération d'un nouvel id
(contrairement à `createX`, qui génère toujours un id neuf). `gridInstancesRepo` et
`gridLinesRepo` n'ont besoin d'aucune `restoreX` : seules leurs opérations de mise à
jour sont annulables (§2), et annuler une mise à jour utilise la fonction de mise à
jour déjà existante, jamais une réinsertion. `freeformNetworksRepo` est explicitement
exclu de l'annulation (§2), donc n'a pas besoin de `restoreX` non plus.

### 3.3 Wrapper d'enregistrement : `undoableWrite`

Plutôt que de compter sur chaque composant UI pour se souvenir d'enregistrer une
action, un petit wrapper `undoableWrite(planId, entityType, operation, before, after,
writer: () => Promise<T>): Promise<T>` s'intercale entre chaque fonction de repo
concernée et son `cachedWrite`/`cachedList` déjà existant : il exécute l'écriture
normale, puis (si elle réussit) enregistre l'entrée d'historique — y compris la purge
et l'éviction FIFO décrites en §3.1. Seuls les 6 repos avec au moins une opération
annulable du §2 l'utilisent (`feltPointsRepo`, `feltSegmentsRepo`, `phenomenaRepo`,
`contextObjectsRepo`, `gridInstancesRepo`, `gridLinesRepo`) ; `plansRepo`,
`gridTemplatesRepo` et `freeformNetworksRepo` n'y touchent pas.

Pour les opérations `update` (recalage de grille, édition de ligne), le `before` est
déjà naturellement disponible : les fonctions concernées (`updateGridInstanceOrigin`,
`updateAdjustedPoints`/`updateLinePoints`) lisent déjà l'entité existante du cache
avant de la patcher (patron établi lors du chantier hors-ligne, Task 3.7/4.1) — pas de
lecture supplémentaire à ajouter.

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

## 4. Tests

Pour chaque repo concerné : test de la nouvelle fonction `restoreX` (réinsère avec
l'id d'origine, pas un nouvel id généré). Pour le mécanisme central : purge sur
nouvelle action, éviction FIFO à 10 par plan (pas globale), annuler/refaire une
séquence insert→update→delete et vérifier l'état final du cache à chaque étape,
persistance de l'historique après un rechargement simulé (fermeture/réouverture de la
connexion IndexedDB). Pour l'UI : boutons grisés quand la pile est vide, clic
déclenche bien la bonne fonction de repo selon `entityType`/`operation`.

## 5. Ce qui ne change pas

Le mode hors-ligne déjà livré (cache-through, synchro, indicateur) et le chantier
"erreurs non bloquantes" (upload plan intérieur, calibration, bilan global) restent
inchangés — ce chantier n'ajoute que de nouvelles fonctions et un nouveau store,
aucune modification de l'existant en dehors de l'ajout de l'appel à `undoableWrite`
dans les fonctions de repo concernées.

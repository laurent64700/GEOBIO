# Suppression de mission — Design

## 1. Contexte et objectif

Demandé par Laurent le 31/07/2026 : aucun moyen de supprimer une mission depuis
l'app. 13 missions de test/doublons ont dû être supprimées manuellement via un
script Node ponctuel le 31/07/2026, en attendant cette fonctionnalité.

Point technique déjà vérifié avant cette spec : toutes les clés étrangères issues
de `mission` sont `on delete cascade` (confirmé dans les migrations Supabase) — un
simple `DELETE FROM mission WHERE id = ...` suffit côté données pour supprimer
proprement la mission et tout ce qui en dépend en base (plans et tout ce qui
référence `mission_id`/`plan_id` en cascade — pas d'énumération exhaustive ici,
volontairement, pour ne pas devoir maintenir cette liste à chaque nouvelle table ;
voir les migrations pour le détail exact). **Ne couvre pas tout, cependant** —
voir §5bis (Storage) et §7 (cache IndexedDB local) pour les deux exceptions
identifiées. Le travail de cette spec est le câblage UI, `deleteMission` lui-même,
et ces deux nettoyages complémentaires.

## 2. Périmètre

**Inclus** :
- Une fonction `deleteMission` dans `missionsRepo.ts`.
- Un déclencheur de suppression à 2 endroits, menant au même dialogue de
  confirmation et à la même fonction :
  1. Un bouton/icône par ligne dans `MissionList.tsx` (liste des missions).
  2. Un item "Supprimer la mission" dans le menu Fichier de `MenuBar.tsx` (mission
     actuellement ouverte), avec un séparateur avant "Quitter la mission".
- Un composant de confirmation dédié (pas de `window.confirm()` natif — aucun
  usage de ce type ailleurs dans le codebase ; tout est en composants React
  testables, cohérent avec le pattern déjà établi dans `MenuBar.tsx` pour
  `saveError`/`missionInfoOpen`).
- Nettoyage de `current_session` (cache IndexedDB de reprise hors-ligne, voir §5)
  si elle référence la mission supprimée.
- Nettoyage des fichiers Supabase Storage (photos terrain + image de plan
  intérieur calibrée) associés à la mission — voir §5bis. Décision explicite de
  Laurent (07/08/2026) après que la revue du spec ait signalé que la cascade en
  base ne couvre pas le Storage.

**Explicitement non inclus (confirmé avec Laurent)** :
- **Suppression multiple** (cases à cocher + suppression en masse) — décision
  explicite : "une à la fois suffit", le besoin de nettoyage de doublons reste rare.
- **Support hors-ligne** — la suppression nécessite d'être en ligne (voir §4).
  Aucune mise en file d'attente dans le système de synchronisation existant.
- **Confirmation renforcée** (retaper le nom/l'adresse) — décision explicite :
  une confirmation simple à un clic suffit.
- **Suppression douce / corbeille / récupération** — la suppression reste
  définitive et immédiate, comme le nettoyage manuel déjà effectué le 31/07/2026.
  Aucune demande de récupération n'a été faite.

## 3. Le dialogue de confirmation

Nouveau composant partagé `src/components/ConfirmDialog.tsx` (utilisé depuis
`MissionList.tsx` et `MenuBar.tsx`/`MissionWorkspace.tsx` — ni l'un ni l'autre
n'est un emplacement naturel pour "posséder" ce composant, d'où un fichier
dédié plutôt qu'un import croisé). Reprend le même style de panneau flottant
que `FLOATING_PANEL_STYLE` dans `MenuBar.tsx` (overlay, bordure, `position:
absolute` ancré à un parent `position: relative` — pas d'ombre : la vraie
constante `MenuBar.tsx:57-67` n'a pas de `boxShadow`, à ne pas inventer) mais
défini localement dans `ConfirmDialog.tsx` — cette constante est privée au
module `MenuBar.tsx` (non exportée), et créer une dépendance d'export depuis un
fichier spécifique à une fonctionnalité vers un composant générique serait un
mauvais sens de couplage :

```
Supprimer la mission ?

«{adresse} — {date}»

Cette action est irréversible.

[Annuler]              [Supprimer]
```

**Positionnement dans `MissionList.tsx`** : `FLOATING_PANEL_STYLE` (le modèle
repris ci-dessus) suppose un parent `position: relative` immédiat, comme
`MENU_TRIGGER_WRAPPER_STYLE` dans `MenuBar.tsx` — `MissionList.tsx` n'a
aujourd'hui aucun wrapper de ce type autour de ses boutons de ligne (`<li>
<button>` simple). Un wrapper `position: relative` équivalent doit être ajouté
autour de la ligne concernée pour ancrer le dialogue à côté du bouton
supprimer cliqué (pas de nouvelle convention visuelle à inventer, juste
reproduire le même wrapper que `MenuBar.tsx` utilise déjà).

- "Annuler" ferme le dialogue sans effet.
- "Supprimer" appelle `deleteMission(id)`, désactive les deux boutons pendant
  l'appel (garde-fou anti-double-clic, même pattern que "Enregistrer sous" —
  voir le chantier ruban/menus du 07/08/2026, où l'absence de ce garde-fou sur
  une action similaire avait été un vrai bug trouvé en revue).
- En cas d'échec réseau : message d'erreur inline dismissible dans le même
  dialogue (pas de page bloquante), le dialogue reste ouvert pour réessayer.
- En cas de succès : le dialogue se ferme et l'appelant (`MissionList` ou
  `MenuBar`/`MissionWorkspace`) gère la suite (§4).

## 4. Les deux points d'entrée

### 4.1 Depuis `MissionList.tsx`

Un bouton/icône supprimer à côté du bouton existant de sélection de mission,
sur chaque ligne. Après confirmation et suppression réussie : la mission
disparaît de la liste affichée (retrait local de l'état `missions`, pas besoin
de refaire un `listMissions()` complet).

### 4.2 Depuis `MenuBar.tsx` (mission actuellement ouverte)

Nouvel item "Supprimer la mission" dans le menu Fichier, entre "Imprimer"
(réservé) et "Quitter la mission", séparé visuellement de "Quitter la mission"
(action destructive vs. action neutre — éviter qu'un clic imprécis sur l'un
déclenche l'autre). Nouvelle prop `onDeleteMission: () => Promise<void>` sur
`MenuBarProps`, même convention que `onDuplicateMission`.

Câblage dans `MissionWorkspace.tsx`/`App.tsx` : après suppression réussie de la
mission actuellement ouverte,
1. si `current_session` (voir §5) référence cette mission, la vider ;
2. naviguer vers la liste des missions (réutilise `onNavigateToMissionList`,
   déjà câblé et déjà responsable de rafraîchir `listMissions()`).

### 4.3 État hors-ligne

Aux deux endroits, le déclencheur de suppression est désactivé avec une
infobulle explicite ("Nécessite une connexion") quand l'app est hors-ligne —
même détection de connectivité que le reste de l'app
(`src/offline/connectivity.ts`).

## 5. Cohérence de `current_session`

`src/offline/currentSession.ts` : un cache IndexedDB local (mission + plan
extérieur), lu **uniquement** au démarrage de l'app si hors-ligne
(`App.tsx:22-37`), pour permettre de reprendre la dernière mission travaillée
sans connexion. Il n'est aujourd'hui jamais vidé (seulement écrasé à la création/
reprise d'une mission) — `currentSession.ts` n'exporte que `getCurrentSession`/
`setCurrentSession`, aucune fonction de suppression n'existe encore.

Comme la suppression est désormais possible, un cas de correction devient
nécessaire : si la mission supprimée est celle actuellement en cache dans
`current_session`, il faut la vider. Sans ça, un démarrage hors-ligne futur
pourrait tenter de "reprendre" une mission qui n'existe plus côté serveur,
un état incohérent (les données resteraient visibles localement — le cache
IndexedDB des entités elles-mêmes n'est pas purgé, voir §7 — mais plus jamais
synchronisables). **Ajout nécessaire** : une nouvelle fonction
`clearCurrentSession(): Promise<void>` dans `currentSession.ts` (`db.delete
('current_session', SESSION_KEY)`, même wrapper `idb` que les 2 fonctions
existantes du fichier).

Ce cas ne peut se produire que via la suppression **depuis le menu Fichier**
(§4.2) — supprimer une mission depuis la liste (§4.1) ne concerne jamais la
mission actuellement en cache, puisque `MissionList` n'est affichée que quand
aucune mission n'est ouverte.

## 5bis. Nettoyage Supabase Storage

Deux buckets stockent des fichiers binaires indépendamment des lignes
Postgres, avec un chemin préfixé par `missionId` dans les deux cas :
- `mission-photos` (`src/data/missionPhotosRepo.ts`) : `${missionId}/<uuid>.<ext>`
- `plans` (`src/data/planImageStorage.ts`) : `${missionId}/interior-plan.<ext>`

Le cascade en base supprime les LIGNES (`mission_photo`, `plan.image_url`) mais
jamais les fichiers eux-mêmes dans Storage — sans nettoyage explicite, ils
resteraient orphelins indéfiniment à chaque suppression de mission.

**Ordre d'exécution dans `deleteMission`** : la suppression en base (`DELETE
FROM mission`) est l'étape critique et atomique — elle doit passer en premier.
Le nettoyage Storage se fait **après**, en best-effort : `storage.from(bucket)
.list(missionId)` puis `.remove(paths)` pour les 2 buckets. Point d'attention
pour le plan : `.list(prefix)` retourne des noms d'objets RELATIFS au préfixe
(`entry.name`), pas des chemins complets — `.remove()` a besoin du chemin
complet reconstruit (`` `${missionId}/${entry.name}` ``), pas des noms bruts
retournés par `.list()`. Si le nettoyage
Storage échoue (réseau, permissions...), **la suppression de la mission n'est
pas annulée ni signalée en échec** — la mission a déjà été effectivement
supprimée (le but demandé par Laurent), et un échec de nettoyage Storage ne
fait que réintroduire le même orphelinage que §7 décrit déjà pour le cache
local, pas une régression fonctionnelle pour l'utilisateur. Erreur silencieuse
acceptée (pas de blocage, pas de message affiché) — nettoyer proactivement
dans le cas courant, sans faire de la robustesse Storage un nouveau point de
blocage pour l'action réellement demandée.

*(Raison de l'ordre DB-puis-Storage plutôt que l'inverse : si le nettoyage
Storage passait en premier et que la suppression en base échouait ensuite —
ex. coupure réseau entre les deux appels — la mission resterait affichée dans
l'app avec des photos/plan cassés, un état visiblement dégradé pire que de
simples fichiers orphelins invisibles côté utilisateur.)*

## 6. Gestion d'erreur

Suit le pattern déjà établi dans `MenuBar.tsx` pour "Enregistrer"/"Enregistrer
sous" : erreur best-effort affichée en ligne, dismissible, jamais de page
bloquante (`phase: 'error'`). Un échec de la requête `DELETE FROM mission`
elle-même (l'étape critique et atomique, avant tout nettoyage Storage — voir
§5bis) n'a pas d'effet destructif partiel possible : soit la mission est
supprimée et son cascade complet avec elle, soit rien n'a changé. Le seul état
"partiel" possible est celui volontairement accepté en §5bis (mission
supprimée mais nettoyage Storage best-effort en échec) — jamais signalé comme
une erreur à l'utilisateur, puisque l'action demandée (supprimer la mission) a
bien réussi.

## 7. Hors périmètre technique (décision assumée, pas un oubli)

Le cache IndexedDB local des entités de la mission supprimée (plans, points
ressentis, segments, grilles, photos, historique d'annulation — le système de
cache-through du chantier hors-ligne) n'est **pas** purgé activement par cette
fonctionnalité. Ces entrées deviennent orphelines (jamais plus référencées,
puisque la mission n'apparaît plus dans `listMissions()`) mais inoffensives :
occupent un peu d'espace de stockage local, ne réapparaissent jamais dans
l'UI, ne causent aucun bug fonctionnel. Une purge active serait un travail
supplémentaire disproportionné par rapport au problème réel (quelques Ko par
mission supprimée, pas un volume préoccupant pour un usage solo).

**Risque accepté, non traité** (même famille que la limite déjà documentée
dans `useOfflineSync.ts`) : si des mutations hors-ligne en attente
(`pending_mutations`) existent pour des entités de la mission au moment où
elle est supprimée (cas rare, puisque la suppression exige d'être en ligne —
§4.3 — mais des mutations mises en file *avant* le retour en ligne pourraient
ne pas avoir fini de se synchroniser au moment précis du clic sur Supprimer),
ces mutations en attente tenteraient de se rejouer contre des lignes qui
n'existent plus, et échoueraient de façon permanente. Impact borné : ces
mutations resteraient en échec silencieux dans la file, sans corrompre autre
chose ni bloquer le reste de la synchronisation — cohérent avec le niveau de
risque déjà accepté ailleurs dans le système hors-ligne existant.

## 8. Tests

- `deleteMission` (`missionsRepo.test.ts`) : appelle bien `supabase.from('mission')
  .delete().eq('id', ...)`, propage une erreur réseau de la requête DB ; appelle
  le nettoyage Storage des 2 buckets (§5bis) après le succès du DELETE, et une
  erreur de nettoyage Storage n'empêche pas `deleteMission` de résoudre avec
  succès (best-effort, voir §5bis/§6).
- `clearCurrentSession` (`currentSession.test.ts`) : vide bien l'entrée
  `current_session`, `getCurrentSession` retourne `null` ensuite.
- `ConfirmDialog.tsx` (nouveau fichier de test) : "Annuler" ne déclenche pas
  l'action fournie, "Supprimer" l'appelle, désactivation des 2 boutons pendant
  l'appel en cours (garde-fou anti-double-clic), affichage d'erreur dismissible
  en cas d'échec, le dialogue reste ouvert après une erreur.
- `MissionList.tsx` : bouton supprimer visible par mission, ouvre la
  confirmation, retire la mission de la liste affichée après succès, désactivé
  hors-ligne.
- `MenuBar.tsx` : item "Supprimer la mission" visible dans Fichier, désactivé
  hors-ligne, appelle `onDeleteMission` après confirmation.
- `MissionWorkspace.tsx`/`App.tsx` : après suppression réussie de la mission
  ouverte, navigation vers la liste des missions ; `current_session` vidée si
  elle référençait la mission supprimée, inchangée sinon.

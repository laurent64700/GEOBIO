# Suppression de mission — Design

## 1. Contexte et objectif

Demandé par Laurent le 31/07/2026 : aucun moyen de supprimer une mission depuis
l'app. 13 missions de test/doublons ont dû être supprimées manuellement via un
script Node ponctuel le 31/07/2026, en attendant cette fonctionnalité.

Point technique déjà vérifié avant cette spec : toutes les clés étrangères issues
de `mission` sont `on delete cascade` (confirmé dans les migrations Supabase) — un
simple `DELETE FROM mission WHERE id = ...` suffit côté données pour supprimer
proprement la mission et tout ce qui en dépend (plans, points ressentis, segments,
grilles, phénomènes, objets de contexte, photos, historique d'annulation). Le
travail de cette spec est uniquement côté UI.

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

Composant partagé (2 points d'appel), affiché en overlay/panneau flottant,
cohérent visuellement avec les panneaux déjà utilisés dans `MenuBar.tsx`
(`FLOATING_PANEL_STYLE`) plutôt qu'une nouvelle convention visuelle :

```
Supprimer la mission ?

«{adresse} — {date}»

Cette action est irréversible.

[Annuler]              [Supprimer]
```

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
reprise d'une mission).

Comme la suppression est désormais possible, un cas de correction devient
nécessaire : si la mission supprimée est celle actuellement en cache dans
`current_session`, il faut la vider. Sans ça, un démarrage hors-ligne futur
pourrait tenter de "reprendre" une mission qui n'existe plus côté serveur,
un état incohérent (les données resteraient visibles localement — le cache
IndexedDB des entités elles-mêmes n'est pas purgé, voir §7 — mais plus jamais
synchronisables).

Ce cas ne peut se produire que via la suppression **depuis le menu Fichier**
(§4.2) — supprimer une mission depuis la liste (§4.1) ne concerne jamais la
mission actuellement en cache, puisque `MissionList` n'est affichée que quand
aucune mission n'est ouverte.

## 6. Gestion d'erreur

Suit le pattern déjà établi dans `MenuBar.tsx` pour "Enregistrer"/"Enregistrer
sous" : erreur best-effort affichée en ligne, dismissible, jamais de page
bloquante (`phase: 'error'`). Un échec de suppression n'a pas d'effet
destructif partiel possible (une seule requête DELETE, atomique côté Supabase)
— pas de risque d'état à moitié supprimé.

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

## 8. Tests

- `deleteMission` (`missionsRepo.test.ts`) : appelle bien `supabase.from('mission')
  .delete().eq('id', ...)`, propage une erreur réseau.
- Composant de confirmation : "Annuler" ne supprime pas, "Supprimer" appelle la
  fonction fournie, désactivation pendant l'appel en cours (garde-fou
  anti-double-clic), affichage d'erreur en cas d'échec.
- `MissionList.tsx` : bouton supprimer visible par mission, ouvre la
  confirmation, retire la mission de la liste affichée après succès, désactivé
  hors-ligne.
- `MenuBar.tsx` : item "Supprimer la mission" visible dans Fichier, désactivé
  hors-ligne, appelle `onDeleteMission` après confirmation.
- `MissionWorkspace.tsx`/`App.tsx` : après suppression réussie de la mission
  ouverte, navigation vers la liste des missions ; `current_session` vidée si
  elle référençait la mission supprimée, inchangée sinon.

# Ruban d'outils fixe + menus Fichier/Modifier/Affichage — Design

**Statut : à relire (spec-document-reviewer).**

**Phase 1 sur 4 d'une refonte plus large** (voir §2 Périmètre) : cette spec couvre
uniquement la fondation (disposition + menus). Les 3 phases suivantes — fusion
Placer/Tracer, formes calibrables en taille réelle, annotation texte — sont des
sous-projets séparés, chacun avec sa propre spec/plan à venir après celle-ci.

## 1. Contexte et objectif

Laurent (géobiologue) a testé l'app en conditions réelles le 06/08/2026 et remonté
un problème récurrent : les fonctions de base (Annuler/Refaire, placer un point
ressenti, ligne guide, tracer eau/faille...) sont dispersées dans des accordéons
repliés par défaut — "arborescences complexes". Plusieurs de ses signalements du
jour ("je n'arrive pas à placer un phénomène", "pas réussi à tracer eau/faille")
se sont révélés être des cas où l'action fonctionnait réellement, mais restait
invisible ou introuvable derrière une section repliée ou une case à cocher qu'il
ne savait pas devoir chercher.

Référence donnée par Laurent : Microsoft Paint — une barre d'outils fixe, toujours
visible, plus un menu Fichier/Modifier/Affichage classique. Objectif : reprendre
cette disposition (fonctionnelle, pas esthétique — même principe déjà acté le
21/07/2026 : "je ne veux pas de design je veux du fonctionnel pur : comme Paint",
voir `Sidebar.tsx`) pour que les actions les plus fréquentes soient immédiatement
visibles et accessibles, sans accordéon à ouvrir.

## 2. Périmètre

**Inclus dans cette spec (Phase 1)** :
- Une nouvelle barre horizontale fixe en haut de l'écran, contenant : Annuler/
  Refaire (`UndoRedoControls`, actuellement dans le panneau latéral), le bouton
  Ligne guide (actuellement dans un accordéon), et 2 emplacements réservés pour
  les boutons Placer/Tracer de la Phase 2 (non fonctionnels dans cette phase —
  voir §5).
- Un menu Fichier/Modifier/Affichage (3 menus déroulants), avec le contenu détaillé
  en §4.
- La dépendance `@radix-ui/react-dropdown-menu` pour les menus déroulants.

**Explicitement NON touché par cette spec** (confirmé avec Laurent le 06/08/2026,
reste dans le panneau latéral gauche existant, sans changement de structure) :
- "Grille/Réseaux" (`GridCreationPanel`)
- "Calques" (`LayerPanel`)
- Le bandeau de bilan global (`GlobalAssessmentBar`) — sa réduction/repli éventuelle
  est un sujet séparé, pas dans cette spec
- Tous les pickers/outils de placement existants (`FeltPointPicker`,
  `PhenomenonPicker`, `ContextObjectPicker`, `FreeformDrawTool` + ses boutons
  eau/faille) — ils continuent de fonctionner exactement comme aujourd'hui, à leur
  emplacement actuel dans le panneau latéral, jusqu'à la Phase 2

**Non inclus, phases futures séparées** (chacune sa propre spec/plan) :
- Phase 2 : fusion de "point ressenti + phénomène + objet de contexte" dans un
  bouton **Placer** unique, et de "eau + faille" dans un bouton **Tracer** unique
  (glisser, réutilise `FreeformDrawTool`), chacun avec une palette d'icônes/couleurs
  à sens métier fixe (pas de choix libre — confirmé avec Laurent).
- Phase 3 : rendre les icônes de phénomènes/objets de contexte redimensionnables à
  l'échelle réelle du terrain (même principe que `networkWidths.ts`/
  `metersPerPixel.ts` déjà utilisé pour l'épaisseur des réseaux).
- Phase 4 : nouvel outil d'annotation texte (boîte de texte déplaçable/
  redimensionnable, éditable sur place, façon Paint) — fonctionnalité entièrement
  nouvelle, aucune donnée équivalente n'existe aujourd'hui.

## 3. Disposition

Nouveau composant `Toolbar.tsx`, rendu par `App.tsx` (ou `MissionWorkspace.tsx` —
voir §6) au-dessus de `SiteMapView`, en position fixe pleine largeur, hauteur fixe
(à définir en plan, ~48px). Contenu, de gauche à droite :

1. Menu Fichier / Modifier / Affichage (3 `DropdownMenu` Radix, voir §4)
2. Séparateur visuel
3. Annuler / Refaire (composant `UndoRedoControls` existant, déplacé ici depuis le
   panneau latéral)
4. Séparateur visuel
5. Bouton Ligne guide (déplacé ici depuis son accordéon actuel — reste sa logique
   actuelle telle quelle, seul l'emplacement bouge)
6. Séparateur visuel
7. Emplacements réservés (rendus mais désactivés/grisés, avec une info-bulle
   "Bientôt disponible") pour les futurs boutons **Placer** et **Tracer** de la
   Phase 2 — les rendre visibles dès cette phase-ci évite un 2e réagencement visuel
   la semaine suivante

`SiteMapView`'s `Sidebar` perd son bloc `pinned` actuel pour `UndoRedoControls`
(remplacé par les autres éléments de `pinned`, à savoir `FeltPointPicker` — qui
reste en place, Phase 2 uniquement le déplacera/fusionnera) ; la section accordéon
"Ligne guide" est supprimée de `Sidebar`'s `sections` (son contenu — les boutons de
relèvement N/S/E/O, la saisie d'angle personnalisé — migre dans le composant
Toolbar, probablement sous forme de menu déroulant propre au bouton Ligne guide
plutôt que dans la barre elle-même, pour ne pas surcharger la hauteur fixe — détail
à trancher en plan).

## 4. Contenu des menus

Toute action ci-dessous existe déjà dans le code (voir référence) sauf mention
contraire.

### Fichier
| Libellé | Action |
|---|---|
| Nouvelle mission | Navigue vers le formulaire de création de mission (`MissionForm`) |
| Mes missions | Retour à la liste des missions (`MissionList`) |
| Infos de la mission | Ouvre l'affichage des infos mission existantes (adresse, date, parcelles) |
| Enregistrer | **Nouveau comportement** — force une tentative de synchronisation immédiate de la file d'attente hors-ligne. Réutilise `flushPendingMutations()` (`src/offline/sync.ts`, déjà utilisé automatiquement par `useOfflineSync` au montage et à la reconnexion) — `useOfflineSync` doit exposer un déclencheur manuel supplémentaire dans son objet retourné, réutilisant le même verrou anti-concurrence (`flushingRef`) que les 2 déclencheurs automatiques existants, pas une 2e implémentation parallèle. Le badge `OfflineIndicator` existant (déjà rendu en permanence dans `App.tsx`) reflète le résultat — pas de UI de succès/échec dédiée à construire en plus |
| Enregistrer sous | **Nouvelle fonctionnalité** — duplique la mission actuelle (mission + tous ses plans/points/segments/grilles/etc.) sous un nouveau nom. Aucune fonction de duplication n'existe aujourd'hui dans `missionsRepo.ts` — à spécifier en détail dans le plan (quelle profondeur de copie exactement, quel nom par défaut proposer) |
| Imprimer | Alias de "Générer le rapport" (même action déclenchée par les 2 libellés — confirmé avec Laurent) — la génération de rapport elle-même reste hors périmètre de cette spec (chantier "Preview terrain + Rapport final" jamais commencé, voir mémoire projet) |
| Quitter la mission | Retour à l'écran d'accueil / liste des missions |

### Modifier
| Libellé | Action |
|---|---|
| Annuler | Redondant avec le bouton dans la barre (§3) — présent aussi ici par convention logicielle standard (Laurent : "comme dans tous les softs basiques") |
| Refaire | Idem |
| Supprimer l'élément sélectionné | **Portée à clarifier en plan** — aujourd'hui, la suppression se fait déjà par élément (ex. `deleteFeltPoint`), mais il n'existe pas de notion globale "élément actuellement sélectionné" dans l'état de `SiteMapView` ; nécessite soit d'introduire cette notion, soit de limiter cette entrée de menu aux contextes où une sélection existe déjà (ex. calibration de grille) |

### Affichage
| Libellé | Action |
|---|---|
| Zoom + / Zoom − | Contrôles déjà présents sur la carte (`MapView`) — dupliqués ici par convention |
| Recentrer sur les parcelles | **Nouveau** — recoupe la demande "perte de repère au dézoom" du 06/08/2026 (mémoire projet), mais reste un sujet séparé (pas détaillé ici, à spécifier avec le reste des demandes de recentrage/zoom si repris) |
| Basculer Calques | Ouvre/ferme la section accordéon "Calques" existante dans le panneau latéral |
| Fond de carte | **Nouveau** — bascule entre le fond satellite IGN actuel et un aplat neutre. Recoupe la demande du 06/08/2026 ("je n'ai pas besoin de l'image, un aplat suffit quand le zoom doit être plus fort") — sujet séparé, pas détaillé ici |
| Mode édition | Bascule la variable `editMode` déjà existante dans `SiteMapView` (actuellement un bouton dédié quelque part dans l'UI — à localiser en plan et migrer son déclenchement ici, sans dupliquer l'état) |

**Note de portée** : plusieurs entrées ci-dessus ("Recentrer sur les parcelles",
"Fond de carte") ne font que republier au bon endroit des demandes déjà notées en
mémoire projet mais pas encore spécifiées en détail — cette spec les positionne
dans le menu sans en définir le comportement précis ; à traiter dans une spec
dédiée si/quand Laurent les priorise, pas dans le plan issu de cette spec-ci.

## 5. Emplacements réservés Placer/Tracer

Pour éviter 2 réorganisations visuelles successives (une pour le ruban, une autre
la semaine suivante pour Placer/Tracer), la Phase 1 rend déjà 2 boutons désactivés
à leur emplacement final dans la barre, sans aucune logique derrière (juste
`disabled`, avec une info-bulle). La Phase 2 les active et y branche la vraie
logique — elle ne touche donc pas à nouveau la disposition de la barre elle-même.

## 6. Composants et dépendances

**Nouveau** :
- `src/components/Toolbar.tsx` — la barre elle-même, structure uniquement (les
  éléments qu'elle contient sont pour la plupart des composants déjà existants,
  simplement déplacés)
- `src/components/MenuBar.tsx` (ou intégré à `Toolbar.tsx`, à trancher en plan) —
  les 3 `DropdownMenu` Radix

**Dépendance ajoutée** : `@radix-ui/react-dropdown-menu` — primitive *headless*
(comportement clavier/focus/clic-extérieur géré, zéro style visuel imposé), choisie
plutôt qu'une librairie de "ruban" complète (type Fluent UI) qui imposerait un
habillage visuel à défaire pour rester cohérent avec le principe "fonctionnel pur"
déjà acté (`Sidebar.tsx`). Aucune autre dépendance nouvelle : les boutons d'icônes,
séparateurs, et la palette (Phase 2) réutilisent les patterns déjà en place dans le
code (`aria-pressed`, boutons simples).

**Modifiés** :
- `App.tsx` (ou `MissionWorkspace.tsx`) — rend `Toolbar` au-dessus de la carte
- `SiteMapView.tsx` — retire `UndoRedoControls` de `Sidebar`'s `pinned`, retire la
  section accordéon "Ligne guide" de `Sidebar`'s `sections`
- `Sidebar.tsx` — vérifier si sa mise en page pleine hauteur doit se décaler
  verticalement pour laisser la place à la nouvelle barre fixe en haut (probable,
  à confirmer en plan avec les vraies dimensions)
- `src/hooks/useOfflineSync.ts` — expose un déclencheur de synchronisation manuelle
  en plus des 2 déclencheurs automatiques existants (voir §4, entrée "Enregistrer")
- `src/data/missionsRepo.ts` — nouvelle fonction de duplication de mission (voir §4,
  entrée "Enregistrer sous")

## 7. Gestion des erreurs

- **Enregistrer (sync forcée)** : `flushPendingMutations()` ne lève jamais
  d'exception à l'appelant (chaque échec individuel est capturé en interne, voir
  `sync.ts`) — rien à gérer côté menu au-delà de déclencher l'appel ; le badge
  `OfflineIndicator` reflète l'état réel après coup.
- **Enregistrer sous (duplication)** : peut échouer (réseau, ou mission source
  partiellement chargée) — afficher une erreur dismissible, sur le modèle des
  erreurs non-bloquantes déjà en place ailleurs dans `MissionWorkspace.tsx`
  (chantier du 29/07/2026), pas une page d'erreur bloquante.
- **Boutons désactivés (Placer/Tracer réservés, Phase 1)** : aucune action possible,
  donc aucun cas d'erreur.

## 8. Tests

- `Toolbar.test.tsx` : rendu de tous les éléments, `UndoRedoControls` et le bouton
  Ligne guide fonctionnent identiquement à avant (tests de non-régression sur leur
  comportement, pas seulement leur présence).
- `MenuBar.test.tsx` (ou inclus dans `Toolbar.test.tsx`) : chaque item de menu
  déclenche la bonne action ; navigation clavier de base fonctionne (héritée de
  Radix, mais un test de fumée minimal évite une régression de configuration).
- `useOfflineSync.test.ts` : test du nouveau déclencheur manuel, y compris qu'il
  respecte le même verrou anti-concurrence que les déclencheurs automatiques
  (pas de flush concurrent si l'un des 2 chemins est déjà en cours).
- `missionsRepo.test.ts` : nouvelle fonction de duplication — cas nominal + échec
  partiel.
- `SiteMapView.test.tsx` : mise à jour pour refléter le retrait de
  `UndoRedoControls`/Ligne guide de `Sidebar` (probablement des suppressions
  d'assertions plutôt que des ajouts).

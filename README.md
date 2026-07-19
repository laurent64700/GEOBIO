# GEOBIO

Application de diagnostic géobiologique de terrain. GEOBIO assiste le
géobiologue pendant une mission sur site : création de la mission, mesures
globales (causes de nuisance, taux Bovis), pose d'une origine locale sur
orthophoto IGN, génération des réseaux telluriques théoriques (Hartmann,
Curry, Palm, Peyré, Wissmann) avec polarité et lignes renforcées, ajustement
des lignes au ressenti sur la carte, points ressentis, lignes-guides de
marche, calage de plans intérieurs, photos aériennes de mission, et
superposition Bagua (Feng Shui) sur l'emprise du bâtiment détectée via
l'IGN. C'est une PWA pensée pour un usage mobile sur le terrain.

## Stack

- **Vite 8 + React 19 + TypeScript** (strict), PWA via `vite-plugin-pwa`
- **Leaflet / react-leaflet** (fond orthophoto IGN Géoplateforme, WMTS sans clé)
- **leaflet-geoman** pour l'édition des lignes à la souris/au doigt
- **Supabase** (Postgres + Storage, client `supabase-js`) — pas de backend maison
- **Vitest + Testing Library** (jsdom), **oxlint**
- Services externes : WFS IGN Géoplateforme (`data.geopf.fr`) pour parcelles
  cadastrales et emprises de bâtiments (BDTOPO)

## Démarrer en dev

Prérequis : **Node ≥ 20.19** (ou ≥ 22.12 ; le dev se fait actuellement sous Node 24).

```bash
npm install
cp .env.local.example .env.local   # puis remplir les deux valeurs
npm run dev
```

`.env.local` attend l'URL du projet Supabase et la clé anon
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — visibles dans le dashboard
Supabase, projet « GEOBIO LP ».

## Tests et vérifications

```bash
npx vitest run          # suite complète (~153 tests)
npx tsc -b --noEmit     # typecheck strict
npm run lint            # oxlint
```

(Il n'y a pas encore de script `npm test` dans `package.json` — utiliser
`npx vitest run`.)

Convention : les repos Supabase sont testés avec le mock de chaînage
`src/test/supabaseMock.ts` ; les composants carte mockent `MapView` (Leaflet
ne tourne pas sous jsdom).

## Migrations Supabase

Les migrations vivent dans `supabase/migrations/` (numérotées `0001_…`).
Le projet est lié via la CLI Supabase (`supabase/.temp/`, non versionné).

```bash
npx supabase migration list   # état local vs remote (lecture seule)
npx supabase db push          # applique les migrations manquantes au remote
```

**Important — workflow établi du projet : `npx supabase db push` touche la base
distante et ne doit être lancé qu'avec l'accord explicite de Laurent** (les
plans d'implémentation le marquent comme « checkpoint humain »). Même chose
pour la création de buckets Storage dans le dashboard (`plans`,
`mission-photos` — privés, accès par URLs signées).

## Aller plus loin

L'historique de conception complet (specs, plans d'implémentation détaillés
tâche par tâche, comptes rendus d'audit) est dans :

- `docs/superpowers/specs/` — documents de conception
- `docs/superpowers/plans/` — plans d'exécution (Plan 1 « moteur réseaux »,
  détection mires/baguettes, superposition Bagua)

Le fichier `docs/superpowers/2026-07-19-global-audit-findings.md` (sur
`master`) recense les points en suspens connus (migrations, buckets,
placeholders de données, hypothèses API à vérifier).

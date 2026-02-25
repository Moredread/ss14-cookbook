# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SS14 Cookbook is a static web app that reads Space Station 14 game YAML/asset data and generates a browsable recipe browser for the game's cooking system, published at https://ss14.recipes. Licensed under AGPLv3.

The codebase has two halves:
1. **Node.js data generator** (`src/gen/`) — reads SS14 game repo data, outputs static JSON + WebP sprite files
2. **React SPA frontend** (`src/web/`) — browses that generated data

The SS14 codebase is available in ../, a CLAUDE.md is there too.

## Build & Run

```bash
# Install dependencies
npm install

# Production build (frontend + generator)
npm run build

# Generate recipe data (requires sources.yml and local SS14 repo clones)
npm run gen:recipes

# Dev build with watch mode (uses .env.development)
npm run watch

# Dev server on port 5514
npm start

# Alt dev server on port 5515 (for testing data migrations)
npm run start-alt

# Diff recipe data
npm run diff:recipes
```

There are no tests in this project. There is no hot module reloading — manually refresh the browser after changes.

## Setup for Recipe Generation

The generator requires local clones of SS14 fork repos (it does NOT clone them). Configure fork sources by copying `sources.example.yml` or `sources.real.yml` to `sources.yml`. The clones don't need full initialization (no `RUN_THIS.py` or dotnet needed) — only `Resources/` YAML and sprite data are read.

Environment variables are configured via `.env` (production) and `.env.development` (dev, pre-configured). See `.env.example` for available options (`COOKBOOK_BASE_PATH`, `COOKBOOK_REPO_URL`, `COOKBOOK_TRUSTED_HOSTS`, `COOKBOOK_CANONICAL_URL`).

## Tech Stack

- TypeScript 5 (strict), React 19, React Router 7, PostCSS
- Rollup 4 builds two artifacts: frontend IIFE (`public/assets/`) and generator CJS (`bin/recipe-gen.js`)
- `yaml` for YAML parsing, `jimp`/`sharp` for sprite composition, `@fluent/bundle` for localization
- Environment variables are injected as compile-time constants via `@rollup/plugin-replace` (declared in `src/globals.d.ts`)

## Architecture

### Generator Pipeline (`src/gen/`)

Entry point: `src/gen/index.ts`. Reads `sources.yml`, then per fork runs these stages:

1. **`read-raw.ts`** — Scans `Resources/Prototypes/**/*.yml` in the fork repo, parses YAML (with custom `!type:T` tag support), loads raw prototype maps (entity, reagent, stack, constructionGraph, metamorphRecipe, foodSequenceElement, microwaveMealRecipe, reaction)
2. **`resolve-components.ts`** — Traverses entity prototype inheritance chains, produces fully-resolved entities with merged component data
3. **`filter-relevant.ts`** — Starting from microwave recipe results, iteratively expands a "relevant set" of entities/reagents by traversing all recipe types (microwave, metamorph, cut, butcher, roll, heat, construct, deep fry, chemical reactions, grindable produce)
4. **`resolve-prototypes.ts`** — Resolves IDs to localized names via Fluent `.ftl` files, finalizes recipe structures
5. **`resolve-specials.ts`** — Resolves special diet and reagent markers
6. **`build-spritesheet.ts`** — Reads RSI sprite PNGs, composites into a single sprite sheet (24 wide, 32x32 each), outputs as WebP
7. **`save-data.ts`** — Writes per-fork JSON and master `index.json` to `public/data/` with SHA1 content hashes in filenames

### Generated Recipe ID Conventions

Recipe IDs in the generated data follow these patterns:
- Microwave: the prototype ID directly (e.g. `BurgerRecipe`)
- Cut/Roll/Heat/DeepFry: `method!EntityId` (e.g. `cut!FoodPizza`, `heat!FoodEgg`)
- Butcher: `butcher!EntityId:SpawnedEntityId`
- Reaction/mix: `r!ReactionId`
- Metamorph: `m!MetamorphRecipeId`
- General construct: `construct!EntityId:ResultId`

### Frontend (`src/web/`)

React 19 SPA with these routes:
- `/` — `RecipeList`: main filterable/searchable recipe browser
- `/combinations` — `FoodSequences`: food sequence (sandwich/burger builder) view
- `/menu` — `MenuPlanner`: menu planning tool with CRUD, import/export
- `/migrate` — `MigratePage`: cross-origin data migration tool

Key context providers (nested in `App` → `Cookbook`): `SettingsProvider`, `GameDataProvider`, `ForkProvider`, `FavoritesProvider`, `RecipeExplorerProvider`, `UrlProvider`. All localStorage keys are prefixed `ss14-cookbook/`.

Sprites are rendered via CSS `background-position` offsets into a single WebP sprite sheet loaded via `--sprite-url` custom property.

### Shared Types

`src/types.ts` defines shared types used by both generator and frontend (`GameData`, `Entity`, `Reagent`, `Recipe` variants, `SpritePoint`). The frontend has additional types in `src/web/types.ts` (`SearchableRecipeData`, `DisplayMethod`).

## Key Files

- `src/gen/constants.ts` — Hardcoded game defaults that must mirror C# game values (DefaultCookTime, DefaultTotalSliceCount, etc.)
- `sources.yml` — Active fork config (not committed); `sources.example.yml` and `sources.real.yml` are references
- `privacy.html` — Privacy policy HTML snippet (not committed), injected at build time via `dangerouslySetInnerHTML`
- `bin/recipe-gen.js` — Compiled generator output (git-tracked)
- `public/data/` — Generated output directory; old files are never cleaned automatically

## Important Notes

- All CSS is intentionally in a single file (`src/web/index.css`)
- The `public/data/` directory retains old generated files — cleanup is manual
- The generator includes a workaround for SS14 PNGs with trailing garbage bytes
- Fork configuration supports multiple simultaneous SS14 forks with per-fork sprites, diets, special reagents, ignored recipes, and sorting rewrites

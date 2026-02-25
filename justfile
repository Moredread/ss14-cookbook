sources_dir := "../cookbook-sources"

# List available recipes
default:
    @just --list

# Clone all fork repos (with submodules)
clone-all: clone-base clone-frontier clone-delta-v clone-rmc clone-floof clone-impstation clone-moff

# Pull all fork repos
pull-all: pull-base pull-frontier pull-delta-v pull-rmc pull-floof pull-impstation pull-moff

# Clone + pull (idempotent setup)
sync-all: clone-all pull-all

# Generate recipe data
gen:
    npm run gen:recipes

# Dev build with watch
watch:
    npm run watch

# Dev server
serve:
    npm start

# Production build
build:
    npm run build

# --- Per-fork clone targets ---

clone-base:
    @just _clone space-wizards/space-station-14 base

clone-frontier:
    @just _clone new-frontiers-14/frontier-station-14 frontier

clone-delta-v:
    @just _clone DeltaV-Station/Delta-v delta-v

clone-rmc:
    @just _clone RMC-14/RMC-14 rmc

clone-floof:
    @just _clone Fansana/floofstation1 floof

clone-impstation:
    @just _clone impstation/imp-station-14 impstation

clone-moff:
    @just _clone moff-station/moff-station-14 moff

# --- Per-fork pull targets ---

pull-base:
    @just _pull base

pull-frontier:
    @just _pull frontier

pull-delta-v:
    @just _pull delta-v

pull-rmc:
    @just _pull rmc

pull-floof:
    @just _pull floof

pull-impstation:
    @just _pull impstation

pull-moff:
    @just _pull moff

# --- Internal helpers ---

[private]
_clone repo dir:
    #!/usr/bin/env bash
    set -euo pipefail
    dest="{{sources_dir}}/{{dir}}"
    if [ -d "$dest" ]; then
        echo "Already cloned: $dest"
    else
        echo "Cloning {{repo}} → $dest"
        git clone --recurse-submodules "https://github.com/{{repo}}.git" "$dest"
    fi

[private]
_pull dir:
    #!/usr/bin/env bash
    set -euo pipefail
    dest="{{sources_dir}}/{{dir}}"
    if [ ! -d "$dest" ]; then
        echo "Not cloned: $dest (run just clone-{{dir}} first)"
        exit 1
    fi
    echo "Pulling {{dir}}"
    git -C "$dest" pull --recurse-submodules
    git -C "$dest" submodule update --init --recursive

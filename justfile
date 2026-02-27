sources_dir := "../cookbook-sources"
repo_dir := sources_dir / ".repo"

# List available recipes
default:
    @just --list

# First-time setup: clone base repo, add all remotes, create worktrees
setup: _init-repo add-remotes fetch-all worktrees

# Fetch all remotes
fetch-all:
    git -C {{repo_dir}} fetch --all

# Create/update all worktrees
worktrees: wt-base wt-frontier wt-delta-v wt-rmc wt-floof wt-impstation wt-goobstation wt-moff

# Pull all forks to latest
pull-all: pull-base pull-frontier pull-delta-v pull-rmc pull-floof pull-impstation pull-goobstation pull-moff

# Generate recipe data
gen:
    npm run gen:recipes

# Build and generate recipe data
generate: build gen

# Dev build with watch
watch:
    npm run watch

# Dev server
serve:
    npm start

# Production build
build:
    npm run build

# --- Remotes ---

# Add all fork remotes
add-remotes:
    #!/usr/bin/env bash
    set -euo pipefail
    cd {{repo_dir}}
    add_remote() {
        if git remote get-url "$1" &>/dev/null; then
            echo "Remote $1 already exists"
        else
            echo "Adding remote $1 → $2"
            git remote add "$1" "$2"
        fi
    }
    add_remote base     https://github.com/space-wizards/space-station-14.git
    add_remote frontier https://github.com/new-frontiers-14/frontier-station-14.git
    add_remote delta-v  https://github.com/DeltaV-Station/Delta-v.git
    add_remote rmc      https://github.com/RMC-14/RMC-14.git
    add_remote floof    https://github.com/Fansana/floofstation1.git
    add_remote impstation https://github.com/impstation/imp-station-14.git
    add_remote goobstation https://github.com/Goob-Station/Goob-Station.git
    add_remote moff     https://github.com/moff-station/moff-station-14.git

# --- Worktree targets ---

wt-base:
    @just _worktree base master

wt-frontier:
    @just _worktree frontier master

wt-delta-v:
    @just _worktree delta-v master

wt-rmc:
    @just _worktree rmc master

wt-floof:
    @just _worktree floof master

wt-impstation:
    @just _worktree impstation master

wt-goobstation:
    @just _worktree goobstation master

wt-moff:
    @just _worktree moff master

# --- Pull targets ---

pull-base:
    @just _pull base master

pull-frontier:
    @just _pull frontier master

pull-delta-v:
    @just _pull delta-v master

pull-rmc:
    @just _pull rmc master

pull-floof:
    @just _pull floof master

pull-impstation:
    @just _pull impstation master

pull-goobstation:
    @just _pull goobstation master

pull-moff:
    @just _pull moff master

# --- Internal helpers ---

[private]
_init-repo:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -d "{{repo_dir}}" ]; then
        echo "Repo already initialized at {{repo_dir}}"
    else
        echo "Cloning base repo → {{repo_dir}}"
        git clone --bare https://github.com/space-wizards/space-station-14.git "{{repo_dir}}"
    fi

[private]
_worktree remote branch:
    #!/usr/bin/env bash
    set -euo pipefail
    dest="$(realpath -m "{{sources_dir}}/{{remote}}")"
    if [ -d "$dest" ]; then
        echo "Worktree already exists: $dest"
    else
        echo "Creating worktree {{remote}} → $dest"
        git -C "{{repo_dir}}" worktree add "$dest" "{{remote}}/{{branch}}" --detach
    fi
    echo "Initializing submodules in $dest"
    git -C "$dest" submodule update --init --recursive

[private]
_pull remote branch:
    #!/usr/bin/env bash
    set -euo pipefail
    dest="{{sources_dir}}/{{remote}}"
    if [ ! -d "$dest" ]; then
        echo "Worktree missing: $dest (run just wt-{{remote}} first)"
        exit 1
    fi
    echo "Fetching {{remote}}"
    git -C "{{repo_dir}}" fetch "{{remote}}"
    echo "Updating worktree {{remote}}"
    git -C "$dest" checkout --detach "{{remote}}/{{branch}}"
    git -C "$dest" submodule update --init --recursive

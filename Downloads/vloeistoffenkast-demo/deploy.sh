#!/bin/bash
set -e

BRANCH="gh-pages"
WORKTREE="/tmp/vb-gh-pages-deploy"

echo "Bouwen..."
npm run build

echo "gh-pages branch ophalen..."
rm -rf "$WORKTREE"
git worktree add "$WORKTREE" "$BRANCH" 2>/dev/null || \
  git worktree add --orphan -b "$BRANCH" "$WORKTREE"

echo "Bestanden kopiëren..."
cp -r dist/. "$WORKTREE/"
touch "$WORKTREE/.nojekyll"

echo "Deployen naar GitHub Pages..."
git -C "$WORKTREE" add -A
git -C "$WORKTREE" commit -m "Deploy $(date '+%Y-%m-%d %H:%M')" || echo "Niets gewijzigd."
git -C "$WORKTREE" push origin "$BRANCH"

git worktree remove "$WORKTREE" 2>/dev/null || true

echo ""
echo "Klaar! Live op: https://leroyevertse-cloud.github.io/voorraadbeheer-ruinerwold/"

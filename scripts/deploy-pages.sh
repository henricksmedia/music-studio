#!/usr/bin/env bash
# Build the static export and publish out/ to the gh-pages branch (GitHub Pages "Deploy from branch").
# Use this until the GitHub Actions workflow in deploy/ can be enabled (needs a token with `workflow` scope).
set -euo pipefail
unset GH_TOKEN
cd "$(dirname "$0")/.."
PAGES_BASE_PATH=/music-studio NEXT_TELEMETRY_DISABLED=1 npm run build
touch out/.nojekyll
REMOTE=$(git remote get-url origin)
SHA=$(git rev-parse --short HEAD)
TMP=$(mktemp -d)
cp -r out/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.email="jeremy@henricksmedia.local" -c user.name="Jeremy Henricks" commit -q -m "Deploy ${SHA}"
git push -f "$REMOTE" gh-pages
rm -rf "$TMP"
echo "Deployed ${SHA} → https://henricksmedia.github.io/music-studio/"

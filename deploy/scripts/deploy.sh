#!/usr/bin/env bash
# Zero-downtime-ish release with automatic rollback.
# Usage (on VPS, as a sudoer):  deploy.sh <git-ref>   e.g. deploy.sh ccr-b3023934-88x2pt
# Layout: /opt/fingertip/releases/<timestamp>-<sha>, /opt/fingertip/current -> active release
set -euo pipefail

REF="${1:?usage: deploy.sh <git-ref>}"
REPO="${REPO:-https://github.com/Sridhar-2222/Medical-Store-Final-Complete.git}"
BASE=/opt/fingertip
KEEP=5

/opt/fingertip/current/deploy/scripts/backup.sh 2>/dev/null || echo "WARN: pre-deploy backup skipped (first deploy?)"

TMP=$(mktemp -d)
git clone --quiet "$REPO" "$TMP/src"
git -C "$TMP/src" checkout --quiet "$REF"
SHA=$(git -C "$TMP/src" rev-parse --short HEAD)
REL="$BASE/releases/$(date +%Y%m%d%H%M%S)-$SHA"
mkdir -p "$BASE/releases" "$BASE/state"
mv "$TMP/src" "$REL"
rm -rf "$TMP"

(cd "$REL" && npm ci --omit=dev --no-audit --no-fund)

PREV=$(readlink -f "$BASE/current" || true)
ln -sfn "$REL" "$BASE/current"
sudo systemctl restart fingertip-app

if "$REL/deploy/scripts/healthcheck.sh" --retries 10; then
  echo "DEPLOYED $SHA -> $REL"
else
  echo "HEALTHCHECK FAILED — rolling back to $PREV" >&2
  if [ -n "$PREV" ]; then ln -sfn "$PREV" "$BASE/current"; sudo systemctl restart fingertip-app; fi
  exit 1
fi

# prune old releases
ls -1dt "$BASE"/releases/* | tail -n +$((KEEP + 1)) | xargs -r rm -rf

#!/usr/bin/env bash
# Roll back to the previous release (or a named one).
# Usage: rollback.sh            -> previous release
#        rollback.sh <dirname>  -> /opt/fingertip/releases/<dirname>
set -euo pipefail
BASE=/opt/fingertip
CUR=$(readlink -f "$BASE/current")
if [ $# -ge 1 ]; then
  TARGET="$BASE/releases/$1"
else
  TARGET=$(ls -1dt "$BASE"/releases/* | grep -vx "$CUR" | head -1)
fi
[ -d "$TARGET" ] || { echo "no release to roll back to: $TARGET" >&2; exit 1; }
ln -sfn "$TARGET" "$BASE/current"
sudo systemctl restart fingertip-app
"$TARGET/deploy/scripts/healthcheck.sh" --retries 10 && echo "ROLLED BACK to $TARGET"

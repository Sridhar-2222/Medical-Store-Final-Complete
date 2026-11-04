#!/usr/bin/env bash
# Health check for app, n8n, public HTTPS/SSL expiry and the WhatsApp webhook.
# Exit 0 = healthy. Run from cron every 5 min; non-zero exit triggers ALERT_CMD.
#   */5 * * * * /opt/fingertip/current/deploy/scripts/healthcheck.sh --full >> /var/log/fingertip-health.log 2>&1
# Optional env: ALERT_CMD (e.g. a curl to a Telegram/ntfy/uptime webhook, receives message on stdin)
set -uo pipefail

RETRIES=1; FULL=0
while [ $# -gt 0 ]; do
  case "$1" in --retries) RETRIES="$2"; shift ;; --full) FULL=1 ;; esac; shift
done

fail=()
check() { # name url expected_code
  local i code
  for ((i = 1; i <= RETRIES; i++)); do
    code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$2")
    [ "$code" = "$3" ] && { echo "OK   $1 ($code)"; return 0; }
    [ "$i" -lt "$RETRIES" ] && sleep 3
  done
  echo "FAIL $1 (got $code, want $3)"; fail+=("$1"); return 1
}

check app-local   http://127.0.0.1:10000/health 200
if [ "$FULL" = 1 ]; then
  check app-ready  http://127.0.0.1:10000/health/ready 200
  check n8n-local  http://127.0.0.1:5678/healthz 200
  check https-apex https://aipharmacy.in/health 200
  check https-n8n  https://n8n.aipharmacy.in/healthz 200
  # Meta webhook must reject a wrong verify token with 403 (proves it is deployed and guarded)
  check wa-webhook "https://fsftbvchnifshndssowe.supabase.co/functions/v1/smooth-responder?hub.mode=subscribe&hub.verify_token=healthcheck&hub.challenge=1" 403
  # SSL expiry > 14 days
  end=$(echo | openssl s_client -connect aipharmacy.in:443 -servername aipharmacy.in 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$end" ] && [ $(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 )) -gt 14 ]; then
    echo "OK   ssl-expiry ($end)"
  else
    echo "FAIL ssl-expiry (${end:-unreadable})"; fail+=(ssl)
  fi
fi

if [ ${#fail[@]} -gt 0 ]; then
  msg="aipharmacy.in health FAIL: ${fail[*]} @ $(date -Is)"
  [ -n "${ALERT_CMD:-}" ] && echo "$msg" | bash -c "$ALERT_CMD"
  exit 1
fi

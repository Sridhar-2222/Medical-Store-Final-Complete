#!/usr/bin/env bash
# Nightly backup: n8n data volume, app env/config, Nginx config, and (optionally)
# a logical dump of the Supabase database.
#   15 2 * * * /opt/fingertip/current/deploy/scripts/backup.sh >> /var/log/fingertip-backup.log 2>&1
# Env (in /etc/fingertip/backup.env, chmod 600):
#   SUPABASE_DB_URL  postgres connection string (Supabase > Project Settings > Database), optional
#   BACKUP_REMOTE    rclone remote:path for off-server copy, e.g. gdrive:fingertip-backups, optional
set -euo pipefail
[ -f /etc/fingertip/backup.env ] && . /etc/fingertip/backup.env

DEST=/var/backups/fingertip/$(date +%F_%H%M)
KEEP_DAYS=14
mkdir -p "$DEST"
umask 077

# n8n volume (workflows, credentials — encrypted with N8N_ENCRYPTION_KEY)
if docker volume inspect n8n_n8n_data >/dev/null 2>&1; then
  docker run --rm -v n8n_n8n_data:/data -v "$DEST":/out alpine tar czf /out/n8n_data.tgz -C /data .
fi

tar czf "$DEST/config.tgz" /etc/fingertip /etc/nginx/sites-available /opt/n8n/.env 2>/dev/null || true

if [ -n "${SUPABASE_DB_URL:-}" ] && command -v pg_dump >/dev/null; then
  pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --format=custom -f "$DEST/supabase_public.dump"
fi

[ -n "${BACKUP_REMOTE:-}" ] && command -v rclone >/dev/null && rclone copy "$DEST" "$BACKUP_REMOTE/$(basename "$DEST")"

find /var/backups/fingertip -mindepth 1 -maxdepth 1 -type d -mtime +$KEEP_DAYS -exec rm -rf {} +
echo "BACKUP OK $DEST $(du -sh "$DEST" | cut -f1)"

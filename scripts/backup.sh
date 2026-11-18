#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
umask 077
mkdir -p backups
LEONIDA_BACKUP="backups/leonida-$(date -u +%Y%m%dT%H%M%SZ).dump"
if docker compose exec -T database sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$LEONIDA_BACKUP.tmp"; then
  mv "$LEONIDA_BACKUP.tmp" "$LEONIDA_BACKUP"
  printf 'Backup: %s\n' "$LEONIDA_BACKUP"
else
  rm -f "$LEONIDA_BACKUP.tmp"
  exit 1
fi

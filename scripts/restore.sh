#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "$#" -ne 2 ] || [ "$2" != '--replace' ] || [ ! -f "$1" ]; then
  echo 'Usage: ./scripts/restore.sh backups/DATEI.dump --replace' >&2
  exit 1
fi
docker compose stop web worker
docker compose exec -T database sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl --single-transaction' < "$1"
docker compose up -d

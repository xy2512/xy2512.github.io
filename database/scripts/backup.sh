#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/../backups" && pwd)}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
FILE="$BACKUP_DIR/skill-share-$STAMP.dump"

pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$FILE"
echo "$FILE"

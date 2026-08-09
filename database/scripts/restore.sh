#!/usr/bin/env sh
set -eu

if [ "$#" -ne 1 ] || [ -z "${DATABASE_URL:-}" ]; then
  echo "Usage: DATABASE_URL=postgresql://... $0 backup.dump" >&2
  exit 1
fi

pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$1"

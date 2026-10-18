#!/usr/bin/env bash
# OPS-PROD-LAUNCH-1: manual logical backup before production launch / major upgrade.
# Usage:
#   export DATABASE_URL='postgresql://...'
#   ./scripts/ops/backup_before_launch.sh
# Optional:
#   BACKUP_DIR=/var/backups/an-erp ./scripts/ops/backup_before_launch.sh
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is required" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/an-erp-prelaunch-${STAMP}.dump"

echo "Writing custom-format dump to ${OUT}"
# -Fc custom format; no --clean so restore is explicit and safer (no drop database)
pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f "$OUT"
echo "OK backup: ${OUT}"
echo "Restore example (review first): pg_restore -d YOUR_DATABASE_URL --no-owner --no-acl ${OUT}"

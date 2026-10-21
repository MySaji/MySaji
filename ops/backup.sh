#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
: "${RESTIC_REPOSITORY:?Use an off-server restic repository}"
: "${RESTIC_PASSWORD_FILE:?Use a protected password file}"
cd /opt/saji
exec 9>/run/lock/saji-backup.lock
flock -n 9 || exit 1
work=$(mktemp -d /var/lib/saji-backup.XXXXXX)
trap 'rm -rf -- "$work"' EXIT
docker compose --env-file ops/deploy.env -f ops/compose.yaml exec -T db \
  pg_dump -U saji_owner -d saji -Fc > "$work/saji.dump"
test -s "$work/saji.dump"
docker compose --env-file ops/deploy.env -f ops/compose.yaml exec -T db \
  pg_restore --list < "$work/saji.dump" > "$work/archive-list.txt"
# app.env includes the encryption key required to recover encrypted fields.
# Restic encrypts content before sending it off host.
restic backup --tag saji "$work" /opt/saji/ops/app.env /opt/saji/ops/deploy.env /opt/saji/ops/secrets
restic check
# Retention/prune intentionally separate and subject to agreed policy.

#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/env.sh"
FTC_DATA="$FTC_ROOT/.local/postgres"
FTC_ENV="$FTC_ROOT/apps/backend/.env"
case "${1:-status}" in
  start)
    command -v initdb >/dev/null || { echo 'Install PostgreSQL 16: brew install postgresql@16'; exit 1; }
    mkdir -p "$FTC_ROOT/.local"
    if [[ ! -f "$FTC_DATA/PG_VERSION" ]]; then
      [[ ! -f "$FTC_ENV" ]] || { echo 'Existing .env found; configure the database manually to preserve it.'; exit 1; }
      umask 077
      node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("hex"))' > "$FTC_ROOT/.local/db-password"
      initdb -D "$FTC_DATA" -U ftc_local --pwfile="$FTC_ROOT/.local/db-password" --auth-host=scram-sha-256 --auth-local=scram-sha-256 --encoding=UTF8 --locale=C
      printf '\nlisten_addresses = '\''127.0.0.1'\''\nport = 55432\nunix_socket_directories = '\'''\''\n' >> "$FTC_DATA/postgresql.conf"
      printf 'DATABASE_URL="postgresql://ftc_local:%s@127.0.0.1:55432/ftc_connect?schema=public"\nPORT=3000\n' "$(cat "$FTC_ROOT/.local/db-password")" > "$FTC_ENV"
    fi
    if ! pg_ctl -D "$FTC_DATA" status >/dev/null 2>&1; then
      pg_ctl -D "$FTC_DATA" -l "$FTC_ROOT/.local/postgres.log" start
    fi
    export PGPASSWORD="$(cat "$FTC_ROOT/.local/db-password")"
    if [[ "$(psql -h 127.0.0.1 -p 55432 -U ftc_local -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='ftc_connect'")" != 1 ]]; then
      createdb -h 127.0.0.1 -p 55432 -U ftc_local ftc_connect
    fi
    echo 'Local database ready on 127.0.0.1:55432.'
    ;;
  stop) pg_ctl -D "$FTC_DATA" stop -m fast ;;
  status) pg_ctl -D "$FTC_DATA" status ;;
  *) echo 'Usage: ./scripts/db.sh start|stop|status'; exit 1 ;;
esac

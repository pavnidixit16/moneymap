#!/usr/bin/env bash
# LOCAL TESTING ONLY. Runs the browser tests against a throwaway local stack:
# Postgres (with the real migrations) + PostgREST + a stand-in auth gateway + the app.
# Needs: a running Postgres reachable via PGHOST/PGPORT as superuser `postgres`,
# and the PostgREST binary in POSTGREST_BIN.
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${PGHOST:?set PGHOST}" "${PGPORT:?set PGPORT}" "${POSTGREST_BIN:?set POSTGREST_BIN}"
export JWT_SECRET="local-test-secret-local-test-secret-123456"
DB=mm_e2e
PSQL="psql -h $PGHOST -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -q"

$PSQL -c "drop database if exists $DB" -c "create database $DB"
$PSQL -d $DB -f supabase/tests/local_supabase_shim.sql
for f in supabase/migrations/*.sql; do $PSQL -d $DB -f "$f"; done
$PSQL -d $DB -f e2e/local/setup.sql

# Free the ports in case an earlier run was interrupted.
for port in 3001 3100 54321; do fuser -k "$port/tcp" >/dev/null 2>&1 || true; done

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT

PGRST_DB_URI="postgres://authenticator:authenticator@127.0.0.1:$PGPORT/$DB" \
PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" \
PGRST_SERVER_PORT=3001 PGRST_DB_POOL=5 "$POSTGREST_BIN" > /tmp/moneymap-postgrest.log 2>&1 & pids+=($!)
node e2e/local/gateway.mjs > /tmp/moneymap-gateway.log 2>&1 & pids+=($!)

export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_localtest
npm run build > /tmp/moneymap-build.log 2>&1
npx next start -p 3100 > /tmp/moneymap-next.log 2>&1 & pids+=($!)
for _ in $(seq 1 60); do curl -s -o /dev/null http://localhost:3100/login && break; sleep 1; done

npx playwright test "$@"

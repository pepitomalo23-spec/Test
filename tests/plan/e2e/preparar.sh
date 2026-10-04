#!/usr/bin/env bash
# Prepara la base de datos de las pruebas E2E del Plan y arranca PostgREST
# y el servidor de pruebas. Uso: bash tests/plan/e2e/preparar.sh
# Variables: PGHOST (/tmp), PGPORT (54329), PGUSER (postgres), POSTGREST (binario),
# PUERTO_PGRST (54330), PUERTO (54331), DB (plan_e2e).
set -euo pipefail
cd "$(dirname "$0")/../../.."
PGHOST="${PGHOST:-/tmp}"; PGPORT="${PGPORT:-54329}"; PGUSER="${PGUSER:-postgres}"
DB="${DB:-plan_e2e}"; PUERTO_PGRST="${PUERTO_PGRST:-54330}"; PUERTO="${PUERTO:-54331}"
POSTGREST="${POSTGREST:-postgrest}"
SECRETO="secreto-de-pruebas-del-plan-de-estudio-32+"
DIR="${TMPDIR:-/tmp}/plan-e2e"; mkdir -p "$DIR"
P="psql -h $PGHOST -p $PGPORT -U $PGUSER -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists $DB with (force)" -c "create database $DB" >/dev/null
$P -d "$DB" -f tests/plan/db/supabase_base.sql >/dev/null 2>&1
$P -d "$DB" -f supabase/migrations/20261003c_plan_estudio.sql >/dev/null 2>&1
$P -d "$DB" -f tests/plan/e2e/app_stubs.sql >/dev/null 2>&1
# Copia local de la librería de Supabase (el navegador de las pruebas la
# toma de aquí: así no depende del CDN ni de su certificado).
mkdir -p "$DIR/cdn"
[ -s "$DIR/cdn/supabase.min.js" ] || curl -sSfL -o "$DIR/cdn/supabase.min.js" "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"
cat > "$DIR/postgrest.conf" <<CONF
db-uri = "postgres://authenticator@127.0.0.1:$PGPORT/$DB"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRETO"
server-host = "127.0.0.1"
server-port = $PUERTO_PGRST
db-pool = 5
CONF
pkill -f "$DIR/postgrest.conf" 2>/dev/null || true
pkill -f "tests/plan/e2e/servidor.mjs $PUERTO " 2>/dev/null || true
# Espera a que los puertos queden libres tras parar los anteriores.
for i in $(seq 1 50); do
  (exec 3<>"/dev/tcp/127.0.0.1/$PUERTO_PGRST") 2>/dev/null || (exec 3<>"/dev/tcp/127.0.0.1/$PUERTO") 2>/dev/null || break
  sleep 0.2
done
nohup "$POSTGREST" "$DIR/postgrest.conf" > "$DIR/postgrest.log" 2>&1 &
nohup node tests/plan/e2e/servidor.mjs "$PUERTO" "$PUERTO_PGRST" "$SECRETO" > "$DIR/servidor.log" 2>&1 &
for i in $(seq 1 50); do
  if curl -s -o /dev/null "http://127.0.0.1:$PUERTO_PGRST/" && curl -s -o /dev/null "http://127.0.0.1:$PUERTO/index.html"; then
    echo "Listo: app en http://127.0.0.1:$PUERTO (PostgREST en $PUERTO_PGRST, BD $DB)"; exit 0
  fi
  sleep 0.2
done
echo "No arrancó: mira $DIR/postgrest.log y $DIR/servidor.log" >&2; exit 1

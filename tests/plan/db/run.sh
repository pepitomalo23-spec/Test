#!/usr/bin/env bash
# =====================================================================
# Pruebas de la base de datos del Plan de estudio en un PostgreSQL local
# =====================================================================
# 1) crea una base de datos temporal con un nombre único,
# 2) carga lo mínimo de Supabase (supabase_base.sql),
# 3) aplica la migración del Plan DOS veces (tiene que poder repetirse
#    sin errores y sin cambiar nada la segunda vez),
# 4) lanza rls.sql (se para en el primer fallo),
# 5) muestra un resumen y borra la base de datos.
#
# Uso, desde la raíz del repo:   bash tests/plan/db/run.sh
# Servidor: PGHOST, PGPORT y PGUSER (por defecto /tmp, 54329 y postgres).
# PLAN_MIGRACION=ruta prueba otra versión de la migración (p. ej. una
# copia con un cambio, para ver que estas pruebas lo detectan).
# El usuario tiene que poder crear bases de datos y roles (anon,
# authenticated…): usa un PostgreSQL de pruebas, nunca el de producción.
# Hace falta PostgreSQL 15 o posterior (on delete set null (columna)).
# Sale con código 0 si todo pasa y distinto de 0 si algo falla.
# =====================================================================
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$DIR/../../.." && pwd)"
BASE="$DIR/supabase_base.sql"
MIGRACION="${PLAN_MIGRACION:-$RAIZ/supabase/migrations/20261003c_plan_estudio.sql}"
PRUEBAS="$DIR/rls.sql"

export PGHOST="${PGHOST:-/tmp}"
export PGPORT="${PGPORT:-54329}"
export PGUSER="${PGUSER:-postgres}"
MANTENIMIENTO="${PGMAINTDB:-postgres}"
# Los binarios de PostgreSQL 16 de Debian/Ubuntu, por si psql no está en el PATH.
command -v psql >/dev/null 2>&1 || PATH="$PATH:/usr/lib/postgresql/16/bin"

BD="plan_pruebas_$(date +%Y%m%d_%H%M%S)_$$_${RANDOM}"
TMP="$(mktemp -d)"

fallo() {
  echo "" >&2
  echo "FALLO: $*" >&2
  exit 1
}

limpiar() {
  local codigo=$?
  if [ -n "${CREADA:-}" ]; then
    psql -X -q -d "$MANTENIMIENTO" -c "drop database if exists \"$BD\" with (force)" >/dev/null 2>&1 \
      || echo "Aviso: no se ha podido borrar la base de datos temporal $BD" >&2
  fi
  rm -rf "$TMP"
  exit "$codigo"
}
trap limpiar EXIT

for f in "$BASE" "$MIGRACION" "$PRUEBAS"; do
  [ -f "$f" ] || fallo "no existe $f"
done
command -v psql >/dev/null 2>&1 || fallo "no se encuentra psql"

# ---- 0) ¿Hay servidor y es al menos PostgreSQL 15? ----
VERSION="$(psql -X -At -d "$MANTENIMIENTO" -c 'show server_version_num' 2>"$TMP/conexion")" \
  || fallo "no se puede conectar con PostgreSQL en $PGHOST:$PGPORT como $PGUSER ($(head -n 1 "$TMP/conexion")).
Arráncalo o indica otro con PGHOST/PGPORT/PGUSER."
[ "$VERSION" -ge 150000 ] || fallo "hace falta PostgreSQL 15 o posterior (este es $VERSION)"

echo "== Pruebas de la base de datos del Plan =="
echo "Servidor: $PGHOST:$PGPORT (PostgreSQL $(psql -X -At -d "$MANTENIMIENTO" -c 'show server_version' | cut -d' ' -f1)) · base de datos temporal: $BD"
echo "Migración: ${MIGRACION#"$RAIZ/"}"

# psql contra la base temporal: se para en el primer error y sin ~/.psqlrc.
psql_bd() { psql -X -q -v ON_ERROR_STOP=1 -d "$BD" "$@"; }

# ---- 1) Base de datos temporal ----
psql -X -q -v ON_ERROR_STOP=1 -d "$MANTENIMIENTO" -c "create database \"$BD\" template template0 encoding 'UTF8'" \
  || fallo "no se ha podido crear la base de datos temporal"
CREADA=1

# ---- 2) Lo mínimo de Supabase ----
echo "-- Cargando supabase_base.sql"
PGOPTIONS='-c client_min_messages=warning' psql_bd -f "$BASE" || fallo "supabase_base.sql no carga"

# ---- 3) Migración, dos veces ----
echo "-- Aplicando la migración (1.ª vez)"
PGOPTIONS='-c client_min_messages=warning' psql_bd -1 -f "$MIGRACION" || fallo "la migración no se aplica"
# Esquema sin las líneas \restrict/\unrestrict de pg_dump, que llevan una clave al azar.
esquema() { pg_dump -s -d "$BD" | grep -v -E '^\\(un)?restrict '; }
ESQUEMA_DUMP=0
if command -v pg_dump >/dev/null 2>&1; then
  esquema >"$TMP/esquema1.sql" 2>"$TMP/pg_dump.err" && ESQUEMA_DUMP=1
fi
echo "-- Aplicando la migración (2.ª vez: tiene que poder repetirse)"
PGOPTIONS='-c client_min_messages=warning' psql_bd -1 -f "$MIGRACION" || fallo "la migración no se puede aplicar dos veces"
if [ "$ESQUEMA_DUMP" = 1 ]; then
  esquema >"$TMP/esquema2.sql" || fallo "pg_dump no funciona"
  if ! diff -u "$TMP/esquema1.sql" "$TMP/esquema2.sql" >"$TMP/esquema.diff"; then
    cat "$TMP/esquema.diff" >&2
    fallo "aplicar la migración por segunda vez cambia el esquema"
  fi
  echo "   (el esquema queda idéntico tras la 2.ª vez)"
else
  echo "   (sin pg_dump compatible: no se compara el esquema antes y después)"
fi

# ---- 4) Pruebas ----
echo "-- Lanzando rls.sql"
psql_bd -f "$PRUEBAS" 2>&1 | sed -e 's/^psql:[^:]*:[0-9]*: //' -e 's/^NOTICE:  //' | tee "$TMP/salida.txt"
CODIGO=${PIPESTATUS[0]}

# ---- 5) Resumen ----
N_OK="$(grep -c '^OK: ' "$TMP/salida.txt" || true)"
echo ""
if [ "$CODIGO" -ne 0 ] || ! grep -q '^FIN: ' "$TMP/salida.txt"; then
  echo "== RESULTADO: FALLO (psql salió con $CODIGO) tras $N_OK pruebas correctas ==" >&2
  grep -m 1 -E 'FALLO|ERROR' "$TMP/salida.txt" >&2 || true
  exit 1
fi
echo "== RESULTADO: $N_OK pruebas correctas, 0 fallos (migración aplicada 2 veces sin errores) =="

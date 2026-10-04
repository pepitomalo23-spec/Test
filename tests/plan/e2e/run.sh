#!/usr/bin/env bash
# Prepara el entorno y ejecuta las pruebas E2E del Plan. Ver README.md.
set -euo pipefail
cd "$(dirname "$0")/../../.."
bash tests/plan/e2e/preparar.sh
sleep 1.5
status=0
node tests/plan/e2e/escenarios.mjs || status=$?
pkill -f "plan-e2e/postgrest.conf" 2>/dev/null || true
pkill -f "tests/plan/e2e/servidor.mjs" 2>/dev/null || true
exit $status

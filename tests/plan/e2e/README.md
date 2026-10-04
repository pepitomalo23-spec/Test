# Pruebas de extremo a extremo del Plan de estudio

Abren la app de verdad (este repositorio, tal cual) en Chromium con tamaño de iPad y de móvil,
contra un PostgreSQL local con la migración del Plan, un PostgREST local y un «Supabase falso»
(`servidor.mjs`: sesiones como GoTrue y proxy a PostgREST). No tocan el Supabase real.

Comprueban, en la pantalla **y** en la base de datos:

- a. el permiso: el admin ve el Plan; un alumno sin el permiso no lo ve ni puede leer o escribir sus tablas;
- b. temas y tests (también «Crear varios» y «Añadir varios»), sin duplicados;
- c. el límite diario y la excepción autorizada (apuntada);
- d. abrir un test de Tutor Bombero lo deja «en curso» (no lo completa); al volver pregunta y se apunta
  el resultado pegándolo (nota con penalización);
- e. los avisos de «no está en tu plan de hoy» y «ya lo hiciste»;
- f. un test de pj.fire lanzado desde el plan se registra solo al terminar y no se duplica al recargar;
- g. un examen combinado (banco + preguntas propias), su parte del banco en Legislación y los errores recurrentes;
- h. que las cifras de Progreso cuadran con la base de datos;
- i. exportar e importar sin duplicar;
- j. sin conexión se guarda en el dispositivo y se sube una sola vez;
- k. recargar vuelve al Plan;
- m. importar un archivo manipulado no cuela HTML ni datos raros;
- n. el marcador de Tutor Bombero en páginas simuladas (`tb/`, servidas en `https://tutorbomberos.es`): trae los
  tests por tema sin duplicados, guarda el resultado en su tarea con la nota de pj.fire, guarda las preguntas de la
  corrección (con su correcta) en «Mis preguntas» sin duplicar, no copia datos personales y fuera de Tutor Bombero no lee nada;
- l. capturas en iPad vertical y horizontal y en móvil, en claro y oscuro (`$TMPDIR/plan-e2e/capturas`).

## Requisitos

- PostgreSQL 15 o posterior (variables `PGHOST`, `PGPORT`, `PGUSER`; por defecto `/tmp`, `54329`, `postgres`).
- El binario de [PostgREST](https://github.com/PostgREST/postgrest/releases) v12 (variable `POSTGREST`).
- Node 22 y Playwright con Chromium.

## Ejecutar

```
POSTGREST=/ruta/a/postgrest bash tests/plan/e2e/run.sh
```

Las de la base de datos (seguridad, RLS) van aparte: `bash tests/plan/db/run.sh`. Las de la lógica:
`node --test tests/plan/*.test.mjs` (estas también las ejecuta GitHub Actions).

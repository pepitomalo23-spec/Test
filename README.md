# pj.fire

App web de tests de legislación. Es una web estática (sin paso de compilación) publicada en Vercel, con los datos en Supabase.

## Estructura

```
index.html           HTML de todas las pantallas + estilos críticos del arranque
css/                 estilos, en orden de carga
  base.css           variables, tema claro, barra superior, acceso, splash, avisos
  admin.css          panel de administración
  pantallas.css      inicio, estadísticas, historial, configuración de tests, árbol, Fallos
  test.css           test en curso, notas, IA, corrección, vista lista
  normativas.css     Normativas (fichas estilo Quizlet)
  callejero.css      Callejero (mapa y juego)
js/                  código, en orden de carga (ver el final de index.html)
  nucleo.js          avisos, esqueletos de carga, cliente de Supabase, resultados pendientes
  pwa.js             service worker, aviso de versión nueva, notificaciones, enlaces
  errores.js         registro de errores de los usuarios
  alturas.js         alturas reales de las cabeceras (variables CSS)
  permisos.js        permisos por función de cada usuario
  dispositivo.js     identificación del dispositivo e intentos de acceso
  datos.js           datos en memoria, utilidades comunes, test en curso guardado
  temario.js         utilidades del árbol del temario (alumno y admin)
  estadisticas.js    pantalla de entrada y Estadísticas
  contenido.js       carga de temas, árbol y preguntas (con copia en el dispositivo)
  historial.js       historial de tests
  navegacion.js      navegación entre pantallas
  configuracion-test.js  preparar un test (temas, ajustes, Fallos…)
  test-inteligente.js    Test Inteligente
  test.js            test en curso
  visor-imagen.js    visor de imágenes y control del zoom
  splash.js          pantalla de carga
  notas.js           notas propias de cada pregunta
  ia.js              explicaciones con IA
  aportaciones.js    pantalla «Notas y explicaciones IA»
  examen-revision.js vista lista, finalizar y corrección
  cuenta.js          inicio de sesión, registro y entrada en la app
  tema.js            tema claro / oscuro
  admin/             panel de administración (panel, actividad, usuarios,
                     copias, errores, boe, temario, importar-ia, callejero)
  normativas.js      Normativas (fichas estilo Quizlet)
  callejero.js       Callejero: mapa, modos de juego y modo estudio
  arranque.js        escucha la sesión y arranca la app (siempre el último)
sw.js                service worker: app sin conexión y actualizaciones
scripts/versionar.mjs  pone el ?v= de cada css/js en index.html
supabase/            migraciones de la base de datos y funciones (Edge Functions)
assets/              iconos, logo y vídeo
```

Todos los `js/` son scripts normales (no módulos) y comparten el ámbito global, así que
una función de un archivo se puede usar desde otro. El orden de carga importa: un
archivo solo puede usar **al cargarse** lo que ya han declarado los anteriores (dentro
de funciones que se llaman más tarde se puede usar cualquier cosa).

## Callejero

Las calles salen del **Callejero Digital de Andalucía Unificado (CDAU)** y el río del **DERA**
(IECA, Junta de Andalucía, licencia CC BY 4.0: hay que citar la fuente, y la app lo hace en el mapa).

- `supabase/functions/callejero-sync` descarga las vías de Córdoba cada lunes (pg_cron) o cuando
  el administrador pulsa «Comprobar ahora». Las vías nuevas y los cambios de trazado se aplican
  solos; los cambios de nombre y las vías que desaparecen esperan en Administración → Callejero
  a que se aprueben. Si la descarga parece incompleta no se toca nada.
- Tablas: `callejero_vias`, `callejero_cambios`, `callejero_sync_log`, `callejero_publicado` y
  `callejero_intentos` (respuestas de cada alumno). Ver `supabase/migrations/20260925_callejero.sql`.
- El archivo publicado lleva también los 70 barrios urbanos de Córdoba con su distrito (DERA g13_24)
  y en qué barrios está cada vía; con eso la app deja elegir qué estudiar: toda Córdoba, un
  distrito, un barrio o las afueras y pedanías.
- El CDAU se cruzó con el **Callejero del Censo Electoral del INE** (julio de 2026, 3.711 vías) y con
  OpenStreetMap: el CDAU tiene todas las vías oficiales salvo 9 recientes, que la función añade con el
  trazado de OpenStreetMap (`COMPLEMENTOS`) hasta que el CDAU las dibuje. Los nombres provisionales del
  planeamiento («Calle B», «Calle 5 Sg-Ctim») se ven en el mapa pero no se preguntan.
- También lleva unos 600 **lugares importantes**: los de DERA g12 (hospitales, centros de salud, colegios,
  hoteles, instalaciones deportivas, comisarías…) y, para lo que DERA no tiene o le falta, OpenStreetMap
  (monumentos, parques, estaciones, polígonos, teatros, residencias, algunos colegios públicos). Los
  lugares grandes llevan un radio: vale tocar dentro. Si OpenStreetMap no responde en la sincronización,
  se conservan los de la semana anterior.
- Para cada vía y lugar, **qué parque de bomberos acude** según la línea divisoria del SEIS (CO-3405,
  Av. del Brillante, Llanos del Pretorio, Pl. de Colón, Alfaros, Capitulares, San Fernando, Puente de
  Miraflores, Av. de Granada y N-432): al este el Parque del Granadal y al oeste el Parque Central. La
  línea sigue el trazado de cada vía (y el camino más corto por las calles entre una y la siguiente).
  Las vías a menos de 150 m de la línea no se preguntan, porque no está claro a cuál le toca.
- Modos de juego: Localiza la calle, ¿Cómo se llama? (4 opciones), Di el nombre (se marca una calle, uno
  dice su nombre para sí, pulsa «Resolver» y se pone él mismo bien o mal), Cruces y paralelas (se calculan en la app con el trazado de las vías), Lugares importantes y
  ¿Qué parque acude?. Además, el Modo estudio.
- La app descarga un único archivo compacto (almacén público `callejero`, unos 900 KB) solo al
  abrir la pantalla; el service worker lo guarda para jugar sin conexión. El mapa (Leaflet) también
  se carga solo entonces. Tres estilos de mapa, sin nombres que den pistas: Sencillo y Plano
  (el trazado de las vías es el mapa, funcionan sin conexión) y Satélite (ortofotos PNOA del
  Instituto Geográfico Nacional, CC BY 4.0: la del último vuelo encima y la de «máxima actualidad»
  debajo; necesita conexión).

## Al cambiar un css/ o js/

Después de editar cualquier archivo de `css/` o `js/`, ejecuta:

```
node scripts/versionar.mjs
```

Actualiza el `?v=` de ese archivo en `index.html`. Si no se hace, los móviles que ya
tienen la app guardada seguirán usando la versión anterior del archivo. GitHub Actions
lo comprueba en cada push («Comprobar»).

Si añades un archivo nuevo, enlázalo en `index.html` en el sitio que le toque del orden
de carga (con `?v=0`, por ejemplo) y ejecuta el script.

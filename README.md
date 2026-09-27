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
  callejero.js       Callejero: mapa, modos de juego, modo estudio, tareas y modo selección
  callejero-temario.js   Callejero: temario de la academia (fichas, en el mapa, preguntas y planos)
  callejero-profesor.js  Callejero: «Mis alumnos» del profesor, tareas y mensajes
  arranque.js        escucha la sesión y arranca la app (siempre el último)
datos/               datos que la app descarga cuando hacen falta (callejero-temario.json)
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
  `callejero_intentos` (respuestas de cada alumno, con su ronda, zona y tarea). Ver
  `supabase/migrations/20260925_callejero.sql` y `20260927_callejero_profesor.sql`.
- El archivo publicado lleva también los 70 barrios urbanos de Córdoba con su distrito (DERA g13_24)
  y en qué barrios está cada vía; con eso la app deja elegir qué estudiar: toda Córdoba, un
  distrito, un barrio o las afueras y pedanías.
- El CDAU se cruzó con el **Callejero del Censo Electoral del INE** (julio de 2026, 3.711 vías) y con
  OpenStreetMap: el CDAU tiene todas las vías oficiales salvo 9 recientes, que la función añade con el
  trazado de OpenStreetMap (`COMPLEMENTOS`) hasta que el CDAU las dibuje. Los nombres provisionales del
  planeamiento («Calle B», «Calle 5 Sg-Ctim») se ven en el mapa pero no se preguntan.
- También se cruzó con el **Callejero Fiscal 2026** del Ayuntamiento (2.691 entradas; su número de vía es
  el código INE que trae el CDAU): de las 2.551 que son calles, el mapa tiene el 96,6 %. De ahí salen 4
  vías más en `COMPLEMENTOS` y 3 nombres que el CDAU tiene mal y el mapa corrige (`CORRECCIONES`, solo
  mientras el CDAU no los cambie). El resto que falta son calles aún sin trazar o nombres antiguos.
- También lleva unos 600 **lugares importantes**: los de DERA g12 (hospitales, centros de salud, colegios,
  hoteles, instalaciones deportivas, comisarías…) y, para lo que DERA no tiene o le falta, OpenStreetMap
  (monumentos, parques, estaciones, polígonos, teatros, residencias, algunos colegios públicos). Los
  lugares grandes llevan un radio: vale tocar dentro. Si OpenStreetMap no responde en la sincronización,
  se conservan los de la semana anterior.
- Para cada vía y lugar, **qué parque de bomberos acude** según la línea divisoria del SEIS, con las 21
  vías que da la documentación de la academia (CO-3405, Av. del Brillante, Llanos del Pretorio, Pl. de
  España, Acera Guerrita, Pl. de Colón, Puerta del Rincón, Alfaros, Capitulares, Diario Córdoba, San
  Fernando, Pl. Cruz del Rastro, Puente de Miraflores, Carmen Olmedo Checa, Av. Campo de la Verdad, Pl.
  Santa Teresa, Av. de Cádiz, Pl. de Sor Pilar, Carretera de Castro, Av. de Granada y N-432): al este el
  Parque del Granadal y al oeste el Parque Central. La línea sigue el trazado de cada vía (y el camino
  más corto por las calles entre una y la siguiente).
  Las vías a menos de 150 m de la línea no se preguntan, porque no está claro a cuál le toca.
- Modos de juego: Localiza la calle, ¿Cómo se llama? (4 opciones), Di el nombre (se marca una calle, uno
  dice su nombre para sí, pulsa «Resolver» y se pone él mismo bien o mal), Cruces y paralelas (se calculan en la app con el trazado de las vías), Lugares importantes y
  ¿Qué parque acude?. Además, el Modo estudio.
- Pantalla, de arriba abajo: tareas del profesor, qué estudiar (zona), progreso, Aprender (modo estudio),
  Practicar (¿Cómo se llama?, Di el nombre, Localiza la calle), Relacionar (cruces y paralelas), Servicio
  (lugares y parque) y las últimas rondas.
- Progreso por habilidad (nombres, situar calles, cruces, lugares y parque), con la regla de los tests:
  dominada si nunca se ha fallado o si lleva 3 aciertos seguidos. Cada ronda empieza por lo fallado.
- Cada respuesta lleva un `uid` que pone la app: la cola sin conexión se sube sin duplicar ni perder nada.
- La app descarga un único archivo compacto (almacén público `callejero`, unos 900 KB) solo al
  abrir la pantalla; el service worker lo guarda para jugar sin conexión. El mapa (Leaflet) también
  se carga solo entonces. Tres estilos de mapa, sin nombres que den pistas: Sencillo y Plano
  (el trazado de las vías es el mapa, funcionan sin conexión) y Satélite (ortofotos PNOA del
  Instituto Geográfico Nacional, CC BY 4.0: la del último vuelo encima y la de «máxima actualidad»
  debajo; necesita conexión).

## Temario del callejero

La documentación de callejero de la academia (ficha General y una por distrito: Centro, Levante, Norte
Sierra, Poniente Norte, Poniente Sur, Sur y Sureste; faltan Noroeste y los dos periurbanos) está pasada a
datos en `datos/callejero-temario.json`: unos 1.200 elementos (colegios, plazas, recorridos desde el parque,
carreteras, salidas de la A-4, urbanizaciones, polígonos, puentes, arroyos, zonas inundables, calles con
otro nombre, datos generales y los planos de la Mezquita, el Alcázar y la Feria). Cada uno tiene un id fijo
(desde 5 000 000 000 000) y, cuando se ha podido, sus vías, su lugar o su barrio del mapa. Las imágenes de la
academia no se copian: todo se ve en el mapa del callejero y los tres planos están dibujados en
`js/callejero-temario.js`, a grandes rasgos.

- En Callejero, «Temario de la academia»: cada ficha con sus apartados. De cada apartado se ve la lista, se
  ve **en el mapa** (lo del apartado en azul; al tocarlo, su ficha; los recorridos numerados) y se
  **pregunta**: rondas del modo `temario` de hasta 20 preguntas, primero lo fallado, que se responden
  tocando el mapa, eligiendo entre opciones o tocando el plano.
- El progreso es por elemento, en la habilidad `temario` (misma regla de dominada).
- El profesor manda fichas o apartados (`callejero_tareas.fichas`, migración `20260928_callejero_temario.sql`):
  al alumno le salen como «Estúdiate esto», con su lista, su mapa y sus rondas, que cuentan para la tarea.
- El archivo lleva `?v=` con su huella (la pone `scripts/versionar.mjs` en el js que lo pide): el service
  worker lo guarda al usarlo y, cuando cambia, borra el anterior.

## Profesor del callejero

Un profesor es una cuenta normal (se registra con su correo como cualquiera y el administrador la
confirma) que el administrador marca como **Profesor del callejero** en Administración → Usuarios,
donde también le elige sus alumnos (`profiles.es_profesor` y tabla `tutorias`). No es administrador:
solo ve el callejero de sus alumnos, a través de funciones que lo comprueban.

- En Callejero ve «Mis alumnos | Mi callejero». Por cada alumno: cuándo estudió, rondas y aciertos de
  la semana, su progreso por habilidad (en la zona que elija), lo que más falla y sus últimas rondas.
- Le manda **tareas** (`callejero_tareas`): calles y lugares elegidos uno a uno en el mapa (tocándolos,
  buscándolos o añadiendo un barrio o distrito entero) o una zona entera; qué modos cuentan, cuántas
  rondas y con qué mínimo de aciertos, fecha límite y un mensaje. Se puede mandar a varios alumnos a la vez
  y crear una directamente con lo que el alumno más falla.
- Al alumno le salen arriba y cada tarea es una zona más: en sus rondas solo salen sus calles y lugares.
  Con **«solo esto»**, mientras la tarea esté activa el alumno solo puede elegir las tareas del profesor.
- Cada tarea tiene su conversación (`callejero_mensajes`). Tareas nuevas y mensajes se avisan con una
  notificación (`push-reminders`, a quien tenga activado el recordatorio) y con un número en la pestaña.

## Al cambiar un css/ o js/

Después de editar cualquier archivo de `css/` o `js/`, ejecuta:

```
node scripts/versionar.mjs
```

Actualiza el `?v=` de ese archivo en `index.html`. Si no se hace, los móviles que ya
tienen la app guardada seguirán usando la versión anterior del archivo. GitHub Actions
lo comprueba en cada push («Comprobar»).

Si añades un archivo nuevo, enlázalo en `index.html` en el sitio que le toque del orden
de carga (con `?v=0`, por ejemplo) y ejecuta el script. Lo mismo al cambiar un archivo de
`datos/`: el script actualiza su `?v=` en el js que lo pide.

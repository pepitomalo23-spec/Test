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
  callejero-profesor.js  Callejero: los alumnos del profesor, tareas y mensajes
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
- El archivo publicado lleva también los 68 barrios de Córdoba con su distrito y en qué barrios está
  cada vía; con eso la app deja elegir qué estudiar: toda Córdoba, un distrito, un barrio o las
  afueras y pedanías. Los barrios (`supabase/functions/callejero-sync/barrios.ts`) son los de los
  **planos de distrito del Ayuntamiento** que trae el temario, no los de DERA (g13_24), que son más
  bastos, dejan fuera manzanas (a Huerta de la Reina le faltaba un triángulo) y tienen barrios que el
  Ayuntamiento no tiene. Se sacaron así: se georreferenció cada plano sobre las calles del CDAU, se
  partió la ciudad en manzanas (los huecos entre los ejes de las calles) y cada manzana es del barrio
  del color que le da el plano; donde el plano está en blanco (calles, parques, urbanizaciones
  posteriores al plano como Santa Isabel Este o lo nuevo de El Naranjo) vale DERA. Así los bordes van
  por el eje de las calles, y la calle que hace de linde entre dos barrios es de los dos (cuenta lo que
  pasa a menos de 8 m del borde). Los polígonos industriales que nombra el temario (Chinales, Pedroches,
  Torrecillas, Amargacena y El Granadal) van como barrios de su distrito. Si cambian los planos hay
  que volver a generar `barrios.ts`.
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
  dice su nombre para sí, pulsa «Resolver» y se pone él mismo bien o mal), Cruces y paralelas (se calculan en la app con el trazado de las vías), Lugares importantes,
  ¿Qué parque acude?, y además:
  - **Barrios y distritos**: tocar el barrio o el distrito pedido, qué barrio es el marcado y de qué
    distrito es un barrio (las opciones falsas, los más cercanos). En una zona de un barrio, los de su
    distrito.
  - **¿En qué barrio está?**: se marca una calle y se elige su barrio entre 4 (los de al lado; si pasa por
    dos, vale el primero y el otro no sale).
  - **Nombra las calles**: de la zona (se puede cambiar arriba), se escriben o se dicen con el micrófono
    (reconocimiento de voz del navegador, en español) nombres de calles y cada una que está se pone en
    verde, con la cuenta. Vale sin «Calle», sin tildes, con alguna letra mal y una parte del nombre si
    ninguna otra calle de la zona la tiene; si hay varias que se llaman igual, la del tipo dicho y, si no,
    la calle. Al terminar, las que faltan salen en rojo (y tocándolas, su nombre).
  Además, el Modo estudio.
  Las respuestas de «Barrios y distritos» y «¿En qué barrio está?» entrenan la habilidad `barrios`
  (los barrios y distritos tienen ids fijos desde 6·10¹² y 6,1·10¹²); las de «Nombra las calles», la
  habilidad `memoria` (migración `20261003_callejero_barrios.sql`). La migración
  `20261003_callejero_calle3d.sql` deja guardar estos modos en las tareas del profesor (antes no se
  podían); también nombra `calle3d`, de un modo en 3D que se probó y se quitó, y que ya no se usa.
- **Aprender** y **Repasar**: el alumno elige el modo (1 ¿Cómo se llama?, 2 Localiza la calle, 3 Cruces y
  paralelas, 4 ¿Qué parque acude?; se salta lo que no tiene sentido para esa calle). Aprender saca primero lo que
  está a medias y luego calles nuevas, de la más fácil a la más difícil: más larga (hasta 2,5 km), de tipo
  importante (avenida, ronda, plaza…) y cerca del centro; lo de fuera de los barrios, al final. Repasar: todo lo
  estudiado vuelve cada vez más espaciado (1, 3, 7, 15 y 30 días según la racha de aciertos; si se falla,
  enseguida). Todo se calcula con `callejero_progreso` (la fecha de la última respuesta): no guarda nada nuevo.
- Pantalla, de arriba abajo: tareas del profesor, qué estudiar (zona), progreso, Aprender (modo estudio),
  Practicar (¿Cómo se llama?, Di el nombre, Localiza la calle), Relacionar (cruces y paralelas), Servicio
  (lugares y parque) y las últimas rondas.
- Progreso por habilidad (nombres, situar calles, cruces, lugares, parque, barrios y distritos, y de
  memoria), con la regla de los tests:
  dominada si nunca se ha fallado o si lleva 3 aciertos seguidos. Cada ronda empieza por lo fallado.
- Cada respuesta lleva un `uid` que pone la app: la cola sin conexión se sube sin duplicar ni perder nada.
- La app descarga un único archivo compacto (almacén público `callejero`, unos 900 KB) solo al
  abrir la pantalla; el service worker lo guarda para jugar sin conexión. El mapa (Leaflet) también
  se carga solo entonces. Tres estilos de mapa, sin nombres que den pistas: Sencillo y Plano
  (el trazado de las vías es el mapa, funcionan sin conexión) y Satélite (ortofotos PNOA del
  Instituto Geográfico Nacional, CC BY 4.0; necesita conexión). En Satélite solo se ve la del último
  vuelo (servicio de ortofotos provisionales, 2024-2025), con el doble de píxeles en pantallas retina;
  la de «máxima actualidad» (más antigua) solo entra en el trozo que falle o tarde más de 12 s. El
  servicio tarda unos 2 s por trozo y no tiene caché, así que el satélite se **guarda en el móvil**: el
  service worker guarda cada trozo (caché `pjfire-sat-v1`, caché primero, solo respuestas CORS, tope de
  1.500 trozos) y la app, por detrás y con prioridad baja, precarga lo de alrededor de lo que se ve
  (siguiente zoom en el centro, el anterior y los lados) y descarga toda Córdoba hasta el zoom 13 y la
  ciudad (la caja de sus barrios) hasta el 17: unos 570 trozos, ~125 MB, una sola vez (con datos
  móviles, si el móvil lo dice, hasta el 16: ~50 MB; nada con el ahorro de datos). Si se cierra antes,
  sigue la siguiente vez; al terminar se apunta en el dispositivo. El menú de estilos dice cómo va.
  Después, también de cerca (zoom 18) lo que se estudia: los trozos por los que pasan las calles y los
  lugares del profesor (y los de al lado) y, del barrio o distrito marcado, los que tienen calles (como
  mucho 300; no con datos móviles). Los del zoom de al lado del que se ve se tienen además descodificados
  en memoria (los últimos 12), y la foto no tiene fundido y carga en cada nivel al pellizcar: al ampliar y
  alejar está toda en unos 30 ms.
- Todas las líneas (las calles y todo lo resaltado encima) van en un solo lienzo con el mayor margen que
  admite el dispositivo (hasta una pantalla a cada lado, sin pasar de ~14 megapíxeles, el límite del
  iPhone y el iPad es ~16): al alejar de golpe ya están pintadas alrededor.
- Las calles (y lo resaltado encima) se ensanchan al acercarse, como en un plano de verdad: cada línea
  tiene su grosor de lejos y su anchura en metros, y se pinta con el mayor de los dos. Al alejarse del
  zoom 16 adelgazan (las calles, hasta el 40 %; lo resaltado, hasta el 60 %), para que de lejos se vean
  finas y no tapen el mapa.
- **Marcar un barrio o distrito**: en todos los mapas, un botón en la columna de la derecha abre un
  buscador con los distritos y los barrios; lo elegido queda marcado (línea blanca con borde oscuro y su
  nombre) mientras se estudia y en los siguientes mapas, hasta quitarlo (se recuerda en el dispositivo).
  Solo es para verlo: no cambia la zona de las preguntas. De un distrito se marca solo el borde de fuera:
  se juntan los vértices a menos de ~12 m, se parte cada lado por los vértices que caen encima y se
  quedan los tramos que no comparte ningún otro barrio.

## Temario del callejero

La documentación de callejero de la academia (ficha General y una por distrito: Centro, Levante, Norte
Sierra, Poniente Norte, Poniente Sur, Sur y Sureste; faltan Noroeste y los dos periurbanos) está pasada a
datos en `datos/callejero-temario.json`: unos 1.200 elementos (colegios, plazas, recorridos desde el parque,
carreteras, salidas de la A-4, urbanizaciones, polígonos, puentes, arroyos, zonas inundables, calles con
otro nombre, datos generales y los planos de la Mezquita, el Alcázar y la Feria). Cada uno tiene un id fijo
(desde 5 000 000 000 000) y, cuando se ha podido, sus vías, su lugar o su barrio del mapa. Los planos para
responder tocando están dibujados en `js/callejero-temario.js`, a grandes rasgos.

- **Documento original**: las páginas de cada PDF (con todos sus mapas), en WebP, en el almacén **privado**
  `temario` de Supabase (`v1/<documento>/<página>.webp`; migración `20260928b_temario_documento.sql`): solo
  las pueden leer los usuarios aprobados y no bloqueados. No van en el repositorio, que es público. Cada ficha
  tiene su pestaña «Documento»; cada apartado, sus mapas del documento en miniatura y el enlace a sus
  páginas (`secciones[].docs` del JSON), y los barrios, recorridos y polígonos, su página (`pg`). El service
  worker guarda las páginas vistas con los datos del usuario (se borran al cerrar sesión).

- La pantalla del Callejero son solo tres botones grandes, y cada uno abre su pantalla (con «‹» para volver):
  **Lo que te ha mandado** (las tareas sin terminar y las hechas), **Repasar lo estudiado** (cada modo y el
  temario, con lo que toca hoy) y **Aprender** (calles nuevas por modo, con la zona; las fichas del temario; y
  «Mapa libre y todos los modos»). Si el profesor ha mandado algo nuevo, al entrar sale una ventanita
  («Estudiar esto» abre solo esa tarea; una vez por sesión).
- En las rondas del temario, las preguntas de opciones que no dibujan nada antes de responder (datos,
  distritos, carreteras, parque…) salen sin mapa (clase `cj-sin-mapa`): solo la pregunta y las opciones.
- Cada ficha se ve en cuatro pestañas: **Lista** (los apartados; al abrir uno, sus botones, los mapas del
  documento y la lista), **Documento** (las páginas originales), **Mapa** (lo de la ficha o de un apartado
  **en el mapa**: en azul; al tocarlo, su ficha; los recorridos numerados; y el mapa libre de su distrito) y
  **Preguntar** (toda la ficha o un apartado: rondas del modo `temario` de hasta 20 preguntas, primero lo
  fallado, que se responden tocando el mapa, eligiendo entre opciones o tocando el plano; y los modos de
  juego con las calles de su distrito o, en la General, de toda Córdoba).
- Una tarea (y «Todo lo que te ha mandado») se ve con las mismas pestañas: su temario, sus calles y lugares y
  su zona en la Lista; en Preguntar, las rondas del temario y los modos de juego con sus calles, que cuentan
  para la tarea.
- **Mapa libre**: lo que ha mandado el profesor sale en morado; dentro del mapa, arriba, se elige qué tocar
  (Calles, Lugares —todos como puntos— o Profesor —solo lo suyo, con su lista—). Con el botón de colores
  (al lado), cada cosa del profesor sale de un color distinto, también con su punto en la lista (se
  recuerda). Todos los mapas (también
  jugando) tienen un botón para ponerlos a **pantalla completa**: el mapa ocupa todo el móvil, de borde a
  borde (y sin las barras del navegador donde se puede; en el iPhone, no), y lo demás flota encima en
  recuadros pequeños que se pliegan con un toque: arriba, la pregunta con las respuestas o el buscador;
  abajo, lo que se ha tocado; los créditos, en un botón «i». Se recuerda en el dispositivo para los
  siguientes mapas y se quita con el mismo botón o con «atrás».
- El progreso es por elemento, en la habilidad `temario` (misma regla de dominada).
- El profesor tiene el temario entero en su pestaña «Temario» y **manda desde él**: en cada ficha, «Mandar la
  ficha», el botón «Mandar» de cada apartado o «Elegir cosas sueltas»; se abre la tarea ya rellena (título y,
  si solo tiene un alumno, el alumno) y al mandarla vuelve a la ficha. También puede elegir desde el formulario
  de la tarea («Elegir en el temario»: el documento, los mapas y las listas, con casillas): fichas enteras, apartados o cosas sueltas (`callejero_tareas.fichas`: `centro`,
  `centro/plazas` o `centro/plazas/<id>`). Al alumno le sale como tarea, con solo eso en la lista,
  el mapa y las rondas, que cuentan para la tarea.
- El archivo lleva `?v=` con su huella (la pone `scripts/versionar.mjs` en el js que lo pide): el service
  worker lo guarda al usarlo y, cuando cambia, borra el anterior.

## Profesor del callejero

Un profesor es una cuenta normal (se registra con su correo como cualquiera y el administrador la
confirma) que el administrador marca como **Profesor del callejero** en Administración → Usuarios,
donde también le elige sus alumnos (`profiles.es_profesor` y tabla `tutorias`). No es administrador:
solo ve el callejero de sus alumnos, a través de funciones que lo comprueban.

- En Callejero ve dos pestañas, **Alumnos** y **Temario**, y el enlace «Mi callejero ›» (el de un alumno, con
  «‹ Volver a mis alumnos» arriba). En Alumnos, cada uno con un semáforo (verde: estudió en los 2 últimos días;
  ámbar: esta semana; rojo: hace más o nunca), rondas y aciertos de la semana, tareas y mensajes sin leer.
- La página de un alumno va en pestañas: **Tareas**, **Progreso** (temario, calles en la zona que elija y
  últimas rondas), **Fallos** (lo que más falla, con botón para mandárselo) y **Mensajes** (la conversación de
  cada tarea); «Mandar tarea» está siempre a mano.
- Le manda **tareas** (`callejero_tareas`) en dos pasos. 1) Qué: fichas, apartados o cosas sueltas del temario;
  calles y lugares elegidos uno a uno en el mapa (tocándolos, buscándolos o añadiendo un barrio o distrito
  entero); una zona entera; o varias de las tres cosas juntas en la misma tarea. 2) Para quién, título y
  mensaje; plegado en «Más opciones»: cuántas rondas y con qué mínimo de aciertos, fecha límite, qué modos
  cuentan con las calles (las preguntas del temario cuentan siempre) y «solo esto». Se puede mandar a varios
  alumnos a la vez y crear una directamente con lo que el alumno más falla (temario y calles, juntos).
- Al alumno le salen en «Lo que te ha mandado» (y en la ventanita, si son nuevas) y lo de calles de cada tarea es una zona más: en sus rondas solo salen sus calles
  y lugares (y los de su zona, si la lleva).
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

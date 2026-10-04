# Plan de estudio: investigación, diseño y limitaciones

Gestor personal de estudio dentro de pj.fire (pantalla **Plan**): qué test toca cada día y en qué orden,
abrirlo desde un único panel, registrar lo que se hace, avisar cuando uno se sale del plan y preparar
exámenes combinando las fuentes que se pueden usar legítimamente.

Investigación hecha el 3 y 4 de octubre de 2026, solo con páginas **públicas**: sin iniciar sesión en
Tutor Bombero, sin enviar formularios y sin probar comunicaciones internas. Cada afirmación lleva su fuente.

---

## Fase 1. Qué permite realmente Tutor Bombero

### Qué es

«Tutor Bombero» es **Tutorbomberos.es** y su plataforma de test se llama **TOB**
([packsTOB](https://tutorbomberos.es/TEST/packsTOB.html)). Es una aplicación web propia (Java sobre Tomcat, en
`tutorbomberos.es/TEST/`), no un Moodle ni otra plataforma de terceros, así que no hay un fabricante con una API
documentada a la que pedir acceso. No tiene app en App Store ni en Google Play: es una web adaptada a móvil y
tablet. El titular es una persona física, con el contacto público `info@tutorbomberos.es`
([aviso legal](https://tutorbomberos.es/TEST/avisoLegal.html)).

Funciones que anuncia ([sobreTOB](https://tutorbomberos.es/TEST/sobreTOB.html), [packs](https://tutorbomberos.es/TEST/packsTOB.html)):
simulador de exámenes y simulacros, configurar exámenes, marcar preguntas, preguntas falladas, estadísticas («Podrás
ver tus progresos en cada test»), preguntas y tarjetas propias, y descarga de contenido didáctico (temario y
exámenes resueltos en PDF). Pago único (Pack Premium 99,95 €).

### Análisis, por orden

| # | Vía | Resultado |
|---|---|---|
| 1 | Exportación, descarga, historial o acceso oficial a resultados | **No existe.** Solo se descarga contenido didáctico (PDF); los resultados solo se ven dentro de la plataforma. No hay CSV, PDF ni API de resultados en ninguna página pública. |
| 2 | Integración oficial o pedir acceso al proveedor | **No hay integración** (ni API, webhooks, LTI, SCORM ni iCal). Lo único posible es **pedírselo al titular**: una copia de tus resultados por los arts. 15 y 20 del RGPD (derecho de acceso y portabilidad: plazo de un mes, gratis) o un permiso escrito. Borrador al final. |
| 3 | Consultar los datos a través de las comunicaciones internas de la web | **No es una vía autorizada.** La zona privada funciona con formularios POST y una cookie de sesión (JSESSIONID). No hay enlaces directos (GET) a cada test ni una API documentada. Usarlas exigiría guardar tu sesión o tus credenciales fuera de Tutor Bombero y depender de algo interno y cambiante. Las condiciones no lo autorizan. |
| 4 | Automatizar un navegador (Playwright) | **Técnicamente posible, no autorizado.** Ver «Automatización» más abajo. |
| 5 | Alternativa semiautomática | **Es lo que se ha implementado** (ver Fase 2), con el **marcador** de Safari (más abajo). |

### Condiciones de uso (literal)

Todo el texto legal está en una sola página ([aviso legal](https://tutorbomberos.es/TEST/avisoLegal.html)):

- «El acceso al contenido docente de la web Tutorbomberos.es es **personal e intransferible**, válido para un único usuario.»
- Prohíbe el uso del material por academias, centros docentes o clases particulares.
- Prohíbe «la apropiación del material docente por medio de capturas de pantalla y sistemas de captura de video **cuando tengan como fin su divulgación a terceros**».
- Si se incumplen: «el acceso a la web será inmediatamente anulado y en su caso se emprenderán las acciones legales pertinentes». Los términos pueden cambiar sin aviso.
- No dicen nada de robots, scraping o automatización: **ni lo permiten ni lo prohíben**. Que el proyecto sea personal no lo convierte en un permiso.
- No hay robots.txt (da 404), y su ausencia tampoco es un permiso.

Sobre el contenido: la Ley de Propiedad Intelectual protege las bases de datos (arts. 133-135 TRLPI). El usuario
legítimo puede usar partes **no sustanciales** (art. 134.1), pero no extraerlas de forma repetida o sistemática; y la
copia privada no cubre las bases de datos electrónicas (art. 31.3.b). Por eso el Plan **no importa** preguntas de Tutor
Bombero en bloque: solo deja apuntar a mano, una a una, alguna pregunta suelta para el repaso propio.

### Automatización en la nube: por qué no

| Opción | Coste | ¿Puede ejecutar Chromium? | Problema |
|---|---|---|---|
| GitHub Actions (este repo es **público**) | 0 | Sí | Los logs y artefactos los ve cualquiera con cuenta de GitHub; el ocultado de secretos «no está garantizado»; IP de centro de datos (Azure). |
| GitHub Actions en un repo privado aparte | 0 (2.000 min/mes) | Sí | Mismo riesgo con las condiciones de Tutor Bombero. |
| Vercel Functions (Hobby) | 0 | Sí, con `@sparticuz/chromium` | Cron 1 vez al día; exige un paso de compilación que esta web no tiene; región en EE. UU. |
| Supabase Edge Functions | 0 | No (256 MB, 2 s de CPU) | Solo podría orquestar un navegador remoto. |
| Navegador remoto (Browserless…) | 0 con cupo | Remoto | Tus credenciales pasarían a otro tercero. |

En todos los casos habría que guardar tu usuario y contraseña de Tutor Bombero en un servidor (y el acceso es
«personal e intransferible»), arriesgar una cuenta de pago (99,95 €) si lo consideran un incumplimiento, y depender
de que no cambie su HTML. Recomendación: **no automatizar sin autorización escrita del titular**.

### Qué se puede hacer desde el iPad (Safari)

- Una web **no puede saber** que has terminado un test en otra web: lo impiden la política de mismo origen, el
  bloqueo de cookies de terceros de Safari (ITP) y que el enlace se abre aparte (`noopener`). Lo único que la app
  sabe es cuándo **vuelves** a ella (`visibilitychange`).
- Tutor Bombero en un iframe: no funcionaría (Safari bloquea su cookie de sesión dentro de otra web), y pj.fire
  tampoco lo permite por su política de seguridad.
- **Texto en vivo** (iPadOS 15+) permite copiar el texto de una captura de pantalla; `navigator.clipboard.readText`
  lo lee al pulsar un botón (Safari pide permiso con un menú «Pegar»). Es lo que usa «Pegar resultado».
- **Atajos** puede ejecutar JavaScript sobre la página de Safari desde la hoja de compartir y enviar el texto a una
  API propia. Añadiría un punto de entrada con token; se descartó a favor del marcador, que no envía nada.
- **Marcador** (favorito de Safari con `javascript:`, implementado): lo toca el usuario estando en Tutor Bombero,
  con su sesión ya iniciada por él. Carga `marcador/tutor-bombero.js` de pj.fire, que **solo lee la página que
  tiene delante**: en una lista de tests, los nombres de los tests y su tema; en la pantalla de resultados, solo las
  líneas con números (aciertos, fallos, en blanco, nota), nunca las preguntas. Enseña lo encontrado y, solo si se
  pulsa «Copiar», lo copia al portapapeles; en pj.fire, «Pegar de Tutor Bombero» lo añade al catálogo (cada test en
  su tema, sin duplicados) o guarda el resultado en su tarea. No hace peticiones de red, no lee cookies ni
  formularios, no pulsa nada y no navega: equivale a copiar y pegar a mano, más rápido. Tutor Bombero no tiene CSP,
  así que el marcador funciona (comprobado el 4-10-2026). Sus condiciones no hablan de esto (ni lo permiten ni lo
  prohíben); si algún día lo prohíben, se deja de usar. Como no se puede ver la zona privada sin la sesión del
  usuario, el marcador **deduce** dónde están los tests y el resultado; si no acierta, ofrece «Copiar diagnóstico»
  (estructura de la página, sin correos ni números largos) para ajustarlo.
- Web Share Target no está soportado en Safari, y las extensiones de Safari exigen la cuenta de desarrollador de
  Apple (99 $/año).

### Dónde alojarlo

Se mantiene lo que ya existe: **Vercel (Hobby) + Supabase (Free)**. Integrarlo en pj.fire, en vez de hacer otra web,
aprovecha el inicio de sesión, la aprobación de cuentas y el control de dispositivos, la app instalada en el iPad,
el banco de preguntas y su motor de tests, y las copias de seguridad. Además, el plan gratuito de Supabase admite
2 proyectos activos y la cuenta ya tiene 2. Netlify Free encaja peor (menos despliegues) y GitHub Pages no sirve
para algo privado (repositorio público). El repositorio es público: no hay ni habrá credenciales en él.

---

## Fase 2. Diseño

### Arquitectura

```
iPad (Safari / app instalada)                         Supabase (Postgres + RLS)
┌───────────────────────────────┐                     ┌─────────────────────────────┐
│ pj.fire · pantalla «Plan»     │  HTTPS (JWT propio) │ plan_ajustes  plan_temas     │
│  Hoy · Plan · Tests ·         │ ──────────────────▶ │ plan_tests    plan_tareas    │
│  Exámenes · Progreso          │                     │ plan_resultados plan_eventos │
│  cola sin conexión (uuid)     │                     │ plan_preguntas               │
│  motor de tests de pj.fire ───┼──▶ test_sessions …  │ (RLS: solo el dueño, y solo  │
└──────────────┬────────────────┘                     │  con el permiso «plan»)      │
               │ «Abrir» → pestaña nueva              └─────────────────────────────┘
               ▼
      tutorbomberos.es (sin conexión técnica: solo el enlace)
```

Archivos: `js/plan-logica.js` (lógica pura, probada en Node), `js/plan.js` (datos, cola, Hoy, Plan, Tests,
Ajustes), `js/plan-examen.js` (exámenes y preguntas propias), `js/plan-progreso.js` (estadísticas), sus `css/plan*.css`
y la migración `supabase/migrations/20261003c_plan_estudio.sql`.

### Base de datos

| Tabla | Qué guarda | Claves que evitan duplicados |
|---|---|---|
| `plan_ajustes` | límite diario (1-20), días de estudio, reglas | una fila por usuario |
| `plan_temas` | los temas de la oposición y con qué temas del banco se corresponden | nombre único |
| `plan_tests` | catálogo: plataforma (Tutor Bombero / pj.fire / otra), nombre, identificador, enlace, configuración | misma plataforma + identificador (o nombre) |
| `plan_tareas` | un test programado un día: prioridad, estado (pendiente, en curso, completado, aplazado), origen (plan, automático, repaso, excepción), cuándo se abrió y se completó | mismo test el mismo día |
| `plan_resultados` | resultados: aciertos, fallos, en blanco, total, nota, duración (medida o apuntada), detalle por pregunta | id de la app; sesión del banco única |
| `plan_eventos` | actividad: abierto, completado, aplazado, avisos y excepciones | id de la app |
| `plan_preguntas` | preguntas propias (con su fuente y referencia) para los exámenes | enunciado único |

Todas: `user_id` con RLS `user_id = auth.uid() and plan_permitido()`, solo para `authenticated` (anon sin
permisos). `plan_permitido()` exige ser administrador o tener `feature_flags.plan = true` estando aprobado y no
bloqueado: el permiso es **opt-in** (apagado para todos los demás). Desde la app, ni el administrador ve los planes
de otros; la copia de seguridad diaria (que solo descarga el administrador) sí los incluye.
Las referencias entre tablas llevan también el `user_id` (claves foráneas compuestas): nadie puede colgar algo
suyo de un tema, test o tarea de otro aunque conozca su id. Probado con 82 pruebas (`tests/plan/db`).

### Flujos

1. **Hoy**: la lista del día ordenada (en curso, prioridad, lo aplazado antes) y numerada, con su botón «Abrir».
   Al lado, las atrasadas (con «Hacer hoy» o «Aplazar») y sugerencias si queda hueco (repasos de temas flojos y
   tests sin hacer).
2. **Abrir un test de Tutor Bombero**: abre su página de entrada (o el enlace guardado) en otra pestaña, y la
   tarea pasa a «en curso» con un evento «abierto». **No se completa.** Como no hay enlaces directos, se muestra
   qué buscar allí («Busca: «Tema 5 · Test 3»»).
3. **Al volver** (pasados 20 s): «¿Has terminado «Test 3»?» → apuntar el resultado (a mano o pegándolo), «Aún no»
   o «Lo dejo para otro día». La tarjeta «en curso» sigue en Hoy hasta que se confirme.
4. **Test del banco de pj.fire**: se lanza en el motor de tests de la app y, al terminar, se apunta solo
   (resultado con su sesión, tarea completada).
5. **Fuera del plan**: abrir algo que no toca hoy avisa («Este test no está en tu plan de hoy») con «Ver mis tareas de
   hoy», «Añadirlo a hoy» o «Abrirlo igualmente (excepción)». Abrir uno ya hecho pide confirmación. Todo queda en la actividad.
6. **Límite diario**: no se añade por encima sin autorizar una excepción. **Planificar automáticamente** reparte
   lo pendiente por los días de estudio, primero lo atrasado y los temas más flojos.
7. **Exámenes combinados**: temas, nº de preguntas, fuentes (banco y preguntas propias), sin repetidas, cada una con
   su fuente, corrección con la explicación; los fallos alimentan «Errores recurrentes» y los exámenes de repaso.
   La parte del banco cuenta también en Legislación (Fallos, Estadísticas).
8. **Progreso**: plan cumplido, tests hechos y pendientes, nota media, % de aciertos, tiempo (medido por la app /
   apuntado por ti), evolución, previsto frente a hecho, aciertos por tema, temas a reforzar e historial.

### Privacidad y seguridad

- Privado por diseño (RLS + permiso opt-in); en la app, el plan de cada uno no lo ve nadie más (la copia de seguridad diaria lo incluye).
- Importar una copia valida cada fila (solo columnas conocidas, tipos y valores permitidos) y descarta lo demás.
- Sin credenciales de Tutor Bombero en ningún sitio; sin contenido suyo importado en bloque; sin conexión técnica con su web.
- Todo texto se pinta escapado; los enlaces solo pueden ser `http(s)` y se abren con `noopener`.
- Exportación e importación de tus datos en JSON (sin duplicar), y las tablas del plan entran en la copia diaria (`backup-db`).
- Al cerrar sesión se borra la copia local del plan (los cambios pendientes de subir se conservan para no perderlos).

---

## Limitaciones conocidas

- **Tutor Bombero no se puede bloquear ni leer**: el Plan solo controla lo que se abre desde él. Si entras
  directamente en Tutor Bombero, el Plan no se entera.
- **No hay enlace a cada test** de Tutor Bombero: se abre su página de entrada y hay que buscar el test.
- **El resultado de Tutor Bombero lo traes tú**: con el marcador (dos toques) o pegándolo/escribiéndolo. Si no lo
  confirmas, el test no cuenta como hecho. Las preguntas de Tutor Bombero no se copian: el simulacro con sus
  preguntas se hace allí, y pj.fire lo programa y lo puntúa (nota con penalización, como sus simulacros).
- **El marcador no está probado contra la web real** (su zona privada exige iniciar sesión): está probado con
  páginas simuladas de distintas formas. La primera vez puede necesitar un ajuste («Copiar diagnóstico»).
- **El tiempo de Tutor Bombero no se mide**: solo cuenta el que apuntes. El tiempo «medido» es el de los tests de
  pj.fire y los exámenes del plan. En los tests de pj.fire es el tiempo de reloj (si se deja a medias y se sigue
  otro día, no cuenta como medido).
- **Detectar la vuelta** depende de que Safari avise al volver a la app; si no, la tarea sigue «en curso» en Hoy
  con su botón «Apuntar resultado».
- Las pruebas de interfaz se han hecho en Chromium con tamaño y agente de iPad, no en un iPad real: conviene un
  repaso a mano en el iPad (lista más abajo).
- Sin recordatorios push del plan todavía (la app ya tiene el «Recordatorio diario»; ampliarlo es el siguiente paso).

### Repaso a mano en el iPad

1. Abrir «Plan», crear temas («Crear varios») y unos tests («Añadir varios»).
2. Programar 3 para hoy y probar a añadir un 4.º (debe pedir excepción).
3. «Abrir» uno de Tutor Bombero, volver a la app pasados 20 s y apuntar el resultado.
4. Hacer una captura del resultado en Tutor Bombero, copiar su texto con Texto en vivo y usar «Pegar resultado».
5. Abrir desde Tests uno que no toque hoy (debe avisar).
6. Hacer un examen combinado y mirar Progreso.
7. Instalar el marcador (Ajustes › Tutor Bombero › «Instalar el marcador»). En Tutor Bombero, tocarlo en la
   página de tus tests por temas, «Copiar para pj.fire» y en pj.fire «Pegar de Tutor Bombero».
8. Hacer un test en Tutor Bombero, tocar el marcador en la pantalla de resultados, «Copiar resultado» y «Pegar de
   Tutor Bombero» en Hoy: la tarea debe quedar hecha con su nota. Si algo no sale, «Copiar diagnóstico».

---

## Borrador de correo al titular de Tutor Bombero

Para: `info@tutorbomberos.es` (el contacto que publica la web). También está en el Plan: Ajustes › Tutor Bombero.

> **Asunto:** Solicitud de copia de mis datos y resultados (arts. 15 y 20 del RGPD)
>
> Hola:
>
> Soy usuario de la plataforma TOB con el usuario «[tu usuario]». Os escribo para ejercer mi derecho de acceso
> (art. 15 del Reglamento General de Protección de Datos) y, en lo que corresponda, de portabilidad (art. 20): os pido
> una copia de los datos personales que tratáis sobre mí y, en particular, de mi historial de tests y resultados
> (fecha, test, aciertos, fallos y nota), en un formato electrónico de uso común, por ejemplo CSV o JSON.
>
> También quería preguntaros si tenéis, o tenéis previsto, algún modo de exportar los resultados, y si os parece bien
> que lleve mi propio registro de estudio con ellos, solo para uso personal.
>
> Muchas gracias.
>
> Un saludo,
> [tu nombre]

## Fuentes principales

- Tutor Bombero: [aviso legal](https://tutorbomberos.es/TEST/avisoLegal.html) · [sobre TOB](https://tutorbomberos.es/TEST/sobreTOB.html) · [packs](https://tutorbomberos.es/TEST/packsTOB.html) · [servicios y FAQ](https://tutorbomberos.es/TEST/servicios.html) · [contacto](https://tutorbomberos.es/TEST/contacto.html)
- RGPD (arts. 12, 15 y 20): [BOE, DOUE-L-2016-80807](https://www.boe.es/buscar/doc.php?id=DOUE-L-2016-80807) · Guía de portabilidad WP242: [AEPD](https://www.aepd.es/sites/default/files/2019-09/wp242rev01-es.pdf)
- Ley de Propiedad Intelectual (arts. 31, 133-135): [BOE-A-1996-8930](https://www.boe.es/buscar/act.php?id=BOE-A-1996-8930)
- GitHub Actions: [facturación](https://docs.github.com/en/billing/concepts/product-billing/github-actions) · [uso seguro](https://docs.github.com/en/actions/reference/security/secure-use)
- Vercel: [límites de Functions](https://vercel.com/docs/functions/limitations) · [plan Hobby](https://vercel.com/docs/plans/hobby) · Supabase: [precios](https://supabase.com/pricing) · [límites de Edge Functions](https://supabase.com/docs/guides/functions/limits)
- Navegadores: [política de mismo origen (MDN)](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)

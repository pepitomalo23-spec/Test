# Reserva automática de piscina (IMDECO)

Robot que reserva calle en la piscina del PMD Vista Alegre (gestiones.imdcordoba.es) a las 00:00 en punto,
que es cuando se abre el día de dentro de 2 días.

## Puesta en marcha (una vez)

1. En GitHub: **Settings → Secrets and variables → Actions → New repository secret** y crea:
   - `IMD_USUARIO`: tu identificador de IMDECO
   - `IMD_CONTRASENA`: tu contraseña
2. Haz una prueba: **Actions → Reservar piscina → Run workflow**, con una fecha que ya esté abierta
   y la casilla «Solo prueba» marcada. Entra con tu usuario y llega hasta elegir calle, pero no reserva.

## Uso normal

- **Apuntar un día:** Actions → **Programar piscina** → Run workflow → fecha (p. ej. `23/10/2026`) y hora.
  Puedes apuntar con toda la antelación que quieras. El día D se reserva solo a las 00:00 del día D-2.
- **Quitar un día:** igual, eligiendo «Quitar ese día».
- **Ver lo apuntado:** igual, eligiendo «Solo ver la lista».
- **Reservar ya un día que ya está abierto:** Actions → **Reservar piscina** → fecha y hora, sin marcar «Solo prueba».

Cada noche a las 23:35, «Reservar piscina» mira la lista. Si toca reservar, entra en la web,
lo deja todo preparado y a las 00:00 coge la primera calle libre a tu hora. Si no lo consigue,
la ejecución sale en rojo y GitHub te manda un correo.

## Cómo está hecho

- `reservar.mjs`: el robot (Playwright). Las opciones están explicadas al principio del archivo.
- `programar.mjs`: apunta y quita días en `reservas.json`.
- La lista de verdad vive en la rama `piscina` (así apuntar días no despliega la web en Vercel).
- Horas que ofrece la piscina: mañana 08:00 y 09:00, mediodía 13:00, 14:00 y 15:00, tarde 22:00.
- El repo es público: los registros no muestran datos personales, pero las fechas apuntadas sí se ven.

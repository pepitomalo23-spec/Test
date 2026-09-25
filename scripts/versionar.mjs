#!/usr/bin/env node
/* =====================================================================
   Pone a cada css/…  y js/… que enlaza index.html un ?v= con la huella
   de su contenido (p. ej. js/test.js?v=3f9a1c20b7).
   ---------------------------------------------------------------------
   Así, en cuanto cambia un archivo cambia su dirección, y el service
   worker (sw.js) y el navegador descargan el nuevo sin mezclar nunca
   archivos de versiones distintas.

   Uso (desde la raíz del repositorio):
     node scripts/versionar.mjs          → actualiza index.html
     node scripts/versionar.mjs --check  → solo comprueba (falla si falta
                                           actualizar; lo usa GitHub Actions)
   ===================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(root, 'index.html');
const html = readFileSync(indexPath, 'utf8');

const huella = file => createHash('sha256').update(readFileSync(join(root, file))).digest('hex').slice(0, 10);

const cambiados = [];
const nuevo = html.replace(/((?:src|href)=")((?:css|js)\/[^"?]+)(?:\?v=[^"]*)?"/g, (_, attr, file) => {
  const url = `${file}?v=${huella(file)}`;
  if (!html.includes(`"${url}"`)) cambiados.push(file);
  return `${attr}${url}"`;
});

if (process.argv.includes('--check')) {
  if (cambiados.length) {
    console.error('index.html tiene versiones (?v=) sin actualizar en:\n  ' + cambiados.join('\n  '));
    console.error('Ejecuta: node scripts/versionar.mjs');
    process.exit(1);
  }
  console.log('Versiones de css/ y js/ al día.');
} else if (nuevo !== html) {
  writeFileSync(indexPath, nuevo);
  console.log('Actualizado index.html:\n  ' + cambiados.join('\n  '));
} else {
  console.log('Nada que actualizar.');
}

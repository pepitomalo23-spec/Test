#!/usr/bin/env node
/* =====================================================================
   Genera el marcador (bookmarklet) de tutorbomberos.es a partir de su
   código legible, scripts/marcador/tutorbomberos.js, y lo deja listo para
   pegar en el navegador en datos/marcador-tutorbomberos.txt (lo copia el
   botón «Copiar marcador» de Administración › Específico).

   Uso (desde la raíz del repositorio):
     node scripts/marcador.mjs
   Después: node scripts/versionar.mjs (cambia el ?v= del archivo de datos/).
   ===================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let src = readFileSync(join(root, 'scripts/marcador/tutorbomberos.js'), 'utf8');
src = src.replace(/^\/\*[\s\S]*?\*\/\s*/, '');            // comentario de cabecera
const code = src.split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('//'))                    // líneas en blanco y comentarios de línea
  .join('\n');
new Function(code);                                         // falla aquí si quedara algo roto
writeFileSync(join(root, 'datos/marcador-tutorbomberos.txt'), 'javascript:' + encodeURIComponent(code) + '\n');
console.log('datos/marcador-tutorbomberos.txt: ' + (code.length / 1024).toFixed(1) + ' KB de código');

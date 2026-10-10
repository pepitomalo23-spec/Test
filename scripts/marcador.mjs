#!/usr/bin/env node
/* =====================================================================
   Genera el marcador (bookmarklet) de tutorbomberos.es a partir de su
   código legible y los deja listos para pegar en el navegador:
     scripts/marcador/tutorbomberos.js       → datos/marcador-tutorbomberos.txt (un test)
     scripts/marcador/tutorbomberos-todo.js  → datos/marcador-tutorbomberos-todo.txt (todos)
                                             y datos/marcador-tutorbomberos-revisar.txt (revisar cambios)
   Los copian los botones de Administración › Específico.

   Uso (desde la raíz del repositorio):
     node scripts/marcador.mjs
   Después: node scripts/versionar.mjs (cambia el ?v= de los archivos de datos/).
   ===================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const marcadores = [
  ['tutorbomberos', 'tutorbomberos'],
  ['tutorbomberos-todo', 'tutorbomberos-todo'],
  // «Revisar cambios»: el mismo código que «Extraer todo» con otro modo.
  ['tutorbomberos-revisar', 'tutorbomberos-todo', s => s.replace('const MODO = "todo";', 'const MODO = "revisar";')],
];
for(const [nombre, fuente, cambiar] of marcadores){
  let src = readFileSync(join(root, 'scripts/marcador/' + fuente + '.js'), 'utf8');
  if(cambiar){
    const antes = src;
    src = cambiar(src);
    if(src === antes) throw new Error(nombre + ': no se pudo cambiar el modo');
  }
  src = src.replace(/^\/\*[\s\S]*?\*\/\s*/, '');            // comentario de cabecera
  const code = src.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//'))                  // líneas en blanco y comentarios de línea
    .join('\n');
  new Function(code);                                       // falla aquí si quedara algo roto
  writeFileSync(join(root, 'datos/marcador-' + nombre + '.txt'), 'javascript:' + encodeURIComponent(code) + '\n');
  console.log('datos/marcador-' + nombre + '.txt: ' + (code.length / 1024).toFixed(1) + ' KB de código');
}

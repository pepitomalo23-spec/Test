/* Utilidades del árbol del temario (Título / Capítulo / Sección / Artículo)
   que usan tanto las pantallas del alumno como la administración. */

const NODE_TYPE_LABEL = { titulo:'Título', capitulo:'Capítulo', seccion:'Sección', articulo:'Artículo', libre:'Estructura (nombre libre)', estructura:'Estructura' };
/* Dos niveles "genéricos" para documentos que no encajan en la jerarquía
   Título > Capítulo > Sección > Artículo (p.ej. "Disposiciones adicionales",
   "Anexo I", "Parte segunda"...). Ambos tienen nivel 0: pueden colgar de
   cualquier sitio y admiten cualquier tipo debajo (ver allowedChildTypes).
   - "libre": sin ningún prefijo automático; el nombre que se escriba
     aparece tal cual ("Anexo I", no "Título Anexo I").
   - "estructura": sí antepone prefijo, igual que título/capítulo/sección/
     artículo, pero con la palabra "Estructura" ("Estructura N"). */
const NODE_TYPE_LEVEL = { libre:0, titulo:1, capitulo:2, seccion:3, articulo:4, estructura:0 };
/* El nodo "General" es un Título especial (raíz, sin número, nombre "General")
   que sirve de cajón de sastre para preguntas sin artículo concreto. Se detecta
   y se marca de forma visible en vez de mostrarse como un Título cualquiera. */
function isGeneralNode(n){
  return !!n && !n.padre_id && !n.numero && (n.nombre||'').trim().toLowerCase() === 'general';
}
function nodeDisplayName(n){
  if(n.tipo === 'libre'){
    // Sin prefijo automático: se muestra tal cual lo haya escrito el admin.
    if(n.numero && n.nombre) return n.numero + ' – ' + n.nombre;
    return n.nombre || n.numero || 'Estructura';
  }
  const parts = [];
  if(n.numero) parts.push(NODE_TYPE_LABEL[n.tipo] + ' ' + n.numero);
  if(n.nombre) parts.push(n.nombre);
  if(!parts.length) return NODE_TYPE_LABEL[n.tipo];
  return n.numero ? parts.join(' – ') : parts.join('');
}
function allowedChildTypes(parentId){
  // Tipos "de nivel fijo" (título/capítulo/sección/artículo) vs. tipos
  // "flexibles" (nivel 0: libre y estructura), que pueden colgar de
  // cualquier sitio y admiten cualquier tipo debajo.
  const leveled = Object.keys(NODE_TYPE_LEVEL).filter(t => NODE_TYPE_LEVEL[t] > 0);
  const flexible = Object.keys(NODE_TYPE_LEVEL).filter(t => NODE_TYPE_LEVEL[t] === 0);
  if(!parentId) return leveled.concat(flexible);
  const parent = adminData.nodes.find(n => n.id === parentId);
  if(!parent || NODE_TYPE_LEVEL[parent.tipo] === 0){
    return leveled.concat(flexible);
  }
  const parentLevel = NODE_TYPE_LEVEL[parent.tipo] || 0;
  return leveled.filter(t => NODE_TYPE_LEVEL[t] > parentLevel).concat(flexible);
}
/* Orden automático: se detecta a partir del "número" de cada nivel
   (soporta números, decimales tipo "34.2" y números romanos tipo "II"),
   sin que el admin tenga que rellenar un campo de orden a mano. */
function romanToInt(s){
  const map = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
  if(!/^[IVXLCDM]+$/.test(s)) return null;
  let total = 0;
  for(let i = 0; i < s.length; i++){
    const cur = map[s[i]], next = map[s[i+1]];
    if(next && cur < next){ total -= cur; } else { total += cur; }
  }
  return total;
}
function nodeSortKey(n){
  const raw = (n.numero || '').trim();
  if(!raw) return null;
  if(/^\d+(\.\d+)?$/.test(raw)) return parseFloat(raw);
  const roman = romanToInt(raw.toUpperCase());
  return roman == null ? null : roman;
}
function compareNodes(a, b){
  const ka = nodeSortKey(a), kb = nodeSortKey(b);
  if(ka != null && kb != null) return ka - kb;
  if(ka != null) return -1;
  if(kb != null) return 1;
  return (a.nombre || '').localeCompare(b.nombre || '', 'es', { numeric:true, sensitivity:'base' });
}

function topicTitle(topicId){
  const t = TOPICS.find(x => x.id === topicId);
  return t ? (t.name || t.id) : topicId;
}

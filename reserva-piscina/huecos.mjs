// Huecos de la piscina (PMD Vista Alegre) leídos de la «Consulta de espacios» pública de IMDECO,
// sin navegador ni cuenta: los mismos postbacks asíncronos de ASP.NET que hace la web.
// Es la misma lógica que supabase/functions/piscina-huecos (allí en Deno).
//
//   import { huecos } from './huecos.mjs';
//   const m = await huecos(['2026-10-20'], ['09:00', '14:00']);   // Map 'AAAA-MM-DD|HH:MM' → ['Piscina M 01', …]

const IMD = 'https://gestiones.imdcordoba.es';
const FRANJAS = [['60', 'Piscina Mañana', h => h < 12], ['71', 'Piscina Medio Día', h => h >= 12 && h < 18], ['61', 'Piscina Tarde', h => h >= 18]];

class Imdeco {
  jar = new Map(); campos = {}; url = IMD + '/CronosWeb/Login';
  guardar(res) {
    for (const c of res.headers.getSetCookie()) { const kv = c.split(';')[0], i = kv.indexOf('='); this.jar.set(kv.slice(0, i).trim(), kv.slice(i + 1)); }
  }
  cookie() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '); }
  static ocultos(html) {
    const o = {};
    for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
      const n = (m[0].match(/name="([^"]*)"/) || [])[1], v = (m[0].match(/value="([^"]*)"/) || [, ''])[1];
      if (n) o[n] = v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }
    return o;
  }
  async get(u) {
    const r = await fetch(u, { headers: { cookie: this.cookie(), 'user-agent': 'Mozilla/5.0 pj.fire' }, redirect: 'manual' });
    this.guardar(r);
    if (r.status >= 300 && r.status < 400) { await r.body?.cancel(); return this.get(new URL(r.headers.get('location'), u).href); }
    const html = await r.text(); this.url = u; this.campos = Imdeco.ocultos(html); return html;
  }
  static delta(t) {
    const out = []; let i = 0;
    while (i < t.length) {
      const a = t.indexOf('|', i); if (a < 0) break;
      const len = Number(t.slice(i, a)), b = t.indexOf('|', a + 1), c = t.indexOf('|', b + 1);
      out.push({ tipo: t.slice(a + 1, b), id: t.slice(b + 1, c), contenido: t.substr(c + 1, len) });
      i = c + 1 + len + 1;
    }
    return out;
  }
  async postback(panel, arg) {
    const body = new URLSearchParams({ ...this.campos, 'ctl00$ScriptManager1': 'ctl00$' + panel.split('_').join('$') + '|' + panel, __EVENTTARGET: panel, __EVENTARGUMENT: JSON.stringify(arg), __ASYNCPOST: 'true' });
    const r = await fetch(this.url, { method: 'POST', body, headers: { cookie: this.cookie(), 'user-agent': 'Mozilla/5.0 pj.fire', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-microsoftajax': 'Delta=true', 'x-requested-with': 'XMLHttpRequest' } });
    this.guardar(r);
    const d = Imdeco.delta(await r.text());
    for (const x of d) if (x.tipo === 'hiddenField') this.campos[x.id] = x.contenido;
    const err = d.find(x => x.tipo === 'error'); if (err) throw new Error('IMDECO: ' + err.contenido.slice(0, 200));
    const red = d.find(x => x.tipo === 'pageRedirect'); if (red) return this.get(new URL(decodeURIComponent(red.contenido), this.url).href);
    return d.map(x => x.contenido).join('\n');
  }
}

function libresDe(html) {
  const calles = [...html.matchAll(/DecCodRecinto="(\d+)"><span[^>]*>([^<]+)</gi)].map(m => ({ cod: m[1], nombre: m[2].trim() }));
  const libre = new Set();
  for (const m of html.matchAll(/<img[^>]*id="[^"]*_img(\d+)(\d{4})"[^>]*>/gi)) if (/Estado="Libre"/i.test(m[0])) libre.add(m[1] + '|' + m[2].slice(0, 2) + ':' + m[2].slice(2));
  const horas = [...html.matchAll(/HoraDesde="([\d:]+)"/gi)].map(m => m[1]);
  return new Map(horas.map(h => [h, calles.filter(c => libre.has(c.cod + '|' + h)).map(c => c.nombre)]));
}

export async function huecos(fechas, horas) {
  const s = new Imdeco();
  await s.get(s.url);
  await s.postback('ContentFixedSection_uSecciones_uAlert_uplAlert', { action: 'SelectMenu', args: { menu_code: '23', menu_title: 'Acceso no identificado', menu_type: 30, submenu_code: null } });
  await s.postback('ContentFixedSection_uSecciones_uAlert_uplAlert', { action: 'SelectMenu', args: { menu_code: '15', menu_title: 'Consulta de espacios', menu_type: 16, submenu_code: null } });
  await s.postback('ContentFixedSection_uReservaEspacios_uCentrosSeleccionar_uAlert_uplAlert', { action: 'SelectFacility', args: { menu_code: '15', facility_code: '1', date: null } });
  const out = new Map();
  const franjas = FRANJAS.filter(([, , es]) => horas.some(h => es(parseInt(h, 10))));
  for (const [code, name] of franjas) {
    await s.postback('ContentFixedSection_uReservaEspacios_uUsosSeleccionar_uAlert_uplAlert', { action: 'Seleccionar', args: { reservation_type_code: code, reservation_type_name: name, icon: '', icon_mime_type: 'image/jpeg', dates: fechas, resources: [] } });
    for (const f of fechas) {
      const m = libresDe(await s.postback('ContentFixedSection_uReservaEspacios_uFechaSeleccionar_uAlert_uplAlert', { action: 'Continuar', args: f }));
      for (const [h, libres] of m) out.set(f + '|' + h, libres);
    }
  }
  return out;
}

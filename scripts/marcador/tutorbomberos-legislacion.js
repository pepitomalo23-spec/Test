/* Marcador «Legislación» de tutorbomberos.es: en la página «Preguntas por
   tema» (tob.test › Realizar test › Preguntas por tema), deja elegir los temas
   (agrupados por bloque: General, Derecho, Andalucía…) y pide todas las
   preguntas de cada uno igual que su enlace (seleccionaTema → formulario
   «formulario», modo porTema → generarPreguntasAction.test), sin abrirlo ni
   responder. Lee cada pregunta como el marcador «Extraer todo» (del que sale
   este archivo) y lo envía a pj.fire marcado como «porTema»:
   js/importar-especifico.js lo lleva siempre a Legislación (fuente
   Tutorbombero), donde se elige la ley de cada tema.
   El marcador listo para pegar se genera con
     node scripts/marcador.mjs   →  datos/marcador-tutorbomberos-legislacion.txt */
(async () => {
  const APP = "https://test-pablo-jesus.vercel.app";
  const w = (ms) => new Promise((r) => setTimeout(r, ms)),
    norm = (s) => String(s || "").replace(/\s+/g, " ").trim(),
    mk = (t, css, p) => {
      const e = document.createElement(t);
      if (css) e.style.cssText = css;
      if (p) Object.assign(e, p);
      return e;
    },
    esc = (s) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  ["__pj_todo", "__pj_caja"].forEach((i) => {
    const o = document.getElementById(i);
    if (o) o.remove();
  });
  const P = mk(
    "div",
    "position:fixed;top:10px;right:10px;z-index:2147483647;background:rgba(20,20,20,.96);color:white;padding:14px 16px;border-radius:12px;font:15px/1.45 -apple-system,system-ui,sans-serif;width:330px;max-width:calc(100vw - 20px);max-height:calc(100vh - 20px);overflow:auto;box-sizing:border-box;text-align:left",
  );
  P.id = "__pj_todo";
  const box = mk("div", "position:absolute;left:-100000px;top:0;width:900px");
  box.id = "__pj_caja";
  try {
    const form = document.forms.formulario;
    if (!form) {
      alert("Abre la página con la lista de temas y tests (tob.test) y vuelve a pulsar el marcador.");
      return;
    }
    const accion = new URL(form.getAttribute("action") || "", location.href).href;

    // ---------- los temas de la página (enlaces seleccionaTema) ----------
    const args = (s) => [...String(s).matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
    const temas = {};
    const tests = [];
    const vistos = new Set();
    document.querySelectorAll('[onclick*="seleccionaTema"]').forEach((a) => {
      const g = args(a.getAttribute("onclick"));
      const id = g[1] || g[0];
      const titulo = norm(a.textContent);
      if (!id || !titulo || vistos.has(id)) return;
      vistos.add(id);
      const panel = a.closest(".panel");
      const h = panel && panel.querySelector(".panel-heading,.panel-title");
      const bloque = h ? norm(h.textContent) : "Temas";
      temas[id] = titulo;
      tests.push({ temaId: id, titulo, bloque, preguntas: "", esperadas: 0, porTema: true });
    });
    if (!tests.length) {
      alert("No encuentro temas en esta página. Abre «Realizar test › Preguntas por tema» (donde salen General, Derecho, Andalucía…) y vuelve a pulsar el marcador.");
      return;
    }
    // ---------- elegir los temas ----------
    const bloques = [];
    tests.forEach((t) => {
      let b = bloques.find((x) => x.nombre === t.bloque);
      if (!b) bloques.push((b = { nombre: t.bloque, tests: [] }));
      b.tests.push(t);
    });
    const KEY = "__pj_legis_seleccion";
    let antes = null;
    try {
      antes = new Set(JSON.parse(localStorage.getItem(KEY) || "null"));
    } catch (e) {}
    document.body.append(P);
    const elegidos = await new Promise((fin) => {
      const btn = "font-size:15px;padding:8px 12px;border:0;border-radius:8px;color:white;cursor:pointer;margin:4px 6px 0 0;background:";
      const cab = mk("div", "font-weight:600;margin-bottom:4px", { textContent: "Legislación para pj.fire: elige los temas" }),
        sub = mk("div", "font-size:13px;opacity:.75;margin-bottom:6px", { textContent: "Se sacan todas las preguntas de cada tema." }),
        lst = mk("div", "margin:6px 0 8px"),
        bS = mk("button", btn + "#f07611", { type: "button" }),
        bC = mk("button", btn + "dimgray", { type: "button", textContent: "Cancelar" }),
        cajas = [];
      const upd = () => {
        bloques.forEach((b) => {
          const n = b.cs.filter((c) => c.checked).length;
          b.cb.checked = n === b.cs.length;
          b.cb.indeterminate = n > 0 && n < b.cs.length;
        });
        const n = cajas.filter((c) => c.checked).length;
        bS.textContent = "Sacar " + n + (n === 1 ? " tema" : " temas");
        bS.disabled = !n;
        bS.style.opacity = n ? "1" : ".5";
      };
      bloques.forEach((b) => {
        const fila = mk("div", "margin:6px 0;border-bottom:1px solid #333;padding-bottom:6px"),
          lab = mk("label", "display:flex;gap:8px;align-items:center;cursor:pointer;font-weight:600");
        b.cb = mk("input", "accent-color:#f07611", { type: "checkbox" });
        lab.append(b.cb, mk("span", "", { textContent: b.nombre + " (" + b.tests.length + ")" }));
        fila.append(lab);
        b.cs = b.tests.map((t) => {
          const l = mk("label", "display:flex;gap:6px;align-items:flex-start;cursor:pointer;margin:4px 0 0 22px;font-size:13.5px"),
            c = mk("input", "margin-top:3px;accent-color:#f07611;flex:none", { type: "checkbox", checked: !!antes && antes.has(t.temaId) });
          c.t = t;
          c.onchange = upd;
          l.append(c, mk("span", "", { textContent: t.titulo }));
          fila.append(l);
          cajas.push(c);
          return c;
        });
        b.cb.onchange = () => {
          b.cs.forEach((c) => (c.checked = b.cb.checked));
          upd();
        };
        lst.append(fila);
      });
      bC.onclick = () => fin(null);
      bS.onclick = () => {
        const s = cajas.filter((c) => c.checked).map((c) => c.t);
        try {
          localStorage.setItem(KEY, JSON.stringify(s.map((t) => t.temaId)));
        } catch (e) {}
        fin(s);
      };
      P.append(cab, sub, lst, bS, bC);
      upd();
    });
    if (!elegidos || !elegidos.length) {
      P.remove();
      return;
    }
    tests.splice(0, tests.length, ...elegidos);
    P.replaceChildren();
    let stop = false;
    const msg = mk("div", "white-space:pre-line;margin-bottom:10px"),
      sb = mk("button", "font-size:15px;padding:8px 14px;border:0;border-radius:8px;background:crimson;color:white", {
        textContent: "Parar (y enviar lo hecho)",
        type: "button",
      });
    sb.onclick = () => {
      stop = true;
    };
    P.append(msg, sb);
    document.body.append(P, box);
    const say = (t) => {
      msg.textContent = t;
    };

    // ---------- imágenes incrustadas ----------
    // Siempre como data:image/png|jpeg|gif|webp (lo único que pj.fire muestra).
    const cache = new Map();
    let nImg = 0,
      nImgMal = 0;
    const imgSrc = (i) => {
      const d = i.getAttribute("data-src") || i.getAttribute("data-original") || i.getAttribute("data-lazy-src");
      return d ? new URL(d, location.href).href : i.currentSrc || i.src || "";
    };
    const okImg = (i) => !(i.naturalWidth && i.naturalWidth <= 24 && i.naturalHeight <= 24);
    const leer = (b) =>
      new Promise((ok, ko) => {
        const f = new FileReader();
        f.onload = () => ok(f.result);
        f.onerror = ko;
        f.readAsDataURL(b);
      });
    const tipoBytes = (u) =>
      u[0] === 0x89 && u[1] === 0x50 ? "image/png"
      : u[0] === 0xff && u[1] === 0xd8 ? "image/jpeg"
      : u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46 ? "image/gif"
      : u[0] === 0x52 && u[1] === 0x49 && u[8] === 0x57 && u[9] === 0x45 ? "image/webp"
      : "";
    // Formatos raros (bmp, svg…): se pasan a PNG dibujándolos en un canvas.
    const aPng = (b) =>
      new Promise((ok) => {
        const u = URL.createObjectURL(b),
          im = new Image();
        im.onload = () => {
          try {
            const c = document.createElement("canvas");
            c.width = im.naturalWidth || 300;
            c.height = im.naturalHeight || 150;
            c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
            ok(c.toDataURL("image/png"));
          } catch (e) {
            ok("");
          }
          URL.revokeObjectURL(u);
        };
        im.onerror = () => {
          URL.revokeObjectURL(u);
          ok("");
        };
        im.src = u;
      });
    const toData = async (s) => {
      if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(s)) return s;
      if (cache.has(s)) return cache.get(s);
      let r = "";
      for (let k = 0; k < 3 && !r; k++) {
        try {
          if (k) await w(600 * k);
          const res = await fetch(s, { credentials: "include" });
          if (!res.ok) continue;
          const b = await res.blob(),
            t = tipoBytes(new Uint8Array(await b.slice(0, 12).arrayBuffer()));
          r = t ? await leer(new Blob([b], { type: t })) : /svg|bmp|tiff|icon/i.test(b.type) ? await aPng(b) : "";
          if (!t && !r) break;
        } catch (e) {
          break; // otra web sin permiso (CORS): no se arregla reintentando
        }
      }
      // Si no se pudo, se deja la dirección: pj.fire la descarga desde su servidor al importar.
      if (!r) nImgMal++;
      r = r || s;
      cache.set(s, r);
      return r;
    };
    const imgH = async (i) => {
      const s = imgSrc(i);
      if (!s || !okImg(i)) return "";
      nImg++;
      return '<br><img src="' + esc(await toData(s)) + '"><br>';
    };
    // <svg> dentro del texto (no los iconos): a PNG.
    const svgH = async (sv) => {
      const r = sv.getBoundingClientRect();
      if (r.width <= 24 && r.height <= 24) return "";
      try {
        const c = sv.cloneNode(true);
        c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        if (!c.getAttribute("width")) c.setAttribute("width", Math.round(r.width));
        if (!c.getAttribute("height")) c.setAttribute("height", Math.round(r.height));
        const d = await aPng(new Blob([new XMLSerializer().serializeToString(c)], { type: "image/svg+xml" }));
        nImg++;
        if (!d) {
          nImgMal++;
          return "";
        }
        return '<br><img src="' + d + '"><br>';
      } catch (e) {
        return "";
      }
    };
    const rich = async (e) => {
      if (!e) return "";
      let h = "";
      const nl = () => {
        if (h && !/<br>$/.test(h)) h += "<br>";
      };
      const walk = async (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) h += esc(c.textContent.replace(/\s+/g, " "));
          else if (c.nodeType === 1) {
            const t = c.tagName.toUpperCase();
            if (t === "BR") h += "<br>";
            else if (t === "IMG") {
              nl();
              h += (await imgH(c)).replace(/^<br>/, "");
            } else if (t === "SVG") {
              nl();
              h += (await svgH(c)).replace(/^<br>/, "");
            } else if (t === "SCRIPT" || t === "STYLE" || t === "NOSCRIPT" || (t === "I" && /\bfa/.test(c.className))) {
            } else {
              const b = /^(DIV|P|LI|TR|UL|OL|TABLE|H[1-6]|BLOCKQUOTE|DL|DT|DD)$/.test(t),
                tg = /^(STRONG|B)$/.test(t) ? "b" : /^(EM|I)$/.test(t) ? "i" : t === "U" ? "u" : t === "SUB" ? "sub" : t === "SUP" ? "sup" : "";
              if (b) nl();
              if (t === "LI") h += "• ";
              if ((t === "TD" || t === "TH") && h && !/(<br>|\s)$/.test(h)) h += " · ";
              if (tg) h += "<" + tg + ">";
              await walk(c);
              if (tg) h += "</" + tg + ">";
              if (b) nl();
            }
          }
        }
      };
      await walk(e);
      return h.replace(/(<br>\s*){3,}/g, "<br><br>").replace(/^(\s*<br>)+/, "").replace(/(<br>\s*)+$/, "").trim();
    };
    // Dificultad: color de la franja izquierda (verde, amarilla, roja).
    const dif = (q) => {
      for (const e of [q, ...q.querySelectorAll("div")].slice(0, 8)) {
        const cs = getComputedStyle(e);
        if (parseFloat(cs.borderLeftWidth) < 3 || cs.borderLeftStyle === "none") continue;
        const m = (cs.borderLeftColor.match(/[\d.]+/g) || []).map(Number);
        if (m.length < 3 || (m.length > 3 && m[3] === 0)) continue;
        const [r, g, b] = m.map((v) => v / 255),
          mx = Math.max(r, g, b),
          mn = Math.min(r, g, b),
          d = mx - mn;
        if (d < 0.15) continue;
        let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        hh = (hh * 60 + 360) % 360;
        if (hh >= 75 && hh < 170) return "facil";
        if (hh >= 28 && hh < 75) return "media";
        if (hh < 28 || hh >= 330) return "dificil";
      }
      // Por si el color no llega a aplicarse: el nombre de la clase de la pregunta.
      const cl = [q, ...q.children].map((e) => String(e.className)).join(" ").toLowerCase();
      if (/f[aá]cil|verde/.test(cl)) return "facil";
      if (/dif[ií]cil|rojo/.test(cl)) return "dificil";
      if (/\bmedia\b|amarill/.test(cl)) return "media";
      return "";
    };

    // ---------- pedir un test (como su botón, sin mostrarlo) ----------
    const pedir = async (t) => {
      const fd = new URLSearchParams();
      for (const el of form.elements) if (el.name && !(/^(checkbox|radio)$/.test(el.type) && !el.checked)) fd.set(el.name, el.value);
      fd.set("modo", "porTema");
      fd.set("idTema", t.temaId);
      let err = null;
      for (let k = 0; k < 3; k++) {
        try {
          if (k) await w(1500 * k);
          const r = await fetch(accion, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: fd.toString(),
          });
          if (!r.ok) throw new Error("HTTP " + r.status);
          const cs = (/charset=([\w-]+)/i.exec(r.headers.get("content-type") || "") || [])[1] || document.characterSet || "utf-8";
          const buf = await r.arrayBuffer();
          try {
            return new TextDecoder(cs).decode(buf);
          } catch (e) {
            return new TextDecoder().decode(buf);
          }
        } catch (e) {
          err = e;
        }
      }
      throw err;
    };
    const sacar = async (html) => {
      // Se analiza sin cargar nada, se quitan los scripts y se fuerza que
      // las imágenes carguen ya (las «lazy» no cargarían fuera de pantalla).
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script").forEach((s) => s.remove());
      doc.querySelectorAll("img").forEach((i) => {
        i.removeAttribute("loading");
        const d = i.getAttribute("data-src") || i.getAttribute("data-original") || i.getAttribute("data-lazy-src");
        if (d) i.setAttribute("src", d);
      });
      box.replaceChildren(...doc.head.querySelectorAll("style,link[rel=stylesheet]"), ...doc.body.childNodes);
      const imgs = [...box.querySelectorAll("img")];
      await Promise.all(
        imgs.map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); }))),
      );
      // En el orden en que salen en el test.
      const qs = [...box.querySelectorAll("div[id^=pregunta]")].filter((e) => /^pregunta\d+$/.test(e.id));
      const out = [],
        av = { sinCorrecta: 0, sinExplicacion: 0, opcionVacia: 0, sinDificultad: 0 };
      for (const q of qs) {
        const k = q.id.slice(8);
        const opts = [...q.querySelectorAll(".opcionPregunta")].map((o) => {
          const tr = o.closest("tr");
          let d = tr && tr.querySelector("div.respuesta");
          if (!d && tr) {
            // Sin div.respuesta: la fila entera menos la celda de la letra.
            d = tr.cloneNode(true);
            d.querySelectorAll(".opcionPregunta").forEach((x) => (x.closest("td") || x).remove());
            box.appendChild(d);
          }
          return {
            L: norm(o.getAttribute("value") || o.textContent).toLowerCase(),
            d,
            oc: o.getAttribute("onclick") || "",
          };
        });
        if (!opts.length) continue;
        const mt = opts.map((x) => x.oc.match(/chequeaRespuestaTest\(\s*'[^']*'\s*,\s*'([a-zA-Z])'/)).find(Boolean);
        let cor = mt ? mt[1].toLowerCase() : "";
        if (cor && !opts.some((x) => x.L === cor)) cor = "";
        const tt = q.querySelector(".pregunta"),
          ex = box.querySelector("#explicacion" + k),
          enOtra = (n) => n.closest(".cabeceraPregunta,.pregunta,div.respuesta,[id^=explicacion]");
        let ex2 = "";
        for (const im of q.querySelectorAll("img")) if (!enOtra(im)) ex2 += await imgH(im);
        const ops = [];
        for (const x of opts) {
          const hh = await rich(x.d);
          if (!norm(hh.replace(/<(?!img)[^>]*>/g, ""))) av.opcionVacia++;
          ops.push({ l: x.L, html: hh });
        }
        const eh = ex ? await rich(ex) : "";
        const df = dif(q);
        if (!cor) av.sinCorrecta++;
        if (!eh) av.sinExplicacion++;
        if (!df) av.sinDificultad++;
        out.push({
          n: k,
          enunciado: ((await rich(tt)) || esc("Pregunta " + k)) + ex2,
          opciones: ops,
          correcta: cor,
          confirmada: !!cor,
          explicacion: eh,
          dificultad: df,
        });
      }
      box.replaceChildren();
      return { out, av };
    };

    // ---------- pj.fire ----------
    // Cada pulsación del marcador anula los oyentes de la anterior.
    const yo = {};
    window.__pjfireMarcador = yo;
    const deApp = (fn) =>
      addEventListener("message", (e) => {
        if (window.__pjfireMarcador === yo && e.origin === APP && e.data) fn(e);
      });
    const lista = (tit, xs, color) => {
      if (!xs.length) return;
      const d = mk("div", "margin:8px 0;font-size:13px;color:" + color);
      d.append(mk("b", "", { textContent: tit }));
      const ul = mk("ul", "margin:4px 0;padding-left:18px");
      xs.forEach((x) => ul.append(mk("li", "", { textContent: x })));
      d.append(ul);
      P.append(d);
    };
    const boton = (txt, color) =>
      mk("button", "font-size:17px;padding:12px 16px;border:0;border-radius:8px;color:white;margin:4px 8px 0 0;background:" + color, { textContent: txt, type: "button" });

    // ---------- sacar una lista de tests ----------
    const extraer = async (cuales, cab) => {
      stop = false;
      P.insertBefore(sb, msg.nextSibling);
      if (!box.isConnected) document.body.append(box);
      const lote = [],
        fallidos = [],
        avisos = [];
      let nPreg = 0;
      for (let i = 0; i < cuales.length && !stop; i++) {
        const t = cuales[i];
        say(cab + "Tema " + (i + 1) + " de " + cuales.length + "\n" + t.titulo + "\n\nPreguntas: " + nPreg + " · Imágenes: " + nImg + (nImgMal ? " (" + nImgMal + " pendientes)" : ""));
        try {
          const malAntes = nImgMal;
          const { out, av } = await sacar(await pedir(t));
          if (!out.length) throw new Error("no salió ninguna pregunta (¿sesión caducada?)");
          nPreg += out.length;
          const a = [];
          if (t.esperadas && out.length !== t.esperadas) a.push(out.length + " de " + t.esperadas + " preguntas");
          if (av.sinCorrecta) a.push(av.sinCorrecta + " sin correcta");
          if (av.opcionVacia) a.push(av.opcionVacia + " opciones vacías");
          if (av.sinExplicacion) a.push(av.sinExplicacion + " sin explicación");
          if (av.sinDificultad) a.push(av.sinDificultad + " sin dificultad");
          if (nImgMal > malAntes) a.push(nImgMal - malAntes + " imágenes las descargará pj.fire");
          if (a.length) avisos.push("«" + t.titulo + "»: " + a.join(", "));
          lote.push({ temaId: t.temaId, tema: t.titulo, titulo: t.titulo, esperadas: 0, avisos: a, preguntas: out });
        } catch (e) {
          fallidos.push("«" + t.titulo + "»: " + e.message);
        }
        await w(250);
      }
      box.remove();
      sb.remove();
      msg.textContent = (stop ? "Parado. " : "¡Hecho! ") + lote.length + " de " + cuales.length + " temas · " + nPreg + " preguntas · " + nImg + " imágenes";
      lista("No se pudieron sacar (vuelve a pasar el marcador):", fallidos, "#ff8a80");
      lista("Revisa:", avisos, "#ffd180");
      if (!fallidos.length && !avisos.length && !stop && lote.length)
        P.append(mk("div", "margin:8px 0;color:#b9f6ca", { textContent: "Todo completo: todas las preguntas, correctas, explicaciones e imágenes." }));
      return lote;
    };
    const est = mk("div", "margin:10px 0;font-weight:600");
    const cerrarP = boton("Cerrar", "dimgray");
    cerrarP.onclick = () => P.remove();

    {
      // ---------- «Extraer todo»: todos los tests, y se envían al final ----------
      const lote = await extraer(tests, "");
      const paquete = { tipo: "pjfire-lote", v: 3, modo: "todo", porTema: true, origen: location.href, total: tests.length, tests: lote };
      const b0 = boton("Enviar a pj.fire", "#f07611");
      P.append(est, b0, cerrarP);
      let enviado = false;
      deApp((e) => {
        if (e.data.tipo === "pjfire-listo" && !enviado) {
          enviado = true;
          e.source.postMessage(paquete, APP);
          est.textContent = "Enviado: confirma en pj.fire.";
        } else if (e.data.tipo === "pjfire-recibido") est.textContent = "¡pj.fire lo ha recibido!";
      });
      const enviar = () => {
        enviado = false;
        const v = window.open(APP + "/#importar-especifico", "_blank");
        est.textContent = v ? "Abriendo pj.fire…" : "Pulsa «Enviar a pj.fire».";
        return !!v;
      };
      b0.onclick = () => {
        if (!enviar()) est.textContent = "El navegador no deja abrir pj.fire: permite las ventanas emergentes.";
      };
      if (lote.length) enviar();
      return;
    }

  } catch (e) {
    box.remove();
    P.remove();
    alert("Error: " + e.message);
  }
})();
void 0;

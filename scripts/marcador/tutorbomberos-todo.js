/* Marcador «Extraer todo» de tutorbomberos.es: en la página con la lista de
   temas y tests (tob.test), pide cada test igual que su botón
   (seleccionaClase → formulario «formulario» → generarPreguntasAction.test),
   sin abrirlo ni pulsar respuestas (así no cuenta como aciertos o fallos en
   tutorbomberos). De cada pregunta saca enunciado, opciones, la correcta (va
   en chequeaRespuestaTest(idPregunta, CORRECTA, …)), explicación, imágenes
   incrustadas y dificultad (color de la franja izquierda), y lo envía todo
   junto a pj.fire (js/importar-especifico.js lo reparte en sus temas).
   Comprueba cada test: que salgan tantas preguntas como ids trae su botón,
   que todas tengan correcta, opciones con texto y explicación, y que cada
   imagen quede incrustada; lo que no cuadre sale en el informe final.
   El marcador listo para pegar se genera con
     node scripts/marcador.mjs   →  datos/marcador-tutorbomberos-todo.txt
   y, con MODO = "revisar", datos/marcador-tutorbomberos-revisar.txt. */
(async () => {
  const APP = "https://test-pablo-jesus.vercel.app";
  // «todo» saca todos los tests y los importa. «revisar» (el marcador «Revisar
  // cambios», generado de este mismo archivo) pregunta antes a pj.fire qué tests
  // tienes, saca solo esos para ver qué ha cambiado y de los demás solo avisa
  // de que son nuevos (pj.fire puede pedirlos después con «pjfire-traer»).
  const MODO = "todo";
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

    // ---------- los tests de la página ----------
    const args = (s) => [...String(s).matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\(.)/g, "$1"));
    const temas = {};
    const tests = [];
    const vistos = new Set();
    document.querySelectorAll('[onclick*="seleccionaClase"]').forEach((a) => {
      const g = args(a.getAttribute("onclick"));
      if (g.length < 2) return;
      const clave = g[0] + "|" + g[1],
        titulo = norm(a.textContent).replace(/^Test\s*-\s*/i, "");
      // El mismo test puede tener dos enlaces (el tick y el texto): vale el que tiene texto.
      if (vistos.has(clave)) {
        const ya = tests.find((t) => t.temaId + "|" + t.preguntas === clave);
        if (ya && !ya.conTexto && titulo) Object.assign(ya, { titulo, conTexto: true });
        return;
      }
      vistos.add(clave);
      let tema = "";
      for (let p = a, i = 0; i < 10 && p && !tema; i++) {
        p = p.parentElement;
        if (!p) break;
        const h = p.querySelector("h1,h2,h3,h4,h5,.panel-title,.card-header,.panel-heading,button[data-toggle],a[data-toggle]");
        if (h && !h.contains(a)) tema = norm(h.textContent);
      }
      if (!temas[g[0]]) temas[g[0]] = tema;
      tests.push({
        temaId: g[0],
        preguntas: g[1],
        // Cuántas preguntas trae el botón («,3-307,3-318,…»), para comprobar que salen todas.
        esperadas: g[1].split(",").filter((x) => x.trim()).length,
        tituloForm: g[2] || "",
        fecha: g[3] || "",
        titulo: titulo || norm(g[2]),
        conTexto: !!titulo,
      });
    });
    if (!tests.length) {
      alert("No encuentro tests en esta página. Abre la lista de temas (tob.test).");
      return;
    }
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
      fd.set("idTema", t.temaId);
      fd.set("preguntas", t.preguntas);
      fd.set("titulo", t.tituloForm);
      fd.set("fecha", t.fecha);
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
        say(cab + "Test " + (i + 1) + " de " + cuales.length + "\n" + t.titulo + "\n\nPreguntas: " + nPreg + " · Imágenes: " + nImg + (nImgMal ? " (" + nImgMal + " pendientes)" : ""));
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
          lote.push({ temaId: t.temaId, tema: temas[t.temaId] || "", titulo: t.titulo, esperadas: t.esperadas, avisos: a, preguntas: out });
        } catch (e) {
          fallidos.push("«" + t.titulo + "»: " + e.message);
        }
        await w(250);
      }
      box.remove();
      sb.remove();
      msg.textContent = (stop ? "Parado. " : "¡Hecho! ") + lote.length + " de " + cuales.length + " tests · " + nPreg + " preguntas · " + nImg + " imágenes";
      lista("No se pudieron sacar (vuelve a pasar el marcador):", fallidos, "#ff8a80");
      lista("Revisa:", avisos, "#ffd180");
      if (!fallidos.length && !avisos.length && !stop && lote.length)
        P.append(mk("div", "margin:8px 0;color:#b9f6ca", { textContent: "Todo completo: todas las preguntas, correctas, explicaciones e imágenes." }));
      return lote;
    };
    const est = mk("div", "margin:10px 0;font-weight:600");
    const cerrarP = boton("Cerrar", "dimgray");
    cerrarP.onclick = () => P.remove();

    if (MODO !== "revisar") {
      // ---------- «Extraer todo»: todos los tests, y se envían al final ----------
      const lote = await extraer(tests, "");
      const paquete = { tipo: "pjfire-lote", v: 3, modo: "todo", origen: location.href, total: tests.length, tests: lote };
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

    // ---------- «Revisar cambios»: solo los tests que ya tienes en pj.fire ----------
    // Primero se abre pj.fire (aún dentro de la pulsación, para que el
    // navegador lo deje) y se le pide la lista de tus tests.
    const TEMAS_TB = { 3: "fuego", 4: "extintores", 5: "sistemas", 6: "utiles", 7: "epi", 8: "vehiculos", 9: "fisica",
      10: "hidraulica", 11: "gases", 12: "electricidad", 13: "mercancias", 14: "radio", 15: "socorrismo", 16: "forestales",
      17: "intervenciones", 18: "construccion", 19: "cte", 800: "rseiei", 20: "prl", 21: "ascensores", 419: "himenopteros" };
    const ct = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^\s*test\s*-\s*/i, "").replace(/\s+/g, " ").trim().toLowerCase();
    sb.remove();
    say("Revisar cambios\n\nPreguntando a pj.fire qué tests tienes…\n(si te pide entrar, entra con tu cuenta de administrador)");
    let app = null,
      pidiendo = true;
    const misTests = await new Promise((ok) => {
      deApp((e) => {
        if (!pidiendo) return;
        if (e.data.tipo === "pjfire-listo" && !app) {
          app = e.source;
          app.postMessage({ tipo: "pjfire-revisar" }, APP);
        } else if (e.data.tipo === "pjfire-mis-tests" && Array.isArray(e.data.tests) && e.source === app) ok(e.data.tests);
      });
      if (!window.open(APP + "/#importar-especifico", "_blank")) {
        const b = boton("Abrir pj.fire", "#f07611");
        b.onclick = () => {
          if (window.open(APP + "/#importar-especifico", "_blank")) b.remove();
        };
        P.append(b);
      }
    });
    // Se emparejan como en pj.fire: mismo tema y título (sin tildes ni mayúsculas); cada uno una vez.
    const usados = new Set(),
      revisar = [],
      nuevos = [];
    tests.forEach((t) => {
      const k = TEMAS_TB[t.temaId];
      if (!k) return; // tema que no está en pj.fire
      const j = misTests.findIndex((m, n) => !usados.has(n) && m.tema === k && ct(m.titulo) === ct(t.titulo));
      if (j >= 0) {
        usados.add(j);
        revisar.push(t);
      } else nuevos.push(t);
    });
    pidiendo = false;
    const noEstan = misTests.filter((m, n) => !usados.has(n));
    const lote = await extraer(revisar, "Revisando tus tests\n");
    const paquete = {
      tipo: "pjfire-lote", v: 3, modo: "revisar", origen: location.href, total: revisar.length, tests: lote,
      nuevos: nuevos.map((t) => ({ temaId: t.temaId, tema: temas[t.temaId] || "", titulo: t.titulo, esperadas: t.esperadas })),
      noEstan: noEstan.map((m) => ({ tema: String(m.tema || ""), titulo: String(m.titulo || "") })),
    };
    if (nuevos.length) P.append(mk("div", "margin:8px 0;font-size:13px;color:#ffd180", { textContent: nuevos.length + (nuevos.length === 1 ? " test nuevo" : " tests nuevos") + " en tutorbomberos que aún no tienes: los verás en pj.fire." }));
    const b0 = boton("Enviar a pj.fire", "#f07611");
    P.append(est, b0, cerrarP);
    // Desde pj.fire se pueden pedir los tests nuevos: se sacan y se mandan.
    deApp(async (e) => {
      if (e.data.tipo === "pjfire-recibido") est.textContent = "¡pj.fire lo ha recibido!";
      else if (e.data.tipo === "pjfire-listo" && !app) {
        app = e.source;
        app.postMessage(paquete, APP);
        est.textContent = "Enviado: mira pj.fire.";
      } else if (e.data.tipo === "pjfire-traer" && Array.isArray(e.data.indices)) {
        const quiero = e.data.indices.map((n) => nuevos[n]).filter(Boolean);
        if (!quiero.length) return;
        [...P.children].forEach((c) => c !== msg && c.remove());
        const l2 = await extraer(quiero, "Trayendo los tests nuevos\n");
        e.source.postMessage({ tipo: "pjfire-lote", v: 3, modo: "todo", origen: location.href, total: quiero.length, tests: l2 }, APP);
        P.append(est, cerrarP);
        est.textContent = "Enviados a pj.fire: confirma allí.";
      }
    });
    const enviar = () => {
      if (app && !app.closed) {
        app.postMessage(paquete, APP);
        est.textContent = "Enviado: mira pj.fire.";
        return true;
      }
      app = null;
      const v = window.open(APP + "/#importar-especifico", "_blank");
      est.textContent = v ? "Abriendo pj.fire…" : "Pulsa «Enviar a pj.fire».";
      return !!v;
    };
    b0.onclick = () => {
      if (!enviar()) est.textContent = "El navegador no deja abrir pj.fire: permite las ventanas emergentes.";
    };
    enviar();
  } catch (e) {
    box.remove();
    P.remove();
    alert("Error: " + e.message);
  }
})();
void 0;

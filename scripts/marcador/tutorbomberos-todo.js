/* Marcador «Extraer todo» de tutorbomberos.es: en la página con la lista de
   temas y tests (tob.test), pide cada test igual que su botón
   (seleccionaClase → formulario «formulario» → generarPreguntasAction.test),
   sin abrirlo ni pulsar respuestas (así no cuenta como aciertos o fallos en
   tutorbomberos). De cada pregunta saca enunciado, opciones, la correcta (va
   en chequeaRespuestaTest(idPregunta, CORRECTA, …)), explicación, imágenes
   incrustadas y dificultad (color de la franja izquierda), y lo envía todo
   junto a pj.fire (js/importar-especifico.js lo reparte en sus temas).
   El marcador listo para pegar se genera con
     node scripts/marcador.mjs   →  datos/marcador-tutorbomberos-todo.txt */
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
  const P = mk(
    "div",
    "position:fixed;top:10px;right:10px;z-index:2147483647;background:rgba(20,20,20,.95);color:white;padding:14px 16px;border-radius:12px;font:15px/1.45 -apple-system,system-ui,sans-serif;width:300px;box-sizing:border-box",
  );
  const box = mk("div", "position:absolute;left:-100000px;top:0;width:900px");
  try {
    const form = document.forms.formulario;
    if (!form) {
      alert("Abre la página con la lista de temas y tests (tob.test) y vuelve a pulsar el marcador.");
      return;
    }
    // ---------- los tests de la página ----------
    const args = (s) => [...String(s).matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
    const temas = {};
    const tests = [];
    document.querySelectorAll('a[onclick*="seleccionaClase"]').forEach((a) => {
      const g = args(a.getAttribute("onclick"));
      if (g.length < 2) return;
      let tema = "";
      for (let p = a, i = 0; i < 8 && p && !tema; i++) {
        p = p.parentElement;
        if (!p) break;
        const h = p.querySelector("h1,h2,h3,h4,h5,.panel-title,.card-header,.panel-heading,button[data-toggle],a[data-toggle]");
        if (h && !h.contains(a)) tema = norm(h.textContent);
      }
      if (!temas[g[0]]) temas[g[0]] = tema;
      tests.push({
        temaId: g[0],
        preguntas: g[1],
        tituloForm: g[2] || "",
        fecha: g[3] || "",
        titulo: norm(a.textContent).replace(/^Test\s*-\s*/i, ""),
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
    const cache = new Map();
    let nImg = 0;
    const imgSrc = (i) => i.currentSrc || i.src || i.getAttribute("data-src") || "";
    const okImg = (i) => !(i.naturalWidth && i.naturalWidth <= 24);
    const toData = async (s) => {
      if (cache.has(s)) return cache.get(s);
      let r = s;
      try {
        const b = await (await fetch(s, { credentials: "include" })).blob();
        r = await new Promise((ok, ko) => {
          const f = new FileReader();
          f.onload = () => ok(f.result);
          f.onerror = ko;
          f.readAsDataURL(b);
        });
      } catch (e) {}
      cache.set(s, r);
      return r;
    };
    const imgH = async (i) => {
      const s = imgSrc(i);
      if (!s || !okImg(i)) return "";
      nImg++;
      return '<br><img src="' + esc(await toData(s)) + '"><br>';
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
            } else if (t === "SCRIPT" || t === "STYLE" || t === "SVG" || (t === "I" && /fa/.test(c.className))) {
            } else {
              const b = /^(DIV|P|LI|TR|UL|OL|TABLE|H[1-6])$/.test(t),
                tg = /^(STRONG|B)$/.test(t) ? "b" : t === "EM" ? "i" : "";
              if (b) nl();
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
      return "";
    };

    // ---------- pedir un test (como su botón, sin mostrarlo) ----------
    const pedir = async (t) => {
      const fd = new URLSearchParams();
      for (const el of form.elements) if (el.name) fd.set(el.name, el.value);
      fd.set("idTema", t.temaId);
      fd.set("preguntas", t.preguntas);
      fd.set("titulo", t.tituloForm);
      fd.set("fecha", t.fecha);
      const r = await fetch(form.action, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: fd.toString(),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const cs = (/charset=([\w-]+)/i.exec(r.headers.get("content-type") || "") || [])[1] || document.characterSet || "utf-8";
      let html;
      try {
        html = new TextDecoder(cs).decode(await r.arrayBuffer());
      } catch (e) {
        html = await r.text();
      }
      return html;
    };
    const sacar = async (html) => {
      box.innerHTML = html;
      const imgs = [...box.querySelectorAll("img")];
      await Promise.all(
        imgs.map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); }))),
      );
      const qs = [...box.querySelectorAll("div[id^=pregunta]")]
        .filter((e) => /^pregunta\d+$/.test(e.id))
        .sort((a, b) => a.id.slice(8) - b.id.slice(8));
      const out = [];
      for (const q of qs) {
        const k = q.id.slice(8);
        const opts = [...q.querySelectorAll(".opcionPregunta")].map((o) => {
          const tr = o.closest("tr");
          return {
            L: norm(o.getAttribute("value") || o.textContent).toLowerCase(),
            d: tr && tr.querySelector("div.respuesta"),
            oc: o.getAttribute("onclick") || "",
          };
        });
        if (!opts.length) continue;
        const mt = opts.map((x) => x.oc.match(/chequeaRespuestaTest\(\s*'[^']*'\s*,\s*'([a-zA-Z])'/)).find(Boolean);
        const cor = mt ? mt[1].toLowerCase() : "";
        const tt = q.querySelector(".pregunta"),
          ex = box.querySelector("#explicacion" + k),
          extra = [...q.querySelectorAll("img")].filter(
            (im) => !im.closest(".cabeceraPregunta,.pregunta,div.respuesta,[id^=explicacion]"),
          );
        let ex2 = "";
        for (const im of extra) ex2 += await imgH(im);
        const ops = [];
        for (const x of opts) ops.push({ l: x.L, html: await rich(x.d) });
        out.push({
          n: k,
          enunciado: ((await rich(tt)) || esc("Pregunta " + k)) + ex2,
          opciones: ops,
          correcta: cor,
          confirmada: !!cor,
          explicacion: ex ? await rich(ex) : "",
          dificultad: dif(q),
        });
      }
      box.innerHTML = "";
      return out;
    };

    // ---------- recorrer todos ----------
    const lote = [];
    const fallidos = [];
    let nPreg = 0;
    for (let i = 0; i < tests.length && !stop; i++) {
      const t = tests[i];
      say("Test " + (i + 1) + " de " + tests.length + "\n" + t.titulo + "\n\nPreguntas: " + nPreg + " · Imágenes: " + nImg);
      try {
        const preguntas = await sacar(await pedir(t));
        nPreg += preguntas.length;
        lote.push({ temaId: t.temaId, tema: temas[t.temaId] || "", titulo: t.titulo, preguntas });
      } catch (e) {
        fallidos.push(t.titulo + " (" + e.message + ")");
      }
      await w(250);
    }
    box.remove();

    // ---------- enviar a pj.fire ----------
    const paquete = { tipo: "pjfire-lote", v: 1, origen: location.href, tests: lote };
    msg.textContent =
      (stop ? "Parado. " : "¡Hecho! ") + lote.length + " tests · " + nPreg + " preguntas · " + nImg + " imágenes" +
      (fallidos.length ? "\nNo se pudieron sacar: " + fallidos.join("; ") : "");
    sb.remove();
    const est = mk("div", "margin:10px 0;font-weight:600"),
      b0 = mk("button", "font-size:17px;padding:12px 16px;border:0;border-radius:8px;background:#f07611;color:white;margin-right:8px", {
        textContent: "Enviar a pj.fire",
        type: "button",
      }),
      b4 = mk("button", "font-size:17px;padding:12px 16px;border:0;border-radius:8px;background:dimgray;color:white", {
        textContent: "Cerrar",
        type: "button",
      });
    P.append(est, b0, b4);
    b4.onclick = () => P.remove();
    let enviado = false;
    addEventListener("message", (e) => {
      if (e.origin !== APP || !e.data) return;
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
  } catch (e) {
    box.remove();
    P.remove();
    alert("Error: " + e.message);
  }
})();
void 0;

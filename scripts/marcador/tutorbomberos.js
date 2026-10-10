/* Marcador de tutorbomberos.es: recorre el test abierto, responde cada
   pregunta para que la web muestre la correcta, saca enunciado, opciones,
   correcta y explicación (con imágenes incrustadas) y, además de copiar o
   descargar, las envía a pj.fire para guardarlas en un test del Específico
   (js/importar-especifico.js las recibe).
   El marcador listo para pegar en el navegador se genera con
     node scripts/marcador.mjs   →  datos/marcador-tutorbomberos.txt */
(async () => {
  try {
    const w = (ms) => new Promise((r) => setTimeout(r, ms)),
      norm = (s) =>
        String(s || "")
          .replace(/\s+/g, " ")
          .trim(),
      vis = (e) => !!e && getComputedStyle(e).display !== "none",
      mk = (t, css, p) => {
        const e = document.createElement(t);
        if (css) e.style.cssText = css;
        if (p) Object.assign(e, p);
        return e;
      },
      esc = (s) =>
        String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;"),
      getQ = () =>
        [...document.querySelectorAll("div[id^=pregunta]")].filter((e) =>
          /^pregunta\d+$/.test(e.id),
        ),
      imgSrc = (i) => i.currentSrc || i.src || i.getAttribute("data-src") || "",
      okImg = (i) => !(i.naturalWidth && i.naturalWidth <= 24),
      cache = new Map();
    let nImg = 0,
      nFail = 0;
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
      const d = await toData(s);
      if (d.slice(0, 5) !== "data:") nFail++;
      return (
        '<br><img src="' +
        esc(d) +
        '" style="max-width:100' +
        String.fromCharCode(37) +
        ';height:auto;vertical-align:middle"><br>'
      );
    };
    const rich = async (e) => {
      if (!e) return "";
      let h = "";
      const nl = () => {
        if (h && !/<br>$/.test(h)) h += "<br>";
      };
      const walk = async (n) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) {
            h += esc(c.textContent.replace(/\s+/g, " "));
          } else if (c.nodeType === 1) {
            const t = c.tagName.toUpperCase();
            if (t === "BR") {
              h += "<br>";
            } else if (t === "IMG") {
              nl();
              h += (await imgH(c)).replace(/^<br>/, "");
            } else if (t === "SCRIPT" || t === "STYLE" || t === "SVG") {
            } else if (t === "I" && /fa/.test(c.className)) {
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
      return h
        .replace(/(<br>\s*){3,}/g, "<br><br>")
        .replace(/^(\s*<br>)+/, "")
        .replace(/(<br>\s*)+$/, "")
        .trim();
    };
    const tx = (e) => {
      if (!e) return "";
      const c = e.cloneNode(true);
      c.querySelectorAll("img").forEach((i) =>
        i.replaceWith(" [IMAGEN: " + imgSrc(i) + "] "),
      );
      c.querySelectorAll("br").forEach((b) => b.replaceWith("\n"));
      return c.textContent.split("\n").map(norm).filter(Boolean).join("\n");
    };
    ["__qx_panel", "__qx_rep"].forEach((i) => {
      const o = document.getElementById(i);
      if (o) o.remove();
    });
    let stop = false;
    const P = mk(
        "div",
        "position:fixed;top:10px;right:10px;z-index:2147483647;background:rgba(20,20,20,.95);color:white;padding:12px 14px;border-radius:12px;font:14px/1.4 -apple-system,system-ui,sans-serif;width:230px;box-sizing:border-box",
      ),
      msg = mk("div", "white-space:pre-line;margin-bottom:8px"),
      sb = mk(
        "button",
        "font-size:15px;padding:8px 14px;border:0;border-radius:8px;background:crimson;color:white",
        { textContent: "Parar", type: "button" },
      );
    P.id = "__qx_panel";
    sb.onclick = () => {
      stop = true;
    };
    P.append(msg, sb);
    document.body.appendChild(P);
    const say = (t) => {
      msg.textContent = t;
    };
    say("Buscando todas las preguntas...");
    let n = 0,
      same = 0;
    for (let i = 0; i < 40 && same < 3; i++) {
      const c = getQ().length;
      if (c === n) same++;
      else {
        same = 0;
        n = c;
      }
      window.scrollTo(0, document.body.scrollHeight);
      const sc = document.getElementById("preguntas");
      if (sc) sc.scrollTop = sc.scrollHeight;
      await w(350);
    }
    window.scrollTo(0, 0);
    const sc2 = document.getElementById("preguntas");
    if (sc2) sc2.scrollTop = 0;
    const qs = getQ().sort((a, b) => a.id.slice(8) - b.id.slice(8));
    if (!qs.length) {
      P.remove();
      alert("No encuentro preguntas en esta pantalla.");
      return;
    }
    const out = [],
      cards = [],
      pq = [],
      unc = [],
      noex = [];
    for (let i = 0; i < qs.length && !stop; i++) {
      const q = qs[i],
        k = q.id.slice(8);
      say(
        "Respondiendo " +
          (i + 1) +
          " de " +
          qs.length +
          "...\nImágenes: " +
          nImg,
      );
      const opts = [...q.querySelectorAll(".opcionPregunta")].map((o) => {
        const tr = o.closest("tr"),
          d = tr && tr.querySelector("div.respuesta");
        return {
          L: norm(o.getAttribute("value") || o.textContent).toLowerCase(),
          o: o,
          d: d,
          oc: o.getAttribute("onclick") || "",
        };
      });
      if (!opts.length) continue;
      const el = (l, s) =>
          document.getElementById("respuesta" + k + "-" + l + "-" + s),
        good = () =>
          opts.filter((x) => vis(el(x.L, "correcta"))).map((x) => x.L),
        done = () =>
          opts.some(
            (x) => vis(el(x.L, "correcta")) || vis(el(x.L, "incorrecta")),
          ),
        mt = opts[0].oc.match(
          /chequeaRespuestaTest\(\s*'[^']*'\s*,\s*'([a-zA-Z])'/,
        ),
        cand = mt ? mt[1].toLowerCase() : "";
      if (!done()) {
        const x = opts.find((y) => y.L === cand) || opts[0];
        x.o.click();
        for (let t = 0; t < 15 && !done(); t++) await w(100);
        await w(60);
      }
      let cor = good()[0] || "";
      if (!cor) {
        unc.push(k);
        if (cand && !vis(el(cand, "incorrecta"))) cor = cand;
      }
      const ex = document.getElementById("explicacion" + k);
      if (ex) ex.style.display = "block";
      const tt = q.querySelector(".pregunta"),
        extra = [...q.querySelectorAll("img")].filter(
          (im) =>
            !im.closest(
              ".cabeceraPregunta,.pregunta,div.respuesta,[id^=explicacion]",
            ),
        );
      const et = tx(ex);
      const ln = [tx(tt) || "Pregunta " + k];
      extra.forEach((im) => {
        if (imgSrc(im) && okImg(im)) ln.push("[IMAGEN: " + imgSrc(im) + "]");
      });
      opts.forEach((x) =>
        ln.push(x.L + ") " + tx(x.d) + (x.L === cor ? " [CORRECTA]" : "")),
      );
      if (et) ln.push("———————-", "Explicación: " + et);
      else noex.push(k);
      out.push(ln.join("\n"));
      let ex2 = "";
      for (const im of extra) ex2 += await imgH(im);
      const qh = (await rich(tt)) || esc("Pregunta " + k);
      let oh = "";
      const ops = [];
      for (const x of opts) {
        const c = x.L === cor,
          rh = await rich(x.d);
        ops.push({ l: x.L, html: rh });
        oh +=
          '<div style="margin:4px 0;padding:3px 6px;border-radius:5px;' +
          (c ? "background:rgb(217,242,208);" : "") +
          '"><b>' +
          esc(x.L) +
          ")</b> " +
          rh +
          (c ? " ✔" : "") +
          "</div>";
      }
      const eh = ex ? await rich(ex) : "";
      // Para pj.fire: la pregunta ordenada (enunciado, opciones, correcta, explicación).
      pq.push({
        n: k,
        enunciado: qh + ex2,
        opciones: ops,
        correcta: cor,
        confirmada: !unc.includes(k),
        explicacion: eh,
      });
      cards.push(
        '<div style="margin:0 0 16px;padding:10px 12px;border:1px solid rgb(190,190,190);border-radius:8px;background:rgb(248,248,248);color:black"><div style="margin-bottom:6px">' +
          qh +
          "</div>" +
          ex2 +
          oh +
          (eh
            ? '<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgb(190,190,190)"><b>Explicación:</b> ' +
              eh +
              "</div>"
            : "") +
          "</div>",
      );
      await w(60);
    }
    P.remove();
    const txt = out.join("\n\n=====================\n\n"),
      body = cards.join("\n"),
      doc =
        '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test</title></head><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:800px;margin:0 auto;padding:12px;background:white;color:black">' +
        body +
        "</body></html>";
    const R = mk(
      "div",
      "position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:white;color:black;overflow:auto;padding:14px 16px 24px;box-sizing:border-box;font:15px/1.4 -apple-system,system-ui,sans-serif;text-align:left",
    );
    R.id = "__qx_rep";
    const h = mk("p", "margin:0 0 6px;font-weight:700;font-size:17px", {
        textContent:
          out.length +
          " de " +
          qs.length +
          " preguntas" +
          (stop ? " (parado)" : ""),
      }),
      st = mk(
        "p",
        "margin:4px 0 8px;font-weight:600;color:" +
          (unc.length ? "crimson" : "green"),
        {
          textContent:
            (unc.length
              ? "Atención: correcta sin confirmar en las preguntas " +
                unc.join(", ") +
                ". "
              : "Correctas confirmadas por la web en todas. ") +
            (noex.length
              ? "Sin explicación: " + noex.join(", ") + ". "
              : "Todas con explicación. ") +
            "Imágenes: " +
            nImg +
            (nFail
              ? " (" + nFail + " no se pudieron incrustar, se deja el enlace)."
              : "."),
        },
      ),
      mm = mk("p", "margin:10px 0;font-weight:600"),
      bar = mk("div", "display:flex;flex-wrap:wrap;gap:10px;margin-top:8px"),
      bs =
        "font-size:17px;padding:13px 18px;border:0;border-radius:8px;color:white;",
      b1 = mk("button", bs + "background:royalblue", {
        textContent: "Copiar con imágenes",
        type: "button",
      }),
      b2 = mk("button", bs + "background:seagreen", {
        textContent: "Descargar archivo",
        type: "button",
      }),
      b3 = mk("button", bs + "background:darkorange", {
        textContent: "Copiar solo texto",
        type: "button",
      }),
      b0 = mk("button", bs + "background:#f07611", {
        textContent: "Enviar a pj.fire",
        type: "button",
      }),
      b4 = mk("button", bs + "background:dimgray", {
        textContent: "Cerrar",
        type: "button",
      }),
      box = mk(
        "div",
        "margin-top:12px;-webkit-user-select:text;user-select:text;background:white;color:black",
      );
    box.innerHTML = body;
    const selCopy = () => {
      let ok = false;
      try {
        const r = document.createRange();
        r.selectNodeContents(box);
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(r);
        ok = document.execCommand("copy");
        s.removeAllRanges();
      } catch (e) {}
      return ok;
    };
    b1.onclick = async () => {
      try {
        if (
          window.ClipboardItem &&
          navigator.clipboard &&
          navigator.clipboard.write
        ) {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([doc], { type: "text/html" }),
              "text/plain": new Blob([txt], { type: "text/plain" }),
            }),
          ]);
          mm.textContent = "¡Copiado con imágenes!";
          return;
        }
      } catch (e) {}
      mm.textContent = selCopy()
        ? "¡Copiado con imágenes!"
        : "No me deja copiar: usa Descargar archivo.";
    };
    b2.onclick = () => {
      try {
        const a = mk("a", "display:none", {
          href: URL.createObjectURL(new Blob([doc], { type: "text/html" })),
          download: "test_preguntas.html",
        });
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 3000);
        mm.textContent = "Descarga iniciada: mírala en Archivos o Descargas.";
      } catch (e) {
        mm.textContent = "No se pudo descargar: " + e.message;
      }
    };
    b3.onclick = () => {
      const fb = () => {
        let ok = false;
        try {
          const t = mk(
            "textarea",
            "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0",
            { value: txt },
          );
          document.body.appendChild(t);
          t.focus();
          t.select();
          t.setSelectionRange(0, t.value.length);
          ok = document.execCommand("copy");
          t.remove();
        } catch (e) {}
        mm.textContent = ok ? "¡Texto copiado!" : "No me deja copiar.";
      };
      navigator.clipboard && navigator.clipboard.writeText
        ? navigator.clipboard.writeText(txt).then(() => {
            mm.textContent = "¡Texto copiado!";
          }, fb)
        : fb();
    };
    b4.onclick = () => R.remove();
    // ---------- Enviar a pj.fire ----------
    // Se abre la web en otra pestaña; cuando esta avisa de que está lista
    // («pjfire-listo») se le pasan las preguntas. Por si el navegador no deja
    // hablar a las dos pestañas, también se copian al portapapeles para
    // pegarlas allí con un botón.
    const APP = "https://test-pablo-jesus.vercel.app",
      paquete = {
        tipo: "pjfire-preguntas",
        v: 1,
        origen: location.href,
        titulo: norm(document.title),
        preguntas: pq,
      };
    let enviado = false;
    addEventListener("message", (e) => {
      if (e.origin !== APP || !e.data) return;
      if (e.data.tipo === "pjfire-listo" && !enviado) {
        enviado = true;
        e.source.postMessage(paquete, APP);
        mm.textContent = "Enviado a pj.fire: elige allí en qué test meterlo.";
      } else if (e.data.tipo === "pjfire-recibido") {
        mm.textContent = "¡pj.fire ha recibido las " + pq.length + " preguntas!";
      }
    });
    const enviar = () => {
      try {
        navigator.clipboard &&
          navigator.clipboard
            .writeText("PJFIRE-PREGUNTAS:" + JSON.stringify(paquete))
            .catch(() => {});
      } catch (e) {}
      const v = window.open(APP + "/#importar-especifico", "_blank");
      if (v) mm.textContent = "Abriendo pj.fire…";
      return !!v;
    };
    b0.onclick = () => {
      enviado = false;
      if (!enviar()) mm.textContent = "El navegador no deja abrir pj.fire: permite las ventanas emergentes.";
    };
    bar.append(b0, b1, b2, b3, b4);
    R.append(h, st, bar, mm, box);
    document.documentElement.appendChild(R);
    // Se intenta enviar solo; si el navegador bloquea la pestaña nueva
    // (lo normal en el iPad tras tanto rato), queda el botón naranja.
    if (pq.length && !enviar())
      mm.textContent = "Pulsa «Enviar a pj.fire» para pasar las preguntas a tu web.";
  } catch (e) {
    const p = document.getElementById("__qx_panel");
    if (p) p.remove();
    alert("Error: " + e.message);
  }
})();
void 0;

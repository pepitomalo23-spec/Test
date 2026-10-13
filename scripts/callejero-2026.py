#!/usr/bin/env python3
"""Callejero Fiscal 2026 del Ayuntamiento (PDF) → datos/callejero-2026.json y
datos/callejero-2026/pNN.webp (una imagen por página, para verlo con la fila marcada).

Uso: python3 scripts/callejero-2026.py CALLEJERO-2026.pdf
Necesita pdftotext y pdftoppm (poppler) y Pillow.

JSON: { pags, ancho, alto, filas: [[código, sigla, nombre, núcleo, página, x0, y0, x1, y1], …] }
(la caja de la fila en puntos del PDF, para marcarla sobre la imagen)."""
import html, json, os, re, subprocess, sys, tempfile, glob
from PIL import Image

pdf = sys.argv[1]
raiz = os.path.join(os.path.dirname(__file__), '..', 'datos')
tmp = tempfile.mkdtemp()
subprocess.run(['pdftotext', '-bbox-layout', pdf, os.path.join(tmp, 'b.html')], check=True)
s = open(os.path.join(tmp, 'b.html'), encoding='utf-8').read()
paginas = re.findall(r'<page width="([\d.]+)" height="([\d.]+)">(.*?)</page>', s, re.S)
COD = re.compile(r'\d{1,5}-\d\d')
SIG = re.compile(r'[A-Za-z]{2,3}')
filas, nucleo = [], 'CORDOBA'
for pi, (pw, ph, cuerpo) in enumerate(paginas):
    pw, ph = float(pw), float(ph)
    ws = [(float(a), float(b), float(c), float(d), html.unescape(t)) for a, b, c, d, t in
          re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>', cuerpo)]
    for col in (0, 1):   # dos columnas por página
        cw = sorted([w for w in ws if (w[0] < pw / 2 - 5) == (col == 0) and w[1] > 80], key=lambda w: (w[1], w[0]))
        cods = [w for w in cw if COD.fullmatch(w[4])]
        x0 = min(w[0] for w in cods) if cods else min((w[0] for w in cw), default=0)
        lineas = []
        for w in cw:
            if lineas and abs(lineas[-1][0][1] - w[1]) < 2.5: lineas[-1].append(w)
            else: lineas.append([w])
        actual, cabecera = None, False
        for L in lineas:
            L.sort(key=lambda w: w[0])
            if COD.fullmatch(L[0][4]) and L[0][0] < x0 + 25:
                c, resto = L[0], L[1:]
                sig = ''
                if resto and SIG.fullmatch(resto[0][4]) and resto[0][0] < c[0] + 60: sig, resto = resto[0][4].upper(), resto[1:]
                nom = [w for w in resto if w[0] < c[0] + 142]
                actual = [c[4], sig, ' '.join(w[4] for w in nom), nucleo, pi + 1,
                          round(c[0], 1), round(c[1], 1), round(max(w[2] for w in L), 1), round(max(w[3] for w in L), 1)]
                filas.append(actual)
                cabecera = False
            elif L[0][0] < x0 + 25 and all(w[4].isupper() or not w[4].isalpha() for w in L) \
                    and not any(re.search(r'\d', w[4]) for w in L) and len(L) <= 4 and L[0][4] != 'NOTAS:':
                # el núcleo (CORDOBA, ALCOLEA…); si ocupa dos líneas («ENCINAREJO / DE CORDOBA»), se juntan
                nucleo = (nucleo + ' ' if cabecera else '') + ' '.join(w[4] for w in L)
                actual, cabecera = None, True
            elif actual and x0 + 40 <= L[0][0] < x0 + 142 and L[0][1] - actual[8] < 12:
                actual[2] += ' ' + ' '.join(w[4] for w in L if w[0] < x0 + 142)   # el nombre sigue en otra línea
                actual[7] = round(max(actual[7], max(w[2] for w in L)), 1); actual[8] = round(max(w[3] for w in L), 1)
os.makedirs(os.path.join(raiz, 'callejero-2026'), exist_ok=True)
subprocess.run(['pdftoppm', '-r', '130', '-png', pdf, os.path.join(tmp, 'pg')], check=True)
for f in sorted(glob.glob(os.path.join(tmp, 'pg-*.png'))):
    n = int(re.search(r'pg-(\d+)', f).group(1))
    Image.open(f).convert('L').save(os.path.join(raiz, 'callejero-2026', 'p%02d.webp' % n), 'WEBP', quality=60)
pw, ph = float(paginas[0][0]), float(paginas[0][1])
json.dump({'fuente': 'Ayuntamiento de Córdoba, Callejero Fiscal 2026', 'pags': len(paginas), 'ancho': pw, 'alto': ph, 'filas': filas},
          open(os.path.join(raiz, 'callejero-2026.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(filas), 'filas,', len(paginas), 'páginas')

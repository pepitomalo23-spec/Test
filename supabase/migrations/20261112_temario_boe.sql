-- =====================================================================
-- Temario: el texto oficial de cada artículo (BOE), tal cual.
--   privado.boe_laula: el XML de cada artículo de la Ley 5/2010
--     (BOE-A-2010-11491) que devuelve la API de datos abiertos del BOE
--     (.../texto/bloque/aN). Se descarga con pg_net en grupos pequeños
--     (el BOE corta si se le piden muchos a la vez).
--   privado.temario_rellenar(html): cambia cada hueco vacío
--     <div class="tg-articulo" data-art="N"></div>
--     (o con data-ap="D-H" para solo los apartados D a H) por los párrafos
--     de la última versión del artículo.
-- El esquema privado no lo expone la API: solo se usa desde SQL.
-- Se puede aplicar más de una vez.
-- =====================================================================
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create table if not exists privado.boe_laula (
  n int primary key,
  contenido text not null,
  fetched_at timestamptz not null default now()
);

create or replace function privado.laula_art_html(n int, d int, h int) returns text language plpgsql stable as $f$
declare ps xml[]; out text := ''; k int; t text; dentro boolean := d is null; num int;
begin
  select xpath('/response/data/bloque/version[last()]/p', contenido::xml) into ps from privado.boe_laula where boe_laula.n = laula_art_html.n;
  if ps is null then raise exception 'falta el artículo %', n; end if;
  for k in 1..coalesce(array_length(ps, 1), 0) loop
    t := (xpath('string(.)', ps[k]))[1]::text;
    num := substring(t from '^(\d+)\.')::int;
    if d is not null and num is not null then dentro := num between d and h; end if;
    -- Con apartados: siempre el título y la frase inicial del artículo.
    if d is not null and k <= 2 and num is null then out := out || ps[k]::text;
    elsif dentro then out := out || ps[k]::text; end if;
  end loop;
  if out = '' then raise exception 'artículo % vacío', n; end if;
  return out;
end $f$;

create or replace function privado.temario_rellenar(html text) returns text language plpgsql stable as $f$
declare m text[]; r text := html;
begin
  -- Solo huecos vacíos (sin «.*»: en las expresiones de Postgres la avaricia
  -- la decide el primer cuantificador y se comería el resto del paso).
  for m in select regexp_matches(html, '<div class="tg-articulo" data-art="([0-9]+)"(?: data-ap="([0-9]+)-([0-9]+)")?></div>', 'g') loop
    r := replace(r,
      '<div class="tg-articulo" data-art="' || m[1] || '"' || coalesce(' data-ap="' || m[2] || '-' || m[3] || '"', '') || '></div>',
      '<div class="tg-articulo" data-art="' || m[1] || '"' || coalesce(' data-ap="' || m[2] || '-' || m[3] || '"', '') || '>' || privado.laula_art_html(m[1]::int, m[2]::int, m[3]::int) || '</div>');
  end loop;
  return r;
end $f$;
revoke all on all functions in schema privado from public, anon, authenticated;

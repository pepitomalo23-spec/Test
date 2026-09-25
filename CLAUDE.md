# pj.fire

Static web app (no build step) deployed on Vercel, backed by Supabase. The user writes in Spanish; code comments are in Spanish.

- Structure and load order: see README.md. `js/` files are classic scripts sharing the global scope, loaded in the order listed at the end of `index.html`. Top-level code in a file may only use what earlier files declared; `js/arranque.js` must stay last.
- After editing anything in `css/` or `js/`, run `node scripts/versionar.mjs` and commit the updated `index.html`. CI (`.github/workflows/comprobar.yml`) fails if a `?v=` is stale.
- `sw.js` precaches `index.html` plus every `css/`/`js/` file it links; versioned files are served cache-first without revalidation, so a stale `?v=` means users keep the old file.

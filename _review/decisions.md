# Build decisions (redesign 2026)

Quarto behaviour verified in Phase 1 spikes (Quarto 1.7.33, 2026-11-03), and the choices that follow from it.

## Quarto behaviour

| Question | Finding | Consequence |
|---|---|---|
| Listings from YAML data with custom EJS | Works, including `sort`, `include:` filters (e.g. `thread: error`) and mixing `.qmd` files with `.yml` in one listing | `data/*.yml` + `_templates/*.ejs` is the content model |
| Listing container id | Quarto wraps a listing in `#listing-<id>` | Style and test against `#listing-…` |
| Relative `aliases:` (e.g. `../projects/x.html`) | Writes JS + meta-refresh stubs; stubs are **not** in `sitemap.xml` | Use aliases for every retired URL in `tools/redirects.yml` |
| `respect-user-color-scheme: true` | Supported; follows `prefers-color-scheme` on first visit | Enabled in `_quarto.yml` |
| SCSS `@import "partial"` in theme files | Works (resolved relative to the theme file) | `theme/_legacy.scss` and future partials |
| One-line CSS custom properties (`:root{--x:#fff}`) | Quarto's css-vars pass throws `SCSSParsingError` | Always write `:root { … }` blocks multi-line |
| Lua filter access to `website.site-url` | **Not** in filter `meta` | `filters/seo.lua` reads `_quarto.yml` and `_variables.yml` itself |
| `title-block-style: none` | Still emits an `<h1>` plus a stray author header | Don't use it. Hide visually (`.page-home`) or make the title the page's H1 |
| Quarto title metadata (author/date/keywords) | Shown by default once the title block is visible | Hidden via `#title-block-header.quarto-title-block.default …` in `base.scss` |

## Fonts

- Self-hosted from Fontsource 5.3.0 (OFL 1.1), Latin-1 subsets (pyftsubset).
- Newsreader is used only for display sizes, so it is **instanced at opsz=36, wght 300–600**. That takes it from 130 KB to 52 KB per style.
- Total weight: ~228 KB for 8 files. Only Newsreader roman and Plex Sans 400 are preloaded (`_includes/head.html`).

## Paths

- Fonts and the legacy hero image use root-absolute URLs (`/assets/...`), because compiled theme CSS lives in `site_libs/bootstrap/`. The site is always served from the domain root.

## Tooling notes

- Snap Chromium cannot write to `/tmp`. Point `--screenshot=` at a folder under `$HOME`, then move the files.
- PhilPeople and PhilSci Archive block automated requests (403). Check those links by hand; don't work around the bot protection.
- `github.io` legitimately appears in output only inside the repo URL (`github.com/Ryan-J-OLoughlin/Ryan-J-OLoughlin.github.io/...`, the edit/issue links). Site checks should flag `://Ryan-J-OLoughlin.github.io` only.

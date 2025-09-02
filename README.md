# Ryan J O'Loughlin — Quarto Website

This repository contains the source for Ryan J O'Loughlin’s personal website, built with Quarto and served via GitHub Pages.

- Tech: Quarto website, HTML/CSS, Font Awesome shortcodes
- Entry points: `_quarto.yml` (site config), `index.qmd` (home), other `*.qmd` pages
- Output: renders to `_site/` (not committed) per `_quarto.yml`

## Quick Start

- Install Quarto: https://quarto.org/docs/get-started/
- Clone the repo and preview locally:
  - `quarto preview` — live-reloads as you edit `*.qmd` and `styles.css`
  - `quarto render` — one-time build into `_site/`

## Deploy (GitHub Pages)

This repo does not include a GitHub Actions workflow. Two common options:

- Quarto publish to `gh-pages` branch (recommended):
  - `quarto publish gh-pages` — pushes rendered site to the `gh-pages` branch
  - In GitHub → Settings → Pages, set Source to “Deploy from a branch” → `gh-pages` `/` root

- Manual deploy (less ideal):
  - `quarto render` → copy contents of `_site/` to your Pages branch or the repository root being served

Site URL is set in `_quarto.yml` under `website.site-url`.

## Project Structure

- `_quarto.yml` — site metadata, navbar, footer, theme, and global HTML options
- `index.qmd` — homepage
- `about.qmd` — bio page with interactive timeline include
- `research.qmd` — agenda, publications, projects
- `for-philosophers.qmd` — collaboration info for philosophers
- `for-scientists.qmd` — talks and collaboration for scientists
- `teaching-students.qmd`, `teaching-instructors.qmd` — teaching resources and syllabi links
- `media.qmd`, `contact.qmd`, `collaboration.qmd` — media kit, contact, and hub page
- `styles.css` — site styling and brand tokens (light/dark aware)
- `_extensions/quarto-ext/fontawesome/` — Font Awesome shortcode support
- `assets/` — images, logos, Open Graph card, timeline assets
- `files/` — PDFs and sources (CV and syllabi)

## Customization

- Navbar and footer: `_quarto.yml` under `website.navbar` and `website.page-footer`
- Theme and options: `_quarto.yml` under `format.html` (theme, TOC, smooth-scroll, etc.)
- Styling: edit `styles.css` (fonts, colors, layout helpers, cards, logo-strip, dark mode)
- Social cards: `assets/og-card.png`, plus `website.open-graph`/`twitter-card` enabled
- Repo links: `_quarto.yml` `repo-url` and `repo-actions` (shows “Edit”/“Issue” links in page header)

## Icons (Font Awesome)

The repo vendors a Quarto Font Awesome extension. Use shortcodes like:

- `{{< fa envelope >}}` → envelope icon
- `{{< fa linkedin >}}` → LinkedIn icon

The extension is loaded automatically via `_extensions/quarto-ext/fontawesome`.

## Timeline Component (About page)

- Data: `assets/timeline/timeline.json` (year, image path, and caption)
- Code: `assets/timeline/timeline.js` and `assets/timeline/timeline.css`
- Images: `assets/timeline/images/*.jpg`

Included in `about.qmd` via:

```html
<link rel="stylesheet" href="/assets/timeline/timeline.css">
<div id="timeline" class="timeline" aria-label="Ryan's story"></div>
<script src="/assets/timeline/timeline.js" defer></script>
```

Update the JSON to add, reorder, or edit timeline entries. Be sure image paths are correct.

## Teaching Files and CV

- Syllabi PDFs live in `files/syllabi/` and are linked from teaching pages
- CV PDF is at `files/Ryan_OLoughlin_CV.pdf`
- Optional LaTeX sources for a CV (`files/cv-template.tex`, `files/cv-header.tex`, `files/cv-content.md`) are included but not part of the Quarto build; compile separately if you use them

## Notes

- Footer shows “CC BY 4.0” with a link; adjust in `_quarto.yml` if your licensing changes
- To add a new page: create `new-page.qmd`, then add it to the navbar in `_quarto.yml`
- The site uses page front-matter `date-modified` to display update timestamps in some pages

## Commands Reference

- Preview: `quarto preview`
- Build: `quarto render`
- Publish to Pages: `quarto publish gh-pages`

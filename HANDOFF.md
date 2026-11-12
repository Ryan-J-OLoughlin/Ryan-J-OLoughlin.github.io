# Handoff: ryanoloughlin.org cube site

Start here if you're picking this up in Claude Code (or by hand).

## What this is

The new site for ryanoloughlin.org: a plain HTML page built from YAML data, with a 3D scene layered on top. The scene walks through Ryan's work as a climate-model hierarchy, driven by scrolling:

1. **0D**: one glass cube and the tagline.
2. **1D**: three stacked cubes (robustness, errors, antifragility) with vapor moving between them.
3. **3D**: one grid per layer (year × category), a cube per piece of work, hover cards, a "Turn 90°" button, and layer names that bring a layer forward.
4. **ESM**: a zoom-out to one cube ("this model"), then a curving landscape of fields with people as cubes. Names link to their pages.

The full design rationale is in the claude.ai project "Ryan Homepage" (`claude/design-brief-cube-concept.md`, `claude/implementation-plan.md`).

## Git

This folder is a git repository on branch **`cube-site`**, an orphan branch with its own history (see `git log`). It was created inside a clone of `Ryan-J-OLoughlin/Ryan-J-OLoughlin.github.io` but **has not been pushed**.

To push it:

```
git remote -v                       # should show the Ryan-J-OLoughlin repo; if not:
git remote add origin https://github.com/Ryan-J-OLoughlin/Ryan-J-OLoughlin.github.io.git
git push -u origin cube-site
```

You need push access to Ryan's repo, either Dan's own GitHub login or the Claude GitHub App installed on Ryan's account.

**Don't touch these branches:**

- `gh-pages`: the live Quarto site is served from it. Leave it as the rollback.
- `main`: Quarto source.
- `redesign-2026`: Dan's earlier Quarto redesign.

## Run it

Needs Node 20 or newer.

```
npm install
npm run dev        # live preview at http://localhost:5173
npm run build      # checks the data, builds into dist/
npm run preview    # serves dist/ at http://localhost:4173
```

Open the built site through a server, not by double-clicking `dist/index.html`.

## Where things live

```
data/works.yaml        every paper, talk, course, outreach item, grant
data/people.yaml       people on the ESM landscape (first field listed = where they lean)
data/site.yaml         tagline, headings, topics, categories, fields, contact
public/                static files (contours.svg, CNAME, files/ for PDFs)
scripts/build-data.js  checks the YAML; writes src/index.html and src/generated/scene-data.json
src/template.html      page structure (edit this, never src/index.html)
src/main.js            loads the 3D only if the browser can draw it
src/styles/tokens.css  colors, typefaces, type scale (shared with the Light game)
src/styles/base.css    plain page
src/styles/scene.css   3D overlay text, labels, stage control
src/light/             the Light game at /light/ (plain JS, 2D canvas; see README)
src/scene/
  index.js     wires everything together; overlays; stage control
  scroll.js    scroll position → stage progress (holds and move lengths in TRACK)
  stages.js    where everything sits for any progress value 0–3
  setup.js     renderer, camera, zoom per stage
  cubes.js     glass cube (front and hidden edges, tint strength)
  air.js       vapor in the 1D gaps
  grid.js      3D stage: grids, work cubes, threads, focus, turn
  landscape.js ESM stage: terrain, field placement, people placement
  labels.js    pins HTML labels to 3D points
  pick.js      hover and click on cubes
```

## Data rules

- `npm run build` stops with a clear message if a topic, category, field or co-author id is misspelled.
- Entries with `review: true` (and a `note`) are judgment calls waiting for Ryan. Delete both lines once confirmed. The build prints how many are left.

## Status

**Done:** all four stages; scroll-driven on all screens; plain-page fallback for screen readers, search engines, reduced motion and no-3D browsers.

**Open:**

- Copy is still placeholder: the tagline, the 1D, 3D and ESM headings, and the thank-you line (all in `site.yaml`).
- 21 works are marked `review: true` for Ryan.
- Profile links in `site.yaml` (Scholar, PhilPeople, ORCID, GitHub) are empty, and there's no CV PDF yet at `public/files/cv.pdf`.
- Phone polish: ESM names are tight on small screens.
- "Not AI" polish pass: typefaces, spacing, motion timing.
- Motion has only been checked in still screenshots; it needs a feel test on real devices.

**Deploying (when approved):** add a GitHub Actions workflow that runs `npm ci && npm run build` and deploys `dist/` to GitHub Pages. Then switch Pages from the `gh-pages` branch to "GitHub Actions". `public/CNAME` already holds `ryanoloughlin.org`. To roll back, point Pages at `gh-pages` again.

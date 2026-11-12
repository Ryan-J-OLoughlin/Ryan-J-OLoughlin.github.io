# ryanoloughlin.org

Static site. Vite, plain HTML/CSS/JS, content in YAML. No framework, no backend.

## Everyday use

- **Add or change a paper, talk, course, outreach item or grant:** edit `data/works.yaml`.
- **Add or change a person:** edit `data/people.yaml`.
- **Change the tagline, topics, categories or contact details:** edit `data/site.yaml`.
- **Add a PDF or slides:** put the file in `public/files/` and link it as `files/name.pdf` in the item's `links`.

Then publish. The build checks the data first and stops with a clear message if something is misspelled or missing.

## Commands

```
npm install        # once
npm run dev        # live preview at http://localhost:5173
npm run build      # checks data, builds the site into dist/
npm run preview    # serves dist/ to check the built site
```

Open the built site through `npm run preview` (or any web server), not by double-clicking `dist/index.html`. Browsers block the stylesheet on file:// pages.

## Where things live

```
data/                 the content (YAML)
public/files/         PDFs, slides, CV
scripts/build-data.js checks the YAML and writes src/index.html from src/template.html
src/template.html     page structure — edit this, never src/index.html
src/styles/tokens.css typefaces, colors and type scale (shared by the homepage and Light)
src/styles/base.css   homepage styling
src/light/            the Light game, served at /light/ (plain JS, 2D canvas)
```

## The Light game

`src/light/` is a separate page. `npm run dev` serves it at http://localhost:5173/light/.
Each file says at the top what it does: `world.js` (terrain from the seed), `cubes.js`
(the four cube types), `beams.js` (how light travels), `draw.js`, `input.js`, `ui.js`,
`save.js`, and `main.js` (the rules and scoring). The old game's address,
`/assets/game.html`, redirects to `/light/`.

## Entries marked `review: true`

These are judgment calls waiting for Ryan to confirm. The build lists how many are left. Delete the `review` and `note` lines once confirmed.

## Coming next

The 3D layer (Three.js and GSAP) goes in `src/scene/` and loads on top of this page. The plain page stays as the fallback for screen readers, search engines, reduced motion and phones without 3D support.

// build-data.js
// Reads the YAML files in data/, checks them, and writes src/index.html
// from src/template.html. Run with: npm run data
//
// The template has placeholders like {{tagline}} and {{works}}.
// Every placeholder is filled with plain HTML, so the page works with no JavaScript.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import yaml from 'js-yaml';

const root = new URL('..', import.meta.url);
const read = (path) => yaml.load(readFileSync(new URL(path, root), 'utf8'));

const site = read('data/site.yaml');
const allWorks = read('data/works.yaml');
const people = read('data/people.yaml');

// ───────────── checks ─────────────
// Fail loudly so a typo never becomes a broken page or a broken cube.

const problems = [];
const topicIds = site.topics.map((t) => t.id);
const categoryIds = site.categories.map((c) => c.id);
const fieldIds = site.fields.map((f) => f.id);
const personIds = new Set(people.map((p) => p.id));
const relations = ['co-author', 'collaborator', 'mentor', 'colleague'];

const seen = new Set();
for (const w of allWorks) {
  const where = `works.yaml → ${w.id ?? w.title ?? '(no id)'}`;
  if (!w.id) problems.push(`${where}: missing id`);
  if (seen.has(w.id)) problems.push(`${where}: id used twice`);
  seen.add(w.id);
  if (!w.title) problems.push(`${where}: missing title`);
  if (!Number.isInteger(w.year)) problems.push(`${where}: year must be a number`);
  if (!categoryIds.includes(w.type)) problems.push(`${where}: type "${w.type}" is not one of ${categoryIds.join(', ')}`);
  if (w.show !== undefined && typeof w.show !== 'boolean') problems.push(`${where}: show must be true or false`);
  if (w.featured !== undefined && typeof w.featured !== 'boolean') problems.push(`${where}: featured must be true or false`);
  if (!Array.isArray(w.topics) || w.topics.length === 0) problems.push(`${where}: needs at least one topic`);
  for (const t of w.topics ?? []) {
    if (!topicIds.includes(t)) problems.push(`${where}: topic "${t}" is not one of ${topicIds.join(', ')}`);
  }
  for (const p of w.with ?? []) {
    if (!personIds.has(p)) problems.push(`${where}: co-author "${p}" is not in people.yaml`);
  }
}

for (const p of people) {
  const where = `people.yaml → ${p.id ?? p.name ?? '(no id)'}`;
  if (!p.id || !p.name) problems.push(`${where}: needs id and name`);
  if (!relations.includes(p.relation)) problems.push(`${where}: relation "${p.relation}" is not one of ${relations.join(', ')}`);
  if (!Array.isArray(p.fields) || p.fields.length === 0) problems.push(`${where}: needs at least one field`);
  for (const f of p.fields ?? []) {
    if (!fieldIds.includes(f)) problems.push(`${where}: field "${f}" is not one of ${fieldIds.join(', ')}`);
  }
}

if (problems.length) {
  console.error(`\nData problems (${problems.length}):\n  - ${problems.join('\n  - ')}\n`);
  process.exit(1);
}

// show: false keeps a work in the data (and the CV) but off the site.
const works = allWorks.filter((w) => w.show !== false);

const flagged = allWorks.filter((w) => w.review).length + people.filter((p) => p.review).length;
if (flagged) console.log(`Note: ${flagged} entries still marked review: true`);

// ───────────── HTML pieces ─────────────

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const label = {
  topic: Object.fromEntries(site.topics.map((t) => [t.id, t.label])),
  category: Object.fromEntries(site.categories.map((c) => [c.id, c.label])),
  field: Object.fromEntries(site.fields.map((f) => [f.id, f.label])),
};
const personName = Object.fromEntries(people.map((p) => [p.id, p.name]));

// The single label shown for a work's category ("Paper", not "Papers").
const singular = { paper: 'Paper', talk: 'Talk', teaching: 'Teaching', outreach: 'Outreach', grant: 'Grant' };

function workLinks(links = {}) {
  const names = { pdf: 'PDF', slides: 'Slides', doi: 'DOI', url: 'Link' };
  return Object.entries(links)
    .filter(([, href]) => href)
    .map(([kind, href]) => `<a href="${esc(href)}">${names[kind] ?? esc(kind)}</a>`)
    .join(' ');
}

function workItem(w, topicId) {
  const others = w.topics.filter((t) => t !== topicId).map((t) => label.topic[t]);
  const withNames = (w.with ?? []).map((id) => personName[id]);
  const meta = [
    singular[w.type],
    w.venue,
    withNames.length ? `with ${withNames.join(', ')}` : '',
    others.length ? `also ${others.join(', ').toLowerCase()}` : '',
  ].filter(Boolean);
  const links = workLinks(w.links);
  const selected = w.featured ? '\n    <span class="work-selected">Selected work</span>' : '';
  return `<li class="work${w.featured ? ' is-featured' : ''}" data-id="${esc(w.id)}" data-type="${esc(w.type)}" data-year="${w.year}" data-topics="${esc(w.topics.join(' '))}">
  <span class="work-year">${w.year}</span>
  <div class="work-body">
    <span class="work-title">${esc(w.title)}</span>${selected}
    <span class="work-meta">${esc(meta.join(' · '))}</span>${links ? `\n    <span class="work-links">${links}</span>` : ''}
  </div>
</li>`;
}

// Each work is listed once, under its first topic; other topics are noted in its line.
const worksHtml = [...site.topics]
  .reverse() // top layer first when read down the page
  .map((t) => {
    const list = works.filter((w) => w.topics[0] === t.id).sort((a, b) => b.year - a.year || a.title.localeCompare(b.title));
    return `<section class="topic" id="topic-${t.id}" data-topic="${t.id}" aria-labelledby="topic-${t.id}-h">
  <header class="topic-head">
    <h3 id="topic-${t.id}-h">${esc(t.label)}</h3>
    <p class="topic-line">${esc(t.line)}</p>
  </header>
  <ol class="works" reversed>
${list.map((w) => workItem(w, t.id)).join('\n')}
  </ol>
</section>`;
  })
  .join('\n');

// People grouped by the first field they sit in.
const peopleHtml = site.fields
  .map((f) => {
    const list = people.filter((p) => p.fields[0] === f.id);
    if (!list.length) return '';
    const items = list
      .map((p) => {
        const name = p.url ? `<a href="${esc(p.url)}">${esc(p.name)}</a>` : esc(p.name);
        const also = p.fields.slice(1).map((id) => label.field[id]);
        const title = p.place ? ` <span class="person-title">${esc(p.place)}</span>` : '';
        return `<li data-fields="${esc(p.fields.join(' '))}">${name}${title}${also.length ? ` <span class="person-also">also ${esc(also.join(', '))}</span>` : ''}</li>`;
      })
      .join('\n');
    return `<div class="field" data-field="${f.id}">
  <h3>${esc(f.label)}</h3>
  <ul class="people">
${items}
  </ul>
</div>`;
  })
  .join('\n');

const profileNames = { google_scholar: 'Google Scholar', philpeople: 'PhilPeople', orcid: 'ORCID', github: 'GitHub', linkedin: 'LinkedIn' };
const profiles = Object.entries(site.contact.links ?? {})
  .filter(([, href]) => href)
  .map(([k, href]) => `<a href="${esc(href)}">${profileNames[k] ?? esc(k)}</a>`)
  .join('\n');

const fill = {
  name: esc(site.name),
  role: esc(site.role),
  tagline: esc(site.tagline),
  tagline_sub: esc(site.tagline_sub ?? ''),
  stage_buttons: site.stages
    .map((st, i) => `<button type="button" data-goto="${i}" aria-pressed="${i === 0}"><span class="dot" aria-hidden="true"></span><span><span class="code">${esc(st.code)}</span><span class="name">${esc(st.name)}</span></span></button>`)
    .join('\n      '),
  topics: [...site.topics]
    .reverse()
    .map((t) => `<li><a href="#topic-${t.id}"><span class="topic-name">${esc(t.label)}</span> <span class="topic-line">${esc(t.line)}</span></a></li>`)
    .join('\n'),
  layers_intro: esc(site.layers_intro),
  grid_intro: esc(site.grid_intro),
  grid_hint: esc(site.grid_hint),
  people_hint: esc(site.people_hint),
  scene_labels: site.topics
    .map((t) => `<li class="scene-label" data-topic="${t.id}"><button type="button" class="topic-name" data-focus="${t.id}">${esc(t.label)}</button><span class="topic-line">${esc(t.line)}</span></li>`)
    .join('\n'),
  works: worksHtml,
  people: peopleHtml,
  thank_you: esc(site.thank_you),
  email: esc(site.contact.email),
  cv: esc(site.contact.cv),
  profiles,
  year: String(new Date().getFullYear()),
};

let html = readFileSync(new URL('src/template.html', root), 'utf8');
html = html.replace(/\{\{(\w+)\}\}/g, (m, key) => {
  if (!(key in fill)) {
    console.error(`template.html uses {{${key}}}, which build-data.js doesn't know`);
    process.exit(1);
  }
  return fill[key];
});

writeFileSync(new URL('src/index.html', root), html);

// ───────────── data for the 3D scene ─────────────
// A trimmed copy of the works the cubes need. Review notes are left out.
const firstLink = (links = {}) => links.pdf || links.doi || links.url || links.slides || '';
const sceneData = {
  years: site.years,
  topics: site.topics.map((t) => ({ id: t.id, label: t.label })),
  categories: site.categories,
  works: works.map((w) => ({
    id: w.id,
    title: w.title,
    year: w.year,
    type: w.type,
    typeLabel: singular[w.type],
    topics: w.topics,
    venue: w.venue ?? '',
    with: (w.with ?? []).map((id) => personName[id]),
    link: firstLink(w.links),
    featured: Boolean(w.featured),
  })),
};
sceneData.fields = site.fields;
sceneData.people = people.map((p) => ({ id: p.id, name: p.name, url: p.url ?? '', place: p.place ?? '', fields: p.fields, relation: p.relation }));
sceneData.thisModel = site.this_model ?? 'this model';
mkdirSync(new URL('src/generated', root), { recursive: true });
writeFileSync(new URL('src/generated/scene-data.json', root), JSON.stringify(sceneData));
console.log(`Wrote src/index.html: ${works.length} works, ${people.length} people`);

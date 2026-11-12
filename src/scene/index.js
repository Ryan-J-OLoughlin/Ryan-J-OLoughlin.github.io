// index.js — puts the scene together and connects the stage control.
// Loaded by main.js only when the browser can draw 3D.

import { Color, Vector3 } from 'three';
import { gsap } from 'gsap';
import data from '../generated/scene-data.json';
import { createSetup } from './setup.js';
import { createGlassCube } from './cubes.js';
import { createAir } from './air.js';
import { createGrid, CELL } from './grid.js';
import { createStages, LAYERS, GAPS, LAYER_Y } from './stages.js';
import { toScreen, pin } from './labels.js';
import { createPicker } from './pick.js';
import { createScroll } from './scroll.js';
import { createLandscape, heightAt, MODEL_SPOT, FIELD_CENTERS, CUBE as PERSON_CUBE } from './landscape.js';

const LAND_Y = -1.4; // the landscape sits a little below the model's centre

const clamp = (x) => Math.min(1, Math.max(0, x));
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Colors come from the CSS variables, so the palette lives in one place (base.css).
function cssColor(name) {
  return new Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
}

export function start() {
  const section = document.getElementById('scene');
  const pinned = section.querySelector('.scene-sticky'); // the picture that stays put while you scroll
  const holder = section.querySelector('.scene-canvas');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const colors = {
    start: cssColor('--ocean'),
    robustness: cssColor('--ocean'),
    errors: cssColor('--green'),
    antifragility: cssColor('--earth'),
    ink: cssColor('--ink'),
    air: cssColor('--ink-soft'),
    tile: cssColor('--rule'),
    paper: cssColor('--ground'),
  };
  // fields of the ESM landscape
  colors['climate-modeling'] = colors.robustness;
  colors.philosophy = colors.antifragility;
  colors.ai = colors.errors;
  colors.policy = cssColor('--sand');

  const setup = createSetup(holder);
  const { renderer, scene, camera } = setup;

  // stage 0D/1D: the column cubes
  const cubes = {};
  for (const layer of LAYERS) {
    cubes[layer] = createGlassCube(colors.start, colors.ink);
    scene.add(cubes[layer].group);
  }
  const air = createAir(colors.air, [
    { ...GAPS[0], tint: colors.robustness.clone().lerp(colors.errors, 0.5) },
    { ...GAPS[1], tint: colors.errors.clone().lerp(colors.antifragility, 0.5) },
  ]);
  scene.add(air.object);

  // stage 3D: the grids of work
  const grid = createGrid({ data, layerY: LAYER_Y, colors });
  scene.add(grid.object);

  // stage ESM: the shared landscape and the people on it
  const landscape = createLandscape({ data, colors });
  landscape.object.position.y = LAND_Y;
  scene.add(landscape.object);
  // where the grid shrinks to: the ground is still flat then; the cube rides up as the land rises
  const modelSpot = new Vector3(MODEL_SPOT[0], LAND_Y + PERSON_CUBE / 2, MODEL_SPOT[1]);

  const stages = createStages({ cubes, air, grid, landscape, modelSpot, modelSize: PERSON_CUBE, colors });

  // ───── web-text overlays ─────
  const layerLabels = Object.fromEntries(
    [...section.querySelectorAll('.scene-label')].map((el) => [el.dataset.topic, el]),
  );
  const axes = section.querySelector('.grid-axes');
  const yearEls = grid.years.map((y) => axes.appendChild(Object.assign(document.createElement('span'), { className: 'axis axis-year', textContent: y })));
  const catEls = data.categories.map((c) => axes.appendChild(Object.assign(document.createElement('span'), { className: 'axis axis-cat', textContent: c.label })));
  const card = section.querySelector('.work-card');
  const turnButton = section.querySelector('.turn-button');
  const thanksText = section.querySelector('.scene-text-3');

  // ESM labels: field names, and a name for each person (a link to their page)
  const esmLayer = section.querySelector('.esm-labels');
  const fieldEls = data.fields.map((f) => {
    const el = esmLayer.appendChild(Object.assign(document.createElement('span'), { className: 'esm-field', textContent: f.label }));
    el.dataset.field = f.id;
    return { el, id: f.id };
  });
  const titleEl = esmLayer.appendChild(Object.assign(document.createElement('span'), { className: 'esm-title' }));
  titleEl.setAttribute('aria-hidden', 'true');
  let hoveredPerson = null;
  const personEls = landscape.entries.map((e) => {
    const p = e.person;
    const el = e.me || !p.url
      ? Object.assign(document.createElement('span'), { textContent: p.name })
      : Object.assign(document.createElement('a'), { textContent: p.name, href: p.url, target: '_blank', rel: 'noopener' });
    if (p.place) el.setAttribute('aria-description', p.place);
    // phones show family names only ("Lloyd", not "Elisabeth A. Lloyd"); the full name stays readable to screen readers
    el.dataset.full = p.name;
    el.dataset.short = e.me ? p.name : p.name.split(' ').pop();
    if (!e.me) el.setAttribute('aria-label', p.name);
    el.className = e.me ? 'esm-person is-me' : 'esm-person';
    if (!e.me) {
      el.addEventListener('mouseenter', () => { hoveredPerson = e; wake(); });
      el.addEventListener('mouseleave', () => { if (hoveredPerson === e) hoveredPerson = null; wake(); });
      el.addEventListener('focus', () => { hoveredPerson = e; wake(); });
      el.addEventListener('blur', () => { if (hoveredPerson === e) hoveredPerson = null; wake(); });
    }
    esmLayer.appendChild(el);
    return { el, entry: e };
  });

  const scroll = createScroll(section);
  const buttons = [...document.querySelectorAll('.stage-control [data-goto]')];
  window.addEventListener('scroll', () => wake(), { passive: true });

  // ───── state ─────
  const state = { progress: 0, turn: 0 };
  let turning = false;
  let chasing = false; // still catching up with the scroll position
  let focused = null;   // a topic id when one layer is brought forward
  let shown = null;     // the work whose card is showing
  let tweening = false;
  let hoverMoving = false;
  let onScreen = true;
  let running = false;
  const clock0 = performance.now();
  const top = new Vector3();

  function placeOverlays(layout) {
    const { p1, p2, p3, reveal } = layout;
    const gridText = 1 - clamp(p3 * 4); // grid labels fade fast as the camera pulls back

    // layer names: beside each column cube at 1D, beside each grid at 3D
    for (const layer of LAYERS) {
      const el = layerLabels[layer];
      const L = layout.layers[layer];
      if (p2 < 0.5) {
        const pos = toScreen(camera, holder, L.size * 0.5, L.y, -L.size * 0.5);
        pos.x += 24;
        pin(el, pos, ((L.local - 0.6) / 0.4) * (1 - p2 * 2), 'left');
        el.classList.remove('at-grid');
      } else {
        const g = grid.layers[layer];
        const s = g.group.scale.x;
        const gy = g.group.position.y;
        const narrow = holder.clientWidth <= 820;
        // The grid's left-most corner on screen (wide screens) or right-most (phones),
        // whichever corner that is after any turn.
        const corners = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => grid.turned(a * grid.width / 2 * s, b * grid.depth / 2 * s));
        const across = (c) => c.x - c.z; // screen left → right
        const corner = corners.reduce((best, c) => (narrow ? across(c) > across(best) : across(c) < across(best)) ? c : best);
        const pos = toScreen(camera, holder, corner.x, gy, corner.z);
        pos.x += narrow ? 10 : -18;
        pos.y -= narrow ? 6 : 20;
        pin(el, pos, ((p2 - 0.5) / 0.5) * (g.dim ?? 1) * gridText, narrow ? 'left' : 'right');
        el.classList.add('at-grid');
      }
      el.classList.toggle('is-focused', focused === layer);
    }

    // axes: years and categories along the front edges of the bottom (or focused) grid
    const axisLayer = focused ?? 'robustness';
    const g = grid.layers[axisLayer];
    const s = g.group.scale.x;
    const y = g.group.position.y;
    const axisOpacity = clamp((reveal - 0.6) / 0.4) * gridText;
    // Each axis goes on whichever of its two edges is at the front after any turn.
    const front = (c) => c.x + c.z;   // towards the viewer
    const across = (c) => c.x - c.z;  // screen left → right
    const offZ = (grid.depth / 2 + CELL * 0.35) * s;
    const offX = (grid.width / 2 + CELL * 0.35) * s;
    const yearSide = front(grid.turned(0, offZ)) > front(grid.turned(0, -offZ)) ? 1 : -1;
    const catSide = front(grid.turned(offX, 0)) > front(grid.turned(-offX, 0)) ? 1 : -1;
    yearEls.forEach((el, i) => {
      const c = grid.turned(grid.cellX(i) * s, yearSide * offZ);
      const anchor = across(c) < across(grid.turned(0, 0)) ? 'right' : 'left';
      pin(el, toScreen(camera, holder, c.x, y, c.z), axisOpacity, anchor);
    });
    catEls.forEach((el, j) => {
      const c = grid.turned(catSide * offX, grid.cellZ(j) * s);
      const anchor = across(c) < across(grid.turned(0, 0)) ? 'right' : 'left';
      pin(el, toScreen(camera, holder, c.x, y, c.z), axisOpacity, anchor);
    });

    // the turn button: centred under the bottom grid, below its axis labels
    {
      const b = grid.layers.robustness;
      const bs = b.group.scale.x;
      const by = b.group.position.y;
      const corners = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
        .map(([u, v]) => grid.turned(u * (grid.width / 2 + CELL) * bs, v * (grid.depth / 2 + CELL) * bs))
        .map((c) => toScreen(camera, holder, c.x, by, c.z));
      const centre = toScreen(camera, holder, 0, by, 0);
      const H = holder.clientHeight;
      const bw = turnButton.offsetWidth || 110;
      const bh = turnButton.offsetHeight || 40;
      const lowest = Math.max(...corners.map((c) => c.y)) + 18;
      const floor = H - bh - (holder.clientWidth <= 820 ? 72 : 20); // clear of the phone stage control
      pin(turnButton, { x: centre.x - bw / 2, y: Math.min(lowest, floor) }, axisOpacity, 'topleft');
    }

    // the card for the work being pointed at
    if (shown && reveal > 0.9 && p3 < 0.05) {
      // beside the cube, flipped to the other side if it would run off screen
      grid.topOf(shown, top);
      const pos = toScreen(camera, holder, top.x, top.y, top.z);
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      const W = holder.clientWidth;
      const H = holder.clientHeight;
      const right = W - (W > 820 ? 210 : 8); // clear of the stage control
      let x = pos.x + 28;
      if (x + cw > right) x = pos.x - 28 - cw;
      x = Math.max(8, Math.min(right - cw, x));
      const y2 = Math.max(8, Math.min(H - ch - 8, pos.y - ch / 2));
      pin(card, { x, y: y2 }, 1, 'topleft');
    } else {
      pin(card, { x: 0, y: 0 }, 0);
    }

    // ESM: field names on their hills, people's names above their cubes.
    // Nothing may overlap: the text column, the field names and each name keep clear of each other.
    const esmText = clamp((layout.people ?? 0) * 1.5);
    const fieldText = clamp(((layout.ground ?? 0) - 0.5) / 0.5);
    const W = holder.clientWidth;
    const wide = W > 820;
    const hb = holder.getBoundingClientRect();
    const boxes = [];
    const pad = 6;
    const clear = (o) => boxes.every((b) => o.x + o.w + pad < b.x || o.x > b.x + b.w + pad || o.y + o.h + pad < b.y || o.y > b.y + b.h + pad);
    let textRight = 0;
    if (wide && (layout.people ?? 0) > 0) {
      const t = thanksText.getBoundingClientRect();
      textRight = t.right - hb.left;
      boxes.push({ x: t.left - hb.left, y: t.top - hb.top, w: t.width, h: t.height });
    }
    // every cube's footprint on screen, so labels don't sit on top of cubes
    if ((layout.people ?? 0) > 0) {
      for (const { entry } of personEls) {
        landscape.topOf(entry, top);
        const t = toScreen(camera, holder, top.x, top.y + LAND_Y, top.z);
        const g = toScreen(camera, holder, entry.x, entry.ground + LAND_Y, entry.z);
        const half = Math.max(18, (g.y - t.y) * 0.75);
        boxes.push({ x: t.x - half, y: t.y, w: half * 2, h: Math.max(10, g.y - t.y + 6) });
      }
    }
    for (const { el, id } of fieldEls) {
      const [fx, fz] = FIELD_CENTERS[id];
      // out toward the edge of each hill, away from the people in the middle
      const pos = toScreen(camera, holder, fx * 1.55, LAND_Y + heightAt(fx * 1.55, fz * 1.55) + 0.4, fz * 1.55);
      const w = el.offsetWidth || 120;
      const h = el.offsetHeight || 20;
      const rightLimit = W - (wide ? 200 : 6); // clear of the stage control
      const leftLimit = wide ? textRight + 24 : 6; // clear of the text column
      let x = Math.max(leftLimit, Math.min(rightLimit - w, pos.x - w / 2));
      let y = pos.y - h;
      // slide down until clear of anything already placed
      // try nearby spots (down, up, sideways) until clear of anything already placed
      const base = { x, y };
      const moves = [[0, 0]];
      for (let r = 1; r <= 6; r++) moves.push([0, r], [0, -r], [r * 1.5, 0], [-r * 1.5, 0]);
      for (const [dx, dy] of moves) {
        const tx = Math.max(leftLimit, Math.min(rightLimit - w, base.x + dx * h));
        const ty = base.y + dy * h * 0.6;
        if (clear({ x: tx, y: ty, w, h })) { x = tx; y = ty; break; }
      }
      boxes.push({ x, y, w, h });
      pin(el, { x, y }, fieldText * 0.9, 'topleft');
    }
    let hoveredBox = null;
    for (const { el, entry } of personEls) {
      const label = wide ? el.dataset.full : el.dataset.short;
      if (el.textContent !== label) el.textContent = label;
      landscape.topOf(entry, top);
      const pos = toScreen(camera, holder, top.x, top.y + LAND_Y, top.z);
      const w = el.offsetWidth || 80;
      const h = el.offsetHeight || 16;
      // above the cube if there's room, else below, else to either side, else higher up
      const options = [
        { x: pos.x - w / 2, y: pos.y - h - 8 },
        { x: pos.x + 32, y: pos.y - h / 2 },
        { x: pos.x - w - 32, y: pos.y - h / 2 },
        { x: pos.x - w / 2, y: pos.y - 2 * h - 12 },
        { x: pos.x - w / 2, y: pos.y + 52 },
        { x: pos.x + 32, y: pos.y + 16 },
        { x: pos.x - w - 32, y: pos.y + 16 },
      ].map((o) => ({ ...o, w, h }));
      const fits = (o) => o.x > 4 && o.x + w < W - 4 && clear(o);
      // if nothing is fully clear, take the spot that overlaps least
      const overlap = (o) => boxes.reduce((sum, bx) => sum
        + Math.max(0, Math.min(o.x + o.w, bx.x + bx.w) - Math.max(o.x, bx.x))
        * Math.max(0, Math.min(o.y + o.h, bx.y + bx.h) - Math.max(o.y, bx.y)), 0);
      const spot = options.find(fits)
        ?? options.filter((o) => o.x > 4 && o.x + w < W - 4).reduce((a, o) => (overlap(o) < overlap(a) ? o : a), options[0]);
      boxes.push(spot);
      pin(el, spot, entry.me ? (layout.me ?? 0) : esmText * 0.95, 'topleft');
      const isHovered = entry === hoveredPerson;
      el.classList.toggle('is-hovered', isHovered);
      if (isHovered) hoveredBox = spot;
    }
    // a faint line with where the hovered person works, just under their name
    const title = hoveredPerson?.person?.place;
    if (wide && title && hoveredBox && esmText > 0.5) {
      if (titleEl.textContent !== title) titleEl.textContent = title;
      const tw = titleEl.offsetWidth;
      const th = titleEl.offsetHeight;
      const x = Math.max(4, Math.min(W - tw - 4, hoveredBox.x + hoveredBox.w / 2 - tw / 2));
      const others = boxes.filter((bx) => bx !== hoveredBox);
      const free = (o) => others.every((bx) => o.x + o.w < bx.x || o.x > bx.x + bx.w || o.y + o.h < bx.y || o.y > bx.y + bx.h);
      const below = { x, y: hoveredBox.y + hoveredBox.h + 3, w: tw, h: th };
      const above = { x, y: hoveredBox.y - th - 3, w: tw, h: th };
      pin(titleEl, free(below) || !free(above) ? below : above, 1, 'topleft');
    } else {
      pin(titleEl, { x: 0, y: 0 }, 0);
    }
  }

  function draw() {
    // ease toward where the scroll position says we should be (smooths out wheel steps)
    const goal = scroll.progress();
    const gap = goal - state.progress;
    state.progress = reducedMotion || Math.abs(gap) < 0.0015 ? goal : state.progress + gap * 0.14;
    chasing = state.progress !== goal;
    const seconds = reducedMotion ? 0 : (performance.now() - clock0) / 1000;
    const p2 = clamp(state.progress - 1);
    const p3 = clamp(state.progress - 2);
    setup.blend(p2, clamp(p3 / 0.35)); // the camera pull-back finishes with the shrink
    grid.setTurn(state.turn);
    const layout = stages.apply(state.progress, seconds, focused);
    hoverMoving = grid.stepHover(shown) | landscape.stepHover(hoveredPerson);
    renderer.render(scene, camera);
    placeOverlays(layout);
    const stage = state.progress < 0.5 ? '0' : state.progress < 1.5 ? '1' : state.progress < 2.5 ? '2' : '3';
    if (section.dataset.stage !== stage) {
      section.dataset.stage = stage;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.goto === stage)));
      if (stage !== '2') { picker.clear(); hideCard(); }
      if (stage < '2') { focused = null; if (state.turn % (Math.PI * 2) !== 0) turnTo(0); }
      picker.setEnabled(stage === '2');
      peoplePicker.setEnabled(stage === '3');
    }
  }

  function needsLoop() {
    const airMoving = state.progress > 0.55 && state.progress < 1.3 && !reducedMotion;
    const focusMoving = Object.entries(grid.layers).some(([id, l]) => {
      const target = focused === null ? 0 : focused === id ? 1 : -1;
      return Math.abs(l.focus - target) > 0.01;
    });
    return onScreen && !document.hidden && (chasing || tweening || turning || airMoving || hoverMoving || focusMoving);
  }

  function loop() {
    draw();
    if (needsLoop()) requestAnimationFrame(loop);
    else running = false;
  }

  function wake() {
    if (!running && needsLoop()) {
      running = true;
      requestAnimationFrame(loop);
    } else if (!running) {
      draw();
    }
  }

  // ───── pointing at cubes ─────
  // The card stays up for a moment after the pointer leaves its cube, and for as long as
  // the pointer is on the card, so its link can be reached.
  let hideTimer = 0;
  let switchTimer = 0;
  let overCard = false;
  function showCard(entry, isPinned) {
    clearTimeout(hideTimer);
    shown = entry;
    const w = entry.work;
    const meta = [w.venue, w.with.length ? `with ${w.with.join(', ')}` : ''].filter(Boolean).join(' · ');
    const also = w.topics.filter((t) => t !== entry.topic).map((t) => data.topics.find((x) => x.id === t)?.label).filter(Boolean);
    card.innerHTML = `<span class="card-kicker">${w.year} · ${esc(w.typeLabel)}${w.featured ? ' · Selected work' : ''}</span>
      <span class="card-title">${esc(w.title)}</span>
      ${meta ? `<span class="card-meta">${esc(meta)}</span>` : ''}
      ${also.length ? `<span class="card-also">Also in ${esc(also.join(', ').toLowerCase())}</span>` : ''}
      ${w.link ? `<a class="card-link" href="${esc(w.link)}" target="_blank" rel="noopener">Open →</a>` : ''}`;
    card.hidden = false;
    card.classList.toggle('is-pinned', isPinned);
    wake();
  }
  function hideCard() {
    clearTimeout(hideTimer);
    clearTimeout(switchTimer);
    shown = null;
    card.hidden = true;
    wake();
  }
  card.addEventListener('pointerenter', () => { overCard = true; clearTimeout(hideTimer); clearTimeout(switchTimer); });
  card.addEventListener('pointerleave', () => {
    overCard = false;
    if (!card.classList.contains('is-pinned')) hideTimer = setTimeout(hideCard, 250);
  });

  const picker = createPicker({
    element: pinned,
    camera,
    targets: grid.pickTargets,
    ignore: '.work-card',
    onChange(entry, isPinned) {
      clearTimeout(switchTimer);
      if (overCard && !isPinned) return;
      if (entry && (!shown || isPinned)) showCard(entry, isPinned);
      // already showing a card: wait a moment before switching, in case the pointer
      // is only crossing other cubes on its way to the card
      else if (entry) { if (entry !== shown) switchTimer = setTimeout(() => { if (!overCard) showCard(entry, false); }, 180); else clearTimeout(hideTimer); }
      else { clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!overCard) hideCard(); }, 400); }
    },
  });

  // pointing at people's cubes: the cube pops taller; clicking opens their page
  const peoplePicker = createPicker({
    element: pinned,
    camera,
    targets: landscape.pickTargets,
    onChange(entry, pinned) {
      hoveredPerson = entry;
      if (entry && pinned) {
        const link = personEls.find((p) => p.entry === entry)?.el;
        if (link?.href) link.click();
        peoplePicker.clear();
      }
      wake();
    },
  });

  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; wake(); }).observe(section);
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('resize', () => { setup.resize(); wake(); });

  // ───── stage control: buttons scroll to their stage; scrolling does the rest ─────
  function goTo(stage) {
    scroll.goTo(Number(stage), !reducedMotion);
    wake();
  }
  buttons.forEach((b) => b.addEventListener('click', () => goTo(b.dataset.goto)));

  // Turn the grid a quarter turn to see it from another side.
  function turnTo(angle) {
    if (reducedMotion) { state.turn = angle; wake(); return; }
    turning = true;
    wake();
    gsap.to(state, {
      turn: angle, duration: 1.1, ease: 'power2.inOut', overwrite: 'auto',
      onComplete: () => { turning = false; wake(); },
    });
  }
  turnButton.addEventListener('click', () => {
    state.turn %= Math.PI * 2; // keep the angle small; a full turn looks the same
    turnTo(state.turn + Math.PI / 2);
    picker.clear(); hideCard();
  });

  // Layer names: at 1D, clicking one goes to the grid with that layer forward;
  // at 3D, clicking toggles which layer is forward.
  section.querySelectorAll('[data-focus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const topic = btn.dataset.focus;
      if (section.dataset.stage !== '2') { focused = topic; goTo('2'); return; }
      focused = focused === topic ? null : topic;
      picker.clear(); hideCard();
      wake();
    });
  });

  setup.resize();
  section.classList.add('is-ready');
  draw();
}

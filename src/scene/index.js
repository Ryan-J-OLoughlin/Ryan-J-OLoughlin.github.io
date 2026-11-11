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

const clamp = (x) => Math.min(1, Math.max(0, x));
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Colors come from the CSS variables, so the palette lives in one place (base.css).
function cssColor(name) {
  return new Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
}

export function start() {
  const section = document.getElementById('scene');
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
  };

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

  const stages = createStages({ cubes, air, grid, colors });

  // ───── web-text overlays ─────
  const layerLabels = Object.fromEntries(
    [...section.querySelectorAll('.scene-label')].map((el) => [el.dataset.topic, el]),
  );
  const axes = section.querySelector('.grid-axes');
  const yearEls = grid.years.map((y) => axes.appendChild(Object.assign(document.createElement('span'), { className: 'axis axis-year', textContent: y })));
  const catEls = data.categories.map((c) => axes.appendChild(Object.assign(document.createElement('span'), { className: 'axis axis-cat', textContent: c.label })));
  const card = section.querySelector('.work-card');

  // ───── state ─────
  const state = { progress: 0, turn: 0 };
  let turning = false;
  let focused = null;   // a topic id when one layer is brought forward
  let shown = null;     // the work whose card is showing
  let tweening = false;
  let hoverMoving = false;
  let onScreen = true;
  let running = false;
  const clock0 = performance.now();
  const top = new Vector3();

  function placeOverlays(layout) {
    const { p1, p2, reveal } = layout;

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
        pin(el, pos, ((p2 - 0.5) / 0.5) * (g.dim ?? 1), narrow ? 'left' : 'right');
        el.classList.add('at-grid');
      }
      el.classList.toggle('is-focused', focused === layer);
    }

    // axes: years and categories along the front edges of the bottom (or focused) grid
    const axisLayer = focused ?? 'robustness';
    const g = grid.layers[axisLayer];
    const s = g.group.scale.x;
    const y = g.group.position.y;
    const axisOpacity = clamp((reveal - 0.6) / 0.4);
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

    // the card for the work being pointed at
    if (shown && reveal > 0.9) {
      // beside the cube, flipped to the other side if it would run off screen
      grid.topOf(shown, top);
      const pos = toScreen(camera, holder, top.x, top.y, top.z);
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      const W = holder.clientWidth;
      const H = holder.clientHeight;
      let x = pos.x + 28;
      if (x + cw > W - 8) x = pos.x - 28 - cw;
      x = Math.max(8, Math.min(W - cw - 8, x));
      const y2 = Math.max(8, Math.min(H - ch - 8, pos.y - ch / 2));
      pin(card, { x, y: y2 }, 1, 'topleft');
    } else {
      pin(card, { x: 0, y: 0 }, 0);
    }
  }

  function draw() {
    const seconds = reducedMotion ? 0 : (performance.now() - clock0) / 1000;
    const p2 = clamp(state.progress - 1);
    setup.blend(p2);
    grid.setTurn(state.turn);
    const layout = stages.apply(state.progress, seconds, focused);
    hoverMoving = grid.stepHover(shown);
    renderer.render(scene, camera);
    placeOverlays(layout);
    const stage = state.progress < 0.5 ? '0' : state.progress < 1.5 ? '1' : '2';
    if (section.dataset.stage !== stage) {
      section.dataset.stage = stage;
      picker.setEnabled(stage === '2');
    }
  }

  function needsLoop() {
    const airMoving = state.progress > 0.55 && state.progress < 1.3 && !reducedMotion;
    const focusMoving = Object.entries(grid.layers).some(([id, l]) => {
      const target = focused === null ? 0 : focused === id ? 1 : -1;
      return Math.abs(l.focus - target) > 0.01;
    });
    return onScreen && !document.hidden && (tweening || turning || airMoving || hoverMoving || focusMoving);
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
  const picker = createPicker({
    element: section,
    camera,
    targets: grid.pickTargets,
    onChange(entry, pinned) {
      shown = entry;
      if (entry) {
        const w = entry.work;
        const meta = [w.venue, w.with.length ? `with ${w.with.join(', ')}` : ''].filter(Boolean).join(' · ');
        card.innerHTML = `<span class="card-kicker">${w.year} · ${esc(w.typeLabel)}</span>
          <span class="card-title">${esc(w.title)}</span>
          ${meta ? `<span class="card-meta">${esc(meta)}</span>` : ''}
          ${w.link ? `<a class="card-link" href="${esc(w.link)}" target="_blank" rel="noopener">Open →</a>` : ''}`;
        card.hidden = false;
        card.classList.toggle('is-pinned', pinned);
      } else {
        card.hidden = true;
      }
      wake();
    },
  });

  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; wake(); }).observe(section);
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('resize', () => { setup.resize(); draw(); });

  // ───── stage control ─────
  const buttons = [...document.querySelectorAll('.stage-control [data-goto]')];

  function goTo(stage) {
    const target = Number(stage);
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.goto === stage)));
    if (target < 2) {
      focused = null;
      picker.clear();
      if (state.turn !== 0) turnTo(0);
    }
    section.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (reducedMotion) { state.progress = target; wake(); return; }
    tweening = true;
    wake();
    gsap.to(state, {
      progress: target,
      duration: 1.6 + 0.5 * Math.abs(target - state.progress),
      ease: 'power2.inOut',
      overwrite: true,
      onComplete: () => { tweening = false; wake(); },
    });
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
  const turnButton = section.querySelector('.turn-button');
  turnButton.addEventListener('click', () => {
    state.turn %= Math.PI * 2; // keep the angle small; a full turn looks the same
    turnTo(state.turn + Math.PI / 2);
    picker.clear();
  });

  // Layer names: at 1D, clicking one goes to the grid with that layer forward;
  // at 3D, clicking toggles which layer is forward.
  section.querySelectorAll('[data-focus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const topic = btn.dataset.focus;
      if (section.dataset.stage !== '2') { focused = topic; goTo('2'); return; }
      focused = focused === topic ? null : topic;
      picker.clear();
      wake();
    });
  });

  setup.resize();
  section.classList.add('is-ready');
  draw();
}

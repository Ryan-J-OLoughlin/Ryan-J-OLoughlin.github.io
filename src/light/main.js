// main.js — Light: the game state and its rules, wired to drawing, input, UI and saving.
//
// The loop: get a cube → place or rotate it → light travels → a dim area lights up →
// points, and sometimes a new cube.
//
// Where later features go:
//   cubes going wrong     cubes.js (each cube's `hit`) + a per-cube health tick in frame()
//   leaked-light finds    beams.js marks leak beams; score() can check them
//   sound                 listen to events.js
//   hero board / code     listen to events.js; the score and seed are in `g` and rng.js

import { trace } from './beams.js';
import { START_SUPPLY } from './cubes.js';
import { render, setupDraw, STEP } from './draw.js';
import { on, emit } from './events.js';
import { setupInput } from './input.js';
import { load, save } from './save.js';
import { hash } from './rng.js';
import { setupTray, showTray, showScore, announceRegion, floatPoints, flyCube, nudge, slot } from './ui.js';
import { cam, project, pan, zoom, centerOn, pickTile } from './view.js';
import { key, unkey, areaKey, regionKey, level, landmark, SOURCE } from './world.js';

const POINTS = { area: 10, robust: 30, landmark: [0, 20, 50, 60] }; // landmark: by kind (tree, house, tower)
const LIT = 0.3;            // brightness at which a tile counts as lit
const REVEAL = 0.22;        // chance that a newly lit area holds a cube
const FREE_EVERY = 75;      // seconds between free cubes

const canvas = document.querySelector('canvas');
const g = {
  cubes: new Map(),         // tile key → { t: type, r: facing, s: seed, born }
  inv: [...START_SUPPLY], sel: 0, score: 0,
  memory: new Map(),        // area key → time it was first lit (lit areas stay faintly visible)
  robust: new Set(), marks: new Set(), regions: [], region: null,
  free: FREE_EVERY,
  light: new Map(), segs: new Map(), hits: new Map(), segT: 0, oldSegs: new Set(), hold: null,
};
let dirty = true;

// ───── saving ─────

const saved = load();
if (saved) {
  for (const [x, y, t, r, s] of saved.cubes) g.cubes.set(key(x, y), { t, r, s });
  Object.assign(g, { inv: saved.inv, sel: saved.sel, score: saved.score, free: saved.free, regions: saved.regions });
  g.memory = new Map(saved.memory.map((k) => [k, 0]));
  g.robust = new Set(saved.robust);
  g.marks = new Set(saved.marks);
  [cam.x, cam.y, cam.z] = saved.cam;
}

let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save({
    cubes: [...g.cubes].map(([k, c]) => [...unkey(k), c.t, c.r, c.s]),
    inv: g.inv, sel: g.sel, score: g.score, free: Math.round(g.free), regions: g.regions,
    memory: [...g.memory.keys()], robust: [...g.robust], marks: [...g.marks],
    cam: [+cam.x.toFixed(2), +cam.y.toFixed(2), Math.round(cam.z)],
  }), 300);
}
addEventListener('pagehide', () => { persist(); clearTimeout(saveTimer); saveTimer = 0; });

// ───── light and scoring ─────

const shown = (t, now) => t.from + (t.l - t.from) * Math.min(1, Math.max(0, (now - t.t0) / 260));

// Retrace all light. New light travels out from where it changed; old light stays put.
function relight(animate = true, delay = 0) {
  const now = performance.now(), start = now + delay;
  const prev = g.light, { light, segs, hits } = trace(g.cubes);
  const old = new Set();
  for (const [k, list] of g.segs) for (const s of list) old.add(`${k}:${s.d}:${s.bit}`);
  let first = Infinity;
  for (const [k, list] of segs) for (const s of list) {
    if (!animate) old.add(`${k}:${s.d}:${s.bit}`);
    else if (!old.has(`${k}:${s.d}:${s.bit}`)) first = Math.min(first, s.a);
  }
  g.segT = start - (first === Infinity ? 0 : first) * STEP;
  for (const [k, t] of light) {
    const p = prev.get(k);
    if (!animate) { t.from = t.l; t.t0 = 0; }
    else if (p && Math.abs(p.l - t.l) < 0.02) { t.from = p.from; t.t0 = p.t0; }
    else { t.from = p ? shown(p, now) : 0; t.t0 = Math.max(start, g.segT + t.a * STEP); }
  }
  for (const [k, p] of prev) { // light that went out fades away
    if (!light.has(k) && animate) {
      const v = shown(p, now);
      if (v > 0.01) light.set(k, { l: 0, bits: 0, a: 0, from: v, t0: now });
    }
  }
  Object.assign(g, { light, segs, hits, oldSegs: old });
  dirty = true;
  score();
}

const bitsCount = (b) => (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) + ((b >> 3) & 1);
const screenOf = (x, y) => project(x + 0.5, y + 0.5, level(x, y));

function gain(points, x, y, at, kind) {
  if (quiet) return;
  g.score += points;
  const delay = Math.max(0, at - performance.now());
  const [sx, sy] = screenOf(x, y);
  floatPoints(points, sx, sy, delay, kind);
  setTimeout(() => showScore(g.score, true), delay);
  emit(kind || 'area', { x, y, points });
}

// The first light, before any cube, is free: it scores nothing.
let quiet = false;
function score() {
  const areas = new Map();
  for (const [k, t] of g.light) {
    if (t.l < LIT) continue;
    const [x, y] = unkey(k), ak = areaKey(x, y);
    let A = areas.get(ak);
    if (!A) areas.set(ak, (A = { bits: 0, a: t.a, x, y, t0: t.t0 }));
    A.bits |= t.bits;
    if (t.a < A.a) Object.assign(A, { a: t.a, x, y, t0: t.t0 });
    if (landmark(x, y) && !g.marks.has(k)) {
      g.marks.add(k);
      gain(POINTS.landmark[landmark(x, y)], x, y, t.t0, 'landmark');
    }
  }
  for (const [ak, A] of areas) {
    if (!g.memory.has(ak)) {
      g.memory.set(ak, A.t0);
      gain(POINTS.area, A.x, A.y, A.t0);
      const [ax, ay] = unkey(ak);
      if (!quiet && hash(ax, ay, 11) < REVEAL) {
        const r = hash(ax, ay, 12), t = r < 0.36 ? 0 : r < 0.6 ? 1 : r < 0.8 ? 2 : 3;
        give(t, ...screenOf(A.x, A.y), Math.max(0, A.t0 - performance.now()) + 250);
      }
    }
    if (!g.robust.has(ak) && bitsCount(A.bits) >= 2) {
      g.robust.add(ak);
      gain(POINTS.robust, A.x, A.y, A.t0, 'robust');
    }
  }
  persist();
}

// A new cube: flies to the tray, counts once it lands (but is saved straight away).
function give(t, x, y, delay) {
  g.inv[t]++;
  persist();
  emit('cube', { t });
  flyCube(t, x, y, delay, () => refreshTray());
}

const refreshTray = () => {
  // The count shown waits for flying cubes, so read it from the state when they land.
  showTray(g.inv, g.sel);
  document.querySelector('.tray').classList.toggle('hint', g.cubes.size === 0);
};

// ───── what a tap or a hold means ─────

// The cube under a screen point (its body stands above its tile), else the tile under it.
function pickAt(px, py) {
  let best = null, depth = -Infinity;
  for (const [k] of g.cubes) {
    const [x, y] = unkey(k), [cx, cy] = screenOf(x, y), z = cam.z;
    if (Math.abs(px - cx) < z * 0.3 && py > cy - z * 0.52 && py < cy + z * 0.16 && x + y > depth) {
      best = [x, y]; depth = x + y;
    }
  }
  return best || pickTile(px, py);
}

// A new cube faces the way the light on its tile is already going, or away from the source.
function facing(x, y) {
  let best = null;
  for (const s of g.segs.get(key(x, y)) || []) if (s.in && (!best || s.w > best.w)) best = s;
  if (best) return (best.d + 2) % 4;
  const dx = x - SOURCE.x, dy = y - SOURCE.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : (dy >= 0 ? 1 : 3);
}

function tap(px, py) {
  const hit = pickAt(px, py);
  if (!hit) return;
  const [x, y] = hit, k = key(x, y), c = g.cubes.get(k);
  if (c) {
    c.r = (c.r + 1) % 4;
    c.s += 2; // a turned frosted cube leaks somewhere new
    emit('rotate', { x, y, t: c.t, r: c.r });
  } else {
    if ((x === SOURCE.x && y === SOURCE.y) || landmark(x, y)) return;
    if (!g.inv[g.sel]) return nudge(slot(g.sel), 'shake');
    g.inv[g.sel]--;
    g.cubes.set(k, { t: g.sel, r: facing(x, y), s: Math.floor(Math.random() * 1e6), born: performance.now() });
    emit('place', { x, y, t: g.sel });
    if (!g.inv[g.sel]) {
      const next = g.inv.findIndex((n) => n > 0);
      if (next >= 0) g.sel = next;
    }
  }
  refreshTray();
  relight();
}

function hold(px, py) {
  const hit = pickAt(px, py);
  const k = hit && key(...hit), c = k && g.cubes.get(k);
  if (!c) return;
  g.cubes.delete(k);
  navigator.vibrate?.(12);
  emit('pickup', { x: hit[0], y: hit[1], t: c.t });
  refreshTray();
  give(c.t, ...screenOf(...hit), 0);
  relight();
}

// ───── regions ─────

function checkRegion(announceAlways) {
  const rk = regionKey(Math.floor(cam.x), Math.floor(cam.y));
  if (rk === g.region) return;
  g.region = rk;
  let n = g.regions.indexOf(rk);
  if (n < 0) {
    n = g.regions.push(rk) - 1;
    emit('region', { n: n + 1 });
    announceRegion(n + 1);
    persist();
  } else if (announceAlways) announceRegion(n + 1);
}

// ───── setup and the frame loop ─────

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  cam.W = innerWidth; cam.H = innerHeight;
  canvas.width = Math.round(cam.W * dpr);
  canvas.height = Math.round(cam.H * dpr);
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  dirty = true;
}

setupDraw(canvas);
resize();
addEventListener('resize', resize);
if (!saved) {
  cam.z = Math.min(72, Math.max(44, Math.min(cam.W, cam.H) / 7.5));
  centerOn(SOURCE.x, SOURCE.y);
}

setupTray((t) => { g.sel = t; refreshTray(); persist(); });
refreshTray();
showScore(g.score);

setupInput(canvas, {
  tap, hold,
  holding: (p) => { g.hold = p && g.cubes.has(key(...(pickAt(p.x, p.y) || [1e4, 1e4]))) ? p : null; dirty = true; },
  pan: (dx, dy) => { pan(dx, dy); dirty = true; },
  zoom: (f, x, y) => { zoom(f, x, y); dirty = true; },
  end: () => { checkRegion(); persist(); },
});

document.querySelector('.center').addEventListener('click', () => {
  centerOn(SOURCE.x, SOURCE.y);
  dirty = true;
  checkRegion();
  persist();
});

on('place', () => document.querySelector('.tray').classList.remove('hint'));

quiet = true;
relight(!saved, 500); // first visit: let the page settle, then the light goes out
quiet = false;
checkRegion(true);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (!document.hidden) {
    g.free -= dt;
    if (g.free <= 0) {
      g.free = FREE_EVERY;
      const score = document.querySelector('.score').getBoundingClientRect();
      give(Math.floor(Math.random() * 4), score.left + score.width / 2, score.bottom + 20, 0);
    }
  }
  if (dirty) dirty = render(g, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);


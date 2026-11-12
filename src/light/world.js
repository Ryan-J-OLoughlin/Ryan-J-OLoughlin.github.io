// world.js — the endless landscape: terraces, hill shading, landmarks, areas and regions.
//
// Everything is computed from the seed on demand and cached in 16×16 chunks, so the map
// never ends and never needs storing. Height is visual only in version 1: light ignores it.

import { hash, noise } from './rng.js';

export const MAX_LEVEL = 7;  // 0 = water, 1–7 = terraces
export const AREA = 4;       // tiles per side of a scoring area
export const REGION = 24;    // tiles per side of a region
export const SOURCE = { x: 0, y: 0 }; // the first light

// Landmark kinds stored per tile
export const TREE = 1, HOUSE = 2, TOWER = 3;

// One number per grid point, used as a Map/Set key (safe for |x|, |y| < 32768).
export const key = (x, y) => (x + 32768) * 65536 + (y + 32768);
export const unkey = (k) => [Math.floor(k / 65536) - 32768, (k % 65536) - 32768];
export const areaKey = (x, y) => key(Math.floor(x / AREA), Math.floor(y / AREA));
// Regions are offset by half so the first light sits in the middle of Region 1.
export const regionKey = (x, y) => key(Math.floor((x + REGION / 2) / REGION), Math.floor((y + REGION / 2) / REGION));

function height(x, y) {
  return noise(x / 23, y / 23, 1) * 0.6 + noise(x / 9, y / 9, 2) * 0.28 + noise(x / 4, y / 4, 3) * 0.12
    + 0.16 * Math.exp(-(x * x + y * y) / 70); // a gentle rise around the first light
}

const CHUNK = 16;
const cache = new Map();

function build(cx, cy) {
  const n = CHUNK * CHUNK;
  const lv = new Int8Array(n), sh = new Float32Array(n), mk = new Uint8Array(n);
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
    const x = cx * CHUNK + i, y = cy * CHUNK + j, k = j * CHUNK + i;
    const l = Math.max(0, Math.min(MAX_LEVEL, Math.floor((height(x, y) - 0.24) * 13)));
    lv[k] = l;
    // Hill shading: lit from the back of the map (the top of the screen).
    sh[k] = Math.max(-1, Math.min(1, (height(x - 1, y) + height(x, y - 1) - height(x + 1, y) - height(x, y + 1)) * 6));
    if (l > 0 && x * x + y * y > 9) {
      const r = hash(x, y, 7);
      if (noise(x / 7, y / 7, 9) > 0.72 && r < 0.22) mk[k] = TREE; // groves
      else if (r < 0.005) mk[k] = HOUSE;
      else if (r < 0.0075) mk[k] = TOWER;
      else if (r < 0.011) mk[k] = TREE;
    }
  }
  return { lv, sh, mk };
}

let idx = 0;
function at(x, y) {
  const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK), k = key(cx, cy);
  let c = cache.get(k);
  if (!c) {
    if (cache.size > 600) cache.clear();
    cache.set(k, (c = build(cx, cy)));
  }
  idx = (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK);
  return c;
}

export const level = (x, y) => at(x, y).lv[idx];
export const shade = (x, y) => at(x, y).sh[idx];
export const landmark = (x, y) => at(x, y).mk[idx];

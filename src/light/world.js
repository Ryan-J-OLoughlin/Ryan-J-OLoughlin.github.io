// world.js — the endless landscape: rolling hills, field colors, landmarks, areas and regions.
//
// Like the homepage's ESM landscape: one smooth, curving surface whose colors blend
// between the site's field colors (green, ocean, sand, earth), washed toward map paper.
// Everything is computed from the seed on demand and cached in 16×16 chunks, so the map
// never ends and never needs storing. Height is visual only in version 1: light ignores it.

import { hash, noise } from './rng.js';

export const AREA = 4;       // tiles per side of a scoring area
export const REGION = 24;    // tiles per side of a region
export const SOURCE = { x: 0, y: 0 }; // the first light
export const MAX_H = 4.1;    // highest ground, in tile widths (for working out what's on screen)

// Landmark kinds stored per tile
export const TREE = 1, HOUSE = 2, TOWER = 3;

// One number per grid point, used as a Map/Set key (safe for |x|, |y| < 32768).
export const key = (x, y) => (x + 32768) * 65536 + (y + 32768);
export const unkey = (k) => [Math.floor(k / 65536) - 32768, (k % 65536) - 32768];
export const areaKey = (x, y) => key(Math.floor(x / AREA), Math.floor(y / AREA));
// Regions are offset by half so the first light sits in the middle of Region 1.
export const regionKey = (x, y) => key(Math.floor((x + REGION / 2) / REGION), Math.floor((y + REGION / 2) / REGION));

// Ground height at a grid corner: broad hills, smaller ripples, a rise under the first light.
function height(x, y) {
  return noise(x / 24, y / 24, 1) * 2 + noise(x / 10, y / 10, 2) * 1.3 + noise(x / 5, y / 5, 3) * 0.25
    + 0.5 * Math.exp(-(x * x + y * y) / 40);
}

// How much of each field color a tile carries: four slow, overlapping patches.
function fieldWeights(x, y) {
  return [0, 1, 2, 3].map((i) => noise(x / 19 + i * 7.3, y / 19 - i * 3.1, 20 + i) ** 3 + 0.002);
}

const CHUNK = 16;
const cache = new Map();

function build(cx, cy) {
  const n = CHUNK * CHUNK, E = CHUNK + 1;
  const h = new Float32Array(E * E), w = new Float32Array(n * 4), mk = new Uint8Array(n);
  for (let j = 0; j < E; j++) for (let i = 0; i < E; i++) h[j * E + i] = height(cx * CHUNK + i, cy * CHUNK + j);
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
    const x = cx * CHUNK + i, y = cy * CHUNK + j, k = j * CHUNK + i;
    w.set(fieldWeights(x + 0.5, y + 0.5), k * 4);
    if (x * x + y * y > 9) {
      const r = hash(x, y, 7);
      if (noise(x / 7, y / 7, 9) > 0.74 && r < 0.2) mk[k] = TREE; // groves
      else if (r < 0.0035) mk[k] = HOUSE;
      else if (r < 0.0045) mk[k] = TOWER;
      else if (r < 0.008) mk[k] = TREE;
    }
  }
  return { h, w, mk };
}

function chunk(cx, cy) {
  const k = key(cx, cy);
  let c = cache.get(k);
  if (!c) {
    if (cache.size > 600) cache.clear();
    cache.set(k, (c = build(cx, cy)));
  }
  return c;
}

// Height of grid corner (x, y).
export function corner(x, y) {
  const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
  return chunk(cx, cy).h[(y - cy * CHUNK) * (CHUNK + 1) + (x - cx * CHUNK)];
}

let idx = 0;
function at(x, y) {
  const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
  idx = (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK);
  return chunk(cx, cy);
}

// Height at the middle of tile (x, y): where things stand.
export const tileH = (x, y) => (corner(x, y) + corner(x + 1, y) + corner(x + 1, y + 1) + corner(x, y + 1)) / 4;
export const landmark = (x, y) => at(x, y).mk[idx];
// The four field-color weights of tile (x, y), written into `out`.
export function weights(x, y, out) {
  const c = at(x, y);
  for (let i = 0; i < 4; i++) out[i] = c.w[idx * 4 + i];
  return out;
}

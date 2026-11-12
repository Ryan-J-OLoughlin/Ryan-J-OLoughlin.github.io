// cubes.js — the four flawed glass cubes. Each is good at one thing and bad at another.
//
// A cube faces one of four directions (r). When a beam reaches it, `hit` decides what
// leaves it, through `out` (start a beam) and `glow` (light the tiles around a point).
// Each beam remembers the kind of the last cube it passed through (its bit), so an area
// lit through two different kinds counts as robust.
//
// Later (not in version 1): cubes going wrong. Each placed cube already carries a seed
// (`s`); a `health` value and a `drift` step in `hit` are where flicker and failure go.

import { hash } from './rng.js';

export const CLEAR = 0, AMBER = 1, BLUE = 2, FROSTED = 3;
export const BIT = [1, 2, 4, 8];   // kind bits, one per cube type
export const SRC_BIT = 16;         // light straight from a source
export const START_SUPPLY = [2, 1, 1, 1];
export const NAMES = ['Clear cube', 'Amber cube', 'Blue cube', 'Frosted cube']; // for screen readers only

export const TYPES = [
  { // Clear: accurate direction, but weak: light barely grows.
    hit(c, b, out) { out(b.x, b.y, c.r, Math.min(1, b.w * 1.1), BIT[CLEAR], b.a); },
  },
  { // Amber: amplifies light, but bends the beam off course (one tile sideways every 4).
    hit(c, b, out) { out(b.x, b.y, c.r, Math.min(1.3, b.w * 1.5 + 0.12), BIT[AMBER], b.a, { drift: true }); },
  },
  { // Blue: splits one beam into two, each weaker.
    hit(c, b, out) {
      out(b.x, b.y, c.r, b.w * 0.62, BIT[BLUE], b.a);
      out(b.x, b.y, (c.r + 1) % 4, b.w * 0.62, BIT[BLUE], b.a);
    },
  },
  { // Frosted: lights a wide area around it, but leaks light in random directions.
    hit(c, b, out, glow) {
      glow(b.x, b.y, 2, b.w * 0.9, BIT[FROSTED], b.a);
      out(b.x, b.y, c.r, b.w * 0.5, BIT[FROSTED], b.a);
      for (let i = 0; i < 2; i++) {
        const d = Math.floor(hash(b.x, b.y, c.s + i) * 4);
        // Leaks are marked so a later version can let them discover hidden areas.
        if (d !== c.r) out(b.x, b.y, d, b.w * 0.3, BIT[FROSTED], b.a, { life: 3, leak: true });
      }
    },
  },
];

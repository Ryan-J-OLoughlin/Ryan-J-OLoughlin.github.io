// beams.js — traces light across the grid.
//
// Light leaves the source in four straight lines, moves one tile at a time, fades with
// distance and bends only at cubes. The result is everything the renderer and the
// scoring need:
//   light: tile key → { l: brightness, bits: kinds of beam that reached it, a: arrival step }
//   segs:  tile key → half-beams drawn on that tile { d: edge, w, bit, a, in }
//   hits:  tile key → strongest beam that reached the cube on that tile

import { key, SOURCE } from './world.js';
import { TYPES, SRC_BIT } from './cubes.js';

export const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // directions, clockwise on screen
export const DECAY = 0.88;  // light kept per tile travelled
const MIN = 0.06;           // dimmer than this, a beam stops
const SPILL = 0.35;         // share of a beam that lights the tiles beside it

export function trace(cubes) {
  const light = new Map(), segs = new Map(), hits = new Map(), seen = new Set(), queue = [];

  const add = (x, y, w, bit, a) => {
    const k = key(x, y);
    let t = light.get(k);
    if (!t) light.set(k, (t = { l: 0, bits: 0, a }));
    t.l = Math.min(1.5, t.l + w);
    if (w > 0.1) t.bits |= bit;
    if (a < t.a) t.a = a;
  };
  const seg = (x, y, d, w, bit, a, inward) => {
    const k = key(x, y);
    let s = segs.get(k);
    if (!s) segs.set(k, (s = []));
    s.push({ d, w, bit, a, in: inward });
  };
  const glow = (x, y, r, w, bit, a) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const dist = Math.hypot(i, j);
      if (dist <= r + 0.5) add(x + i, y + j, w * (1 - dist / (r + 1.5)), bit, a + dist);
    }
  };
  const out = (x, y, d, w, bit, a, o = {}) => {
    if (w >= MIN) queue.push({ x, y, d, w, bit, a, life: 40, ...o });
  };

  glow(SOURCE.x, SOURCE.y, 2, 0.9, SRC_BIT, 0);
  for (let d = 0; d < 4; d++) out(SOURCE.x, SOURCE.y, d, 1, SRC_BIT, 0);

  let guard = 0;
  while (queue.length && guard++ < 600) {
    let { x, y, d, w, bit, a, life, drift } = queue.shift();
    for (let n = 1; n <= life; n++) {
      const m = drift && n % 4 === 0 ? (d + 1) % 4 : d; // amber's sideways step
      seg(x, y, m, w, bit, a, false);
      x += DX[m]; y += DY[m]; w *= DECAY; a++;
      seg(x, y, (m + 2) % 4, w, bit, a, true);
      if (w < MIN) break;
      add(x, y, w, bit, a);
      const side = (m + 1) % 4;
      add(x + DX[side], y + DY[side], w * SPILL, bit, a);
      add(x - DX[side], y - DY[side], w * SPILL, bit, a);
      if (x === SOURCE.x && y === SOURCE.y) break; // the source swallows light
      const k = key(x, y), c = cubes.get(k);
      if (c) {
        hits.set(k, Math.max(hits.get(k) || 0, w));
        const sk = k * 4 + m;
        if (!seen.has(sk)) { // each cube passes light once per incoming direction: no endless loops
          seen.add(sk);
          TYPES[c.t].hit(c, { x, y, w, a }, out, glow);
        }
        break;
      }
    }
  }
  return { light, segs, hits };
}

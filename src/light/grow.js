// Land's rule: ground that light rests on for a few seconds grows, and stays grown.
// Growth is kept per cell (saved) and painted into a canvas that follows the memory window;
// the ground shader reads it as a sage tint, so a lit route leaves a green trail behind.
import * as THREE from "three";

export const GROW_TIME = 3; // seconds of light a cell needs
const GROW_ANIM = 1.4; // seconds a new patch takes to spread
const MIN_S = 0.25; // weakest beam that still grows soil (a crack's leak of a full beam is 0.3)

export function createGrowth(RS, RW) {
  const cv = Object.assign(document.createElement("canvas"), {
      width: RS,
      height: RS,
    }),
    g = cv.getContext("2d"),
    tex = new THREE.CanvasTexture(cv),
    lit = new Map(), // cell -> seconds lit so far
    grown = new Map(), // cell -> time it grew
    fresh = new Set(), // cells still animating
    sc = RS / RW,
    key = (x, z) => x + "," + z;
  tex.flipY = false;
  let O = [0, 0];

  function dab(k, a) {
    const [x, z] = k.split(",").map(Number),
      px = (x + 0.5 - O[0]) * sc,
      pz = (z + 0.5 - O[1]) * sc,
      r = sc * (0.55 + 0.45 * a);
    if (px < -r || pz < -r || px > RS + r || pz > RS + r) return;
    const gr = g.createRadialGradient(px, pz, 0, px, pz, r);
    gr.addColorStop(0, `rgba(255,255,255,${0.95 * a})`);
    gr.addColorStop(0.6, `rgba(255,255,255,${0.7 * a})`);
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(px - r, pz - r, 2 * r, 2 * r);
  }
  function repaint(origin) {
    O = origin;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#000";
    g.fillRect(0, 0, RS, RS);
    g.globalCompositeOperation = "lighten";
    for (const k of grown.keys()) if (!fresh.has(k)) dab(k, 1);
    tex.needsUpdate = true;
  }
  repaint(O);

  return {
    tex,
    grown,
    // cells: an iterable of 'x,z' keys that are lit this tick; dt: seconds since the last feed
    feed(cells, dt, now) {
      for (const k of cells) {
        if (grown.has(k)) continue;
        const s = (lit.get(k) || 0) + dt;
        if (s >= GROW_TIME) {
          lit.delete(k);
          grown.set(k, now);
          fresh.add(k);
        } else lit.set(k, s);
      }
    },
    tick(now) {
      if (!fresh.size) return;
      g.globalCompositeOperation = "lighten";
      for (const k of fresh) {
        const a = Math.max(0, Math.min(1, (now - grown.get(k)) / GROW_ANIM));
        dab(k, a * a * (3 - 2 * a));
        if (a >= 1) fresh.delete(k);
      }
      tex.needsUpdate = true;
    },
    repaint,
    // Grow a cell at a given (possibly future) time, animated.
    growAt(k, at) {
      if (grown.has(k)) return;
      lit.delete(k);
      grown.set(k, at);
      fresh.add(k);
    },
    // Grow at once, with no animation (restoring a save, staging a study).
    plant(cells) {
      for (const k of cells) grown.set(k, -1e9);
      repaint(O);
    },
    // Cells a beam lights, from its traced points (x, z, distance).
    beamCells(b, reach, out) {
      if (b.pv || b.s < MIN_S) return;
      for (const [x, z, d] of b.pts) {
        if (d > reach) break;
        out.add(key(Math.floor(x), Math.floor(z)));
      }
    },
    // A diffuser's pool grows a 3×3 garden.
    poolCells(p, out) {
      if (!p.diff) return;
      const cx = Math.floor(p.x),
        cz = Math.floor(p.z);
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) out.add(key(cx + i, cz + j));
    },
    save: () => [...grown.keys()],
    restore(list) {
      if (Array.isArray(list)) this.plant(list);
    },
  };
}

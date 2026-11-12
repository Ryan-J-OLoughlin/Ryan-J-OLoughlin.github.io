// draw.js — paints one frame on the 2D canvas, back to front.
//
// For each tile: the terrace top (hill-shaded), its cliff faces, contour lines at each
// step, the beams crossing it, then whatever stands on it (landmark, cube, the source).
// Darkness is a soft dusk tint: every color is mixed from the dusk color toward its real
// color by how lit the tile is, so light reveals the map underneath.

import { cam, LIFT, visibleBounds } from './view.js';
import { level, shade, landmark, key, areaKey, AREA, SOURCE, TREE, HOUSE, TOWER } from './world.js';

export const STEP = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 42; // ms per tile of travel
const DIM = 0.22;  // how much of the map shows in full darkness
const MEMORY = 0.45; // how lit an area stays once it has been lit

let ctx, P;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Colors come from the CSS variables (tokens.css and light.css), like the homepage scene.
function palette() {
  const s = getComputedStyle(document.documentElement);
  const c = (n, d) => hex(s.getPropertyValue(n).trim() || d);
  const ground = c('--ground', '#EEF0EA'), ink = c('--ink', '#1C2024'), ocean = c('--ocean', '#2F6482');
  const green = c('--green', '#5F8A5B'), earth = c('--earth', '#9A6B45'), sand = c('--sand', '#A8925A');
  const amber = c('--amber', '#D4893A'), frost = c('--frost', '#F3F3EF'), glass = c('--glass', '#CFE0E4');
  return {
    dusk: c('--dusk', '#2A323D'), ink, soft: c('--ink-soft', '#4D535A'), ground,
    levels: [mix(ground, ocean, 0.34), mix(ground, green, 0.2), mix(ground, green, 0.3), mix(ground, green, 0.4),
      mix(ground, sand, 0.34), mix(ground, sand, 0.46), mix(ground, earth, 0.4), mix(ground, earth, 0.52)],
    tree: mix(green, ink, 0.2), roof: earth, wall: mix(ground, sand, 0.12), warm: [255, 214, 140],
    tint: [glass, amber, ocean, frost],
    // beam colors by kind bit: clear, amber, blue, frosted, source
    beam: [[255, 253, 244], [255, 196, 112], [150, 205, 255], [236, 238, 246], [255, 243, 212]],
  };
}

// A color mixed from dusk toward c by v, times brightness m, as a CSS string.
function col(c, v, m = 1, a = 1) {
  const d = P.dusk;
  return `rgba(${d[0] + (c[0] * m - d[0]) * v | 0},${d[1] + (c[1] * m - d[1]) * v | 0},${d[2] + (c[2] * m - d[2]) * v | 0},${a})`;
}

export function setupDraw(canvas) {
  ctx = canvas.getContext('2d');
  P = palette();
  document.documentElement.style.background = col(P.dusk, 0);
}

function poly(pts, fill) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function line(x0, y0, x1, y1) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }

// A solid box standing on the point (cx, cy): side a (tiles), height hgt (px). Returns its top centre.
function box(cx, cy, a, hgt, v, wall, top) {
  const w = a * cam.z / 2, q = a * cam.z / 4;
  poly([cx - w, cy, cx, cy + q, cx, cy + q - hgt, cx - w, cy - hgt], col(wall, v, 0.78));
  poly([cx, cy + q, cx + w, cy, cx + w, cy - hgt, cx, cy + q - hgt], col(wall, v, 0.9));
  if (top) poly([cx, cy - q - hgt, cx + w, cy - hgt, cx, cy + q - hgt, cx - w, cy - hgt], col(top, v));
  return [cx, cy - hgt];
}

function drawLandmark(kind, cx, cy, v, lit) {
  const z = cam.z;
  if (kind === TREE) {
    ctx.strokeStyle = col(P.soft, v);
    ctx.lineWidth = Math.max(1, z / 30);
    ctx.beginPath(); line(cx, cy, cx, cy - z * 0.2); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy - z * 0.32, z * 0.17, z * 0.21, 0, 0, 7);
    ctx.fillStyle = col(P.tree, v);
    ctx.fill();
  } else if (kind === HOUSE) {
    const w = 0.44 * z / 2, q = 0.44 * z / 4;
    const [tx, ty] = box(cx, cy, 0.44, z * 0.2, v, P.wall);
    const apex = ty - z * 0.2;
    poly([tx - w, ty, tx, ty + q, tx, apex], col(P.roof, v, 0.8));
    poly([tx, ty + q, tx + w, ty, tx, apex], col(P.roof, v));
    poly([tx - w, ty, tx, ty - q, tx, apex], col(P.roof, v, 1.1));
    if (lit) poly([tx + w * 0.35, ty + q * 0.1 + z * 0.05, tx + w * 0.7, ty - q * 0.25 + z * 0.05, tx + w * 0.7, ty - q * 0.25 + z * 0.11, tx + w * 0.35, ty + q * 0.1 + z * 0.11], col(P.warm, 1));
  } else if (kind === TOWER) {
    const [tx, ty] = box(cx, cy, 0.3, z * 0.85, v, P.wall, P.wall);
    const w = 0.3 * z / 2, q = 0.3 * z / 4;
    poly([tx - w, ty, tx, ty + q, tx + w, ty, tx, ty - z * 0.18], col(P.soft, v));
    if (lit) {
      ctx.beginPath();
      ctx.arc(tx, ty - z * 0.24, z * 0.05, 0, 7);
      ctx.fillStyle = col(P.warm, 1);
      ctx.fill();
    }
  }
}

// A tinted glass cube, drawn like the homepage's: faint hidden edges, see-through faces, crisp front edges.
export function drawCube(t, r, cx, cy, v, lit, scale = 1) {
  const z = cam.z * scale, a = 0.56;
  const w = a * z / 2, q = a * z / 4, hgt = a * z * 0.62;
  const tint = P.tint[t], k = t === 3 ? 0.8 : t === 0 ? 0.45 : 0.62;
  const edge = col(mix(P.ground, P.ink, v), 1, 1, 0.8);
  const Ty = cy - hgt;
  ctx.lineWidth = Math.max(1, z / 56);
  ctx.lineJoin = 'round';
  // hidden edges
  ctx.strokeStyle = col(mix(P.ground, P.ink, v), 1, 1, 0.18);
  ctx.beginPath();
  line(cx, cy - q, cx, Ty - q); line(cx, cy - q, cx - w, cy); line(cx, cy - q, cx + w, cy);
  ctx.stroke();
  // faces
  const lv = 0.55 + 0.45 * v;
  poly([cx - w, cy, cx, cy + q, cx, Ty + q, cx - w, Ty], col(tint, lv, 0.82, 0.55 * k + 0.2));
  poly([cx, cy + q, cx + w, cy, cx + w, Ty, cx, Ty + q], col(tint, lv, 0.95, 0.45 * k + 0.15));
  poly([cx, Ty - q, cx + w, Ty, cx, Ty + q, cx - w, Ty], col(tint, lv, 1.08, 0.3 * k + 0.12));
  if (lit > 0) {
    ctx.globalCompositeOperation = 'lighter';
    poly([cx, Ty - q, cx + w, Ty, cx, Ty + q, cx - w, Ty], `rgba(255,236,200,${0.35 * Math.min(1, lit)})`);
    poly([cx - w, cy, cx, cy + q, cx + w, cy, cx + w, Ty, cx, Ty + q, cx - w, Ty], `rgba(255,236,200,${0.12 * Math.min(1, lit)})`);
    ctx.globalCompositeOperation = 'source-over';
  }
  // front edges
  ctx.strokeStyle = edge;
  ctx.beginPath();
  ctx.moveTo(cx, Ty - q); ctx.lineTo(cx + w, Ty); ctx.lineTo(cx, Ty + q); ctx.lineTo(cx - w, Ty); ctx.closePath();
  line(cx - w, Ty, cx - w, cy); line(cx, Ty + q, cx, cy + q); line(cx + w, Ty, cx + w, cy);
  line(cx - w, cy, cx, cy + q); line(cx, cy + q, cx + w, cy);
  ctx.stroke();
  // which way it faces (a blue cube faces two ways)
  if (r < 0) return;
  const dirs = t === 2 ? [r, (r + 1) % 4] : [r];
  ctx.beginPath();
  for (const d of dirs) {
    const [ex, ey] = EDGE[d];
    const mx = cx + ex * a * z, my = Ty + (ey - 0.25) * a * z; // edge midpoint on the top face
    line(cx, Ty, mx * 0.8 + cx * 0.2, my * 0.8 + Ty * 0.2);
  }
  ctx.lineWidth = Math.max(2, z / 16);
  ctx.lineCap = 'round';
  ctx.strokeStyle = t === 3 || t === 0 ? col(P.ink, 1, 1, 0.75) : 'rgba(255,250,238,0.9)';
  ctx.stroke();
  ctx.lineCap = 'butt';
}

// Edge midpoints of a tile, relative to its top corner, in tile widths: +x, +y, −x, −y.
const EDGE = [[0.25, 0.375], [-0.25, 0.375], [-0.25, 0.125], [0.25, 0.125]];
const NX = [1, 0, -1, 0], NY = [0, 1, 0, -1];

function drawSource(cx, cy) {
  const z = cam.z;
  box(cx, cy, 0.34, z * 0.18, 1, P.soft, P.ground);
  const oy = cy - z * 0.48;
  const g = ctx.createRadialGradient(cx, oy, 0, cx, oy, z * 1.1);
  g.addColorStop(0, 'rgba(255,240,200,0.75)');
  g.addColorStop(0.25, 'rgba(255,225,160,0.25)');
  g.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(cx - z * 1.2, oy - z * 1.2, z * 2.4, z * 2.4);
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.arc(cx, oy, z * 0.11, 0, 7);
  ctx.fillStyle = '#FFF8E8';
  ctx.fill();
}

// Draws everything. `g` is the game: { light, segs, hits, segT, oldSegs, cubes, memory, marks, hold }.
// Returns true while something is still moving (so the loop keeps drawing).
export function render(g, now) {
  const { W, H, z } = cam;
  const hw = z / 2, hq = z / 4, lift = LIFT * z;
  let busy = false;
  ctx.fillStyle = col(P.dusk, 0);
  ctx.fillRect(0, 0, W, H);
  const [x0, x1, y0, y1] = visibleBounds();
  const thin = Math.max(1, z / 50);

  for (let d = x0 + y0; d <= x1 + y1; d++) {
    for (let x = Math.max(x0, d - y1); x <= Math.min(x1, d - y0); x++) {
      const y = d - x, lv = level(x, y);
      const ax = W / 2 + ((x - cam.x) - (y - cam.y)) * hw;
      const ay = H / 2 + ((x - cam.x) + (y - cam.y)) * hq - lv * lift;
      if (ax < -z || ax > W + z || ay - z * 1.6 > H || ay + hq * 2 + lv * lift < 0) continue;

      const k = key(x, y), rec = g.light.get(k);
      let L = 0;
      if (rec) {
        const p = clamp((now - rec.t0) / 260);
        if (p < 1) busy = true;
        L = rec.from + (rec.l - rec.from) * p;
      }
      const v = DIM + (1 - DIM) * Math.max((g.memory.get(areaKey(x, y)) ?? Infinity) <= now ? MEMORY : 0, Math.min(1, L * 1.5));
      const base = P.levels[lv], m = lv ? 1 + shade(x, y) * 0.09 : 1;

      // terrace top
      const Bx = ax + hw, By = ay + hq, Cy = ay + 2 * hq, Dx = ax - hw;
      poly([ax, ay, Bx, By, ax, Cy, Dx, By], col(base, v, m));
      // cliff faces down to lower neighbours in front
      const nr = level(x + 1, y), nl = level(x, y + 1);
      if (nr < lv) poly([Bx, By, ax, Cy, ax, Cy + (lv - nr) * lift, Bx, By + (lv - nr) * lift], col(base, v, m * 0.84));
      if (nl < lv) poly([Dx, By, ax, Cy, ax, Cy + (lv - nl) * lift, Dx, By + (lv - nl) * lift], col(base, v, m * 0.74));
      // contour lines on the lip of every step, survey lines on area edges
      ctx.lineWidth = thin;
      ctx.beginPath();
      if (level(x, y - 1) < lv) line(ax, ay, Bx, By);
      if (level(x - 1, y) < lv) line(ax, ay, Dx, By);
      if (nr < lv) line(Bx, By, ax, Cy);
      if (nl < lv) line(Dx, By, ax, Cy);
      ctx.strokeStyle = col(P.soft, v, 1, 0.5);
      ctx.stroke();
      if (x % AREA === 0 || y % AREA === 0) {
        ctx.beginPath();
        if (x % AREA === 0) line(ax, ay, Dx, By);
        if (y % AREA === 0) line(ax, ay, Bx, By);
        ctx.strokeStyle = col(P.soft, v, 1, 0.13);
        ctx.stroke();
      }

      // beams: half-lines from the tile's centre to its edges
      const segs = g.segs.get(k);
      if (segs) {
        const cy = ay + hq;
        for (const s of segs) {
          const p = g.oldSegs.has(`${k}:${s.d}:${s.bit}`) ? 1
            : clamp((now - g.segT - (s.a - (s.in ? 0.5 : 0)) * STEP) / (STEP / 2 || 1));
          if (p <= 0) { busy = true; continue; }
          if (p < 1) busy = true;
          const mx = ax + EDGE[s.d][0] * z, my = ay + EDGE[s.d][1] * z;
          let sx, sy, ex, ey;
          if (s.in) { sx = mx; sy = my; ex = mx + (ax - mx) * p; ey = my + (cy - my) * p; }
          else { sx = ax; sy = cy; ex = ax + (mx - ax) * p; ey = cy + (my - cy) * p; }
          ctx.beginPath();
          line(sx, sy, ex, ey);
          // step up or down to the neighbour's terrace (hidden when it falls behind this tile)
          const nlv = level(x + NX[s.d], y + NY[s.d]);
          if (!s.in && p === 1 && nlv !== lv && !(s.d > 1 && nlv < lv)) line(mx, my, mx, my + (lv - nlv) * lift);
          const c = P.beam[Math.log2(s.bit)], w = Math.min(1, s.w);
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(${c},${0.22 * w})`;
          ctx.lineWidth = z * (0.1 + 0.12 * w);
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = `rgba(${c},${0.4 + 0.6 * w})`;
          ctx.lineWidth = z * (0.02 + 0.035 * w);
          ctx.stroke();
        }
      }

      // what stands on the tile
      const cx = ax, cy = ay + hq;
      const mk = landmark(x, y);
      if (x === SOURCE.x && y === SOURCE.y) drawSource(cx, cy);
      else if (mk) drawLandmark(mk, cx, cy, v, g.marks.has(k));
      const cube = g.cubes.get(k);
      if (cube) {
        const age = clamp((now - (cube.born || 0)) / 260);
        if (age < 1) busy = true;
        const sc = age < 1 ? 1 + 0.25 * Math.sin(age * Math.PI) * (1 - age) - 0.3 * (1 - age) : 1;
        drawCube(cube.t, cube.r, cx, cy, v, g.hits.get(k) || 0, sc);
      }
    }
  }

  // long-press ring
  if (g.hold) {
    const p = clamp((now - g.hold.t) / g.hold.ms);
    ctx.beginPath();
    ctx.arc(g.hold.x, g.hold.y, 26, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,248,232,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
    busy = true;
  }
  return busy;
}


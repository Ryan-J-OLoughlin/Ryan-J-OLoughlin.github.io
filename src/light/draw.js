// draw.js — paints one frame on the 2D canvas, back to front, in the homepage's style.
//
// The ground is the homepage's ESM landscape: a smooth surface in blended field colors
// washed toward map paper, shaded by a sun from the upper left, with white survey lines
// and faint contour lines. Cubes are its tinted glass cubes: see-through faces, crisp ink
// front edges, faint hidden edges.
//
// Darkness is a soft dusk wash: every color is mixed from the dusk color toward its real
// color by how lit the tile is, so light reveals the map underneath.

import { cam, LIFT, visibleBounds } from './view.js';
import { corner, tileH, weights, landmark, key, areaKey, SOURCE, TREE, HOUSE, TOWER } from './world.js';

export const STEP = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 42; // ms per tile of travel
const DIM = 0.48;      // how much of the map's color shows in darkness
const MEMORY = 0.72;   // how lit an area stays once it has been lit
const CONTOUR = 0.22;   // height between contour lines
const PAPER_WASH = 0.3;  // like the homepage landscape: field colors mixed this far toward paper

let ctx, P;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Colors come from the CSS variables (tokens.css and light.css), like the homepage scene.
function palette() {
  const s = getComputedStyle(document.documentElement);
  const c = (n) => hex(s.getPropertyValue(n).trim());
  const paper = c('--ground'), green = c('--green'), ocean = c('--ocean'), sand = c('--sand'), earth = c('--earth');
  const amber = c('--amber'), gold = c('--gold');
  return {
    paper, ink: c('--ink'), soft: c('--ink-soft'), dusk: c('--dusk'), warm: [255, 241, 208],
    fields: [green, ocean, sand, earth],
    tree: mix(green, paper, 0.15), roof: earth, wall: mix(paper, [255, 255, 255], 0.4), gold,
    tint: [c('--glass'), amber, ocean, c('--frost')],
    // beam colors by kind bit: clear, amber, blue, frosted, source
    beam: [mix(gold, paper, 0.2), amber, mix(ocean, paper, 0.15), mix(c('--ink-soft'), paper, 0.35), gold],
  };
}

// Color c mixed from dusk by v (0 dark – 1 lit), times brightness m, as a CSS string.
function col(c, v, m = 1, a = 1) {
  const d = P.dusk;
  return `rgba(${d[0] + (c[0] * m - d[0]) * v | 0},${d[1] + (c[1] * m - d[1]) * v | 0},${d[2] + (c[2] * m - d[2]) * v | 0},${a})`;
}
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export function setupDraw(canvas) {
  ctx = canvas.getContext('2d');
  P = palette();
}

function path(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}
function poly(pts, fill) { path(pts); ctx.fillStyle = fill; ctx.fill(); }
function line(x0, y0, x1, y1) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }

// ───── glass ─────

// A glass box standing on (cx, cy): side a (in tiles), height hgt (px), like the homepage cube:
// faint hidden edges, see-through tinted faces (top lightest), crisp ink front edges.
function glass(cx, cy, a, hgt, tint, alpha, v, edge = 0.75) {
  const w = a * cam.z / 2, q = a * cam.z / 4, Ty = cy - hgt;
  const ink = mix(P.ink, P.dusk, 0.25 * (1 - v));
  ctx.lineWidth = Math.max(1, cam.z / 70);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(ink, 0.16 * edge);
  ctx.beginPath();
  line(cx, cy - q, cx, Ty - q); line(cx, cy - q, cx - w, cy); line(cx, cy - q, cx + w, cy);
  ctx.stroke();
  const tv = 0.65 + 0.35 * v;
  poly([cx - w, cy, cx, cy + q, cx, Ty + q, cx - w, Ty], col(tint, tv, 0.9, alpha));
  poly([cx, cy + q, cx + w, cy, cx + w, Ty, cx, Ty + q], col(tint, tv, 0.8, alpha));
  poly([cx, Ty - q, cx + w, Ty, cx, Ty + q, cx - w, Ty], col(tint, tv, 1.08, alpha * 0.8));
  ctx.strokeStyle = rgba(ink, edge);
  ctx.beginPath();
  ctx.moveTo(cx, Ty - q); ctx.lineTo(cx + w, Ty); ctx.lineTo(cx, Ty + q); ctx.lineTo(cx - w, Ty); ctx.closePath();
  line(cx - w, Ty, cx - w, cy); line(cx, Ty + q, cx, cy + q); line(cx + w, Ty, cx + w, cy);
  line(cx - w, cy, cx, cy + q); line(cx, cy + q, cx + w, cy);
  ctx.stroke();
  return Ty;
}

// Edge midpoints of a tile in grid units from its corner (x, y), and the two corners of that edge.
const MID = [[1, 0.5], [0.5, 1], [0, 0.5], [0.5, 0]];
const ENDS = [[[1, 0], [1, 1]], [[0, 1], [1, 1]], [[0, 0], [0, 1]], [[0, 0], [1, 0]]];
const ALPHA = [0.42, 0.62, 0.55, 0.78]; // glass strength: clear, amber, blue, frosted

export function drawCube(t, r, cx, cy, v, lit, scale = 1) {
  const a = 0.66 * scale, z = cam.z, hgt = a * z * 0.61;
  const Ty = glass(cx, cy, a, hgt, P.tint[t], ALPHA[t], v);
  const w = a * z / 2, q = a * z / 4;
  if (lit > 0) { // light passing through warms the glass
    poly([cx, Ty - q, cx + w, Ty, cx, Ty + q, cx - w, Ty], rgba(P.warm, 0.5 * Math.min(1, lit)));
    poly([cx - w, cy, cx, cy + q, cx + w, cy, cx + w, Ty, cx, Ty + q, cx - w, Ty], rgba(P.warm, 0.18 * Math.min(1, lit)));
  }
  if (r < 0) return;
  // which way it faces (a blue cube faces two ways): an ink stroke on the top face
  ctx.beginPath();
  for (const d of t === 2 ? [r, (r + 1) % 4] : [r]) {
    const [mx, my] = MID[d];
    const ex = cx + ((mx - 0.5) - (my - 0.5)) * w * 0.8, ey = Ty + ((mx - 0.5) + (my - 0.5)) * q * 0.8;
    line(cx, Ty, ex, ey);
  }
  ctx.strokeStyle = rgba(P.ink, 0.8);
  ctx.lineWidth = Math.max(1.5, z / 26);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.lineCap = 'butt';
}

// ───── landmarks and the source ─────

function drawLandmark(kind, cx, cy, v, lit, z) {
  if (kind === TREE) {
    ctx.strokeStyle = col(P.soft, v);
    ctx.lineWidth = Math.max(1, z / 45);
    ctx.beginPath(); line(cx, cy, cx, cy - z * 0.2); ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy - z * 0.3, z * 0.15, 0, 7);
    ctx.fillStyle = col(P.tree, v, 1, 0.92);
    ctx.fill();
    ctx.strokeStyle = col(P.ink, v, 1, 0.35);
    ctx.stroke();
  } else if (kind === HOUSE) {
    const a = 0.46, w = a * z / 2, q = a * z / 4;
    const Ty = glass(cx, cy, a, z * 0.2, P.wall, 0.95, v, 0.6);
    const apex = Ty - z * 0.2;
    poly([cx - w, Ty, cx, Ty + q, cx, apex], col(P.roof, v, 0.85, 0.95));
    poly([cx, Ty + q, cx + w, Ty, cx, apex], col(P.roof, v, 0.72, 0.95));
    ctx.strokeStyle = col(P.ink, v, 1, 0.6);
    ctx.beginPath(); line(cx - w, Ty, cx, apex); line(cx, Ty + q, cx, apex); line(cx + w, Ty, cx, apex); ctx.stroke();
    if (lit) poly([cx + w * 0.3, cy + q * 0.45 - z * 0.06, cx + w * 0.62, cy + q * 0.2 - z * 0.06, cx + w * 0.62, cy + q * 0.2 - z * 0.13, cx + w * 0.3, cy + q * 0.45 - z * 0.13], rgba(P.gold, 0.95));
  } else if (kind === TOWER) {
    const a = 0.3, w = a * z / 2, q = a * z / 4;
    const Ty = glass(cx, cy, a, z * 0.8, P.wall, 0.95, v, 0.6);
    poly([cx - w, Ty, cx, Ty + q, cx + w, Ty, cx, Ty - z * 0.16], col(P.soft, v, 1, 0.9));
    if (lit) {
      ctx.beginPath();
      ctx.arc(cx + w * 0.45, Ty + z * 0.12, z * 0.035, 0, 7);
      ctx.fillStyle = rgba(P.gold, 1);
      ctx.fill();
    }
  }
}

// The first light: a glowing gold glass cube.
function drawSource(cx, cy, z) {
  const g = ctx.createRadialGradient(cx, cy - z * 0.2, 0, cx, cy - z * 0.2, z * 1.3);
  g.addColorStop(0, rgba(P.warm, 0.85));
  g.addColorStop(0.35, rgba(P.warm, 0.35));
  g.addColorStop(1, rgba(P.warm, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - z * 1.4, cy - z * 1.5, z * 2.8, z * 2.8);
  glass(cx, cy, 0.5, z * 0.5 * 0.61, P.gold, 0.85, 1);
}

// ───── the frame ─────

const wts = [0, 0, 0, 0];

// Draws everything. `g` is the game: { light, segs, hits, segT, oldSegs, cubes, memory, marks, hold }.
// Returns true while something is still moving (so the loop keeps drawing).
export function render(g, now) {
  const { W, H, z } = cam;
  const hw = z / 2, hq = z / 4, lift = LIFT * z;
  const SX = (gx, gy) => W / 2 + ((gx - cam.x) - (gy - cam.y)) * hw;
  const SY = (gx, gy, h) => H / 2 + ((gx - cam.x) + (gy - cam.y)) * hq - h * lift;
  let busy = false;
  ctx.fillStyle = col(P.paper, DIM);
  ctx.fillRect(0, 0, W, H);
  const [x0, x1, y0, y1] = visibleBounds();
  const thin = Math.max(0.75, z / 80);

  for (let d = x0 + y0; d <= x1 + y1; d++) {
    for (let x = Math.max(x0, d - y1); x <= Math.min(x1, d - y0); x++) {
      const y = d - x;
      const ha = corner(x, y), hb = corner(x + 1, y), hc = corner(x + 1, y + 1), hd = corner(x, y + 1);
      const ax = SX(x, y), ay = SY(x, y, ha);
      if (ax < -z || ax > W + z || ay - z * 1.6 > H || ay + z < 0) continue;
      const bx = ax + hw, by = SY(x + 1, y, hb), cxp = ax, cyp = SY(x + 1, y + 1, hc), dx = ax - hw, dy = SY(x, y + 1, hd);

      // how lit
      const k = key(x, y), rec = g.light.get(k);
      let L = 0;
      if (rec) {
        const p = clamp((now - rec.t0) / 260);
        if (p < 1) busy = true;
        L = rec.from + (rec.l - rec.from) * p;
      }
      const lit = Math.min(1, L * 1.5);
      const v = DIM + (1 - DIM) * Math.max((g.memory.get(areaKey(x, y)) ?? Infinity) <= now ? MEMORY : 0, lit);

      // ground color: blended fields washed toward paper, hill-shaded, warmed by light
      weights(x, y, wts);
      const sum = wts[0] + wts[1] + wts[2] + wts[3], hm = (ha + hb + hc + hd) / 4;
      let base = [0, 1, 2].map((i) => (wts[0] * P.fields[0][i] + wts[1] * P.fields[1][i] + wts[2] * P.fields[2][i] + wts[3] * P.fields[3][i]) / sum);
      base = mix(base, P.paper, PAPER_WASH + 0.1 - 0.06 * hm); // higher ground a little richer, like the homepage
      if (lit > 0) base = mix(base, P.warm, 0.16 * lit);
      const shadeM = Math.min(1.16, Math.max(0.74, 1 + 0.5 * ((hb + hc - ha - hd) / 2) + 0.18 * ((hc + hd - ha - hb) / 2)));
      const fill = col(base, v, shadeM);
      path([ax, ay, bx, by, cxp, cyp, dx, dy]);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = fill; // hides hairline seams between neighbouring tiles
      ctx.lineWidth = 0.8;
      ctx.stroke();

      // contour lines where the height crosses each step (marching squares)
      const lo = Math.min(ha, hb, hc, hd), hi = Math.max(ha, hb, hc, hd);
      ctx.beginPath();
      for (let lev = Math.ceil(lo / CONTOUR) * CONTOUR; lev < hi; lev += CONTOUR) {
        const pts = [];
        const edge = (h1, h2, gx1, gy1, gx2, gy2) => {
          if ((h1 - lev) * (h2 - lev) < 0) {
            const t = (lev - h1) / (h2 - h1), gx = gx1 + (gx2 - gx1) * t, gy = gy1 + (gy2 - gy1) * t;
            pts.push(SX(gx, gy), SY(gx, gy, lev));
          }
        };
        edge(ha, hb, x, y, x + 1, y); edge(hb, hc, x + 1, y, x + 1, y + 1);
        edge(hc, hd, x + 1, y + 1, x, y + 1); edge(hd, ha, x, y + 1, x, y);
        for (let i = 0; i + 3 < pts.length; i += 4) line(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
      }
      ctx.strokeStyle = rgba(P.soft, 0.2 + 0.12 * v);
      ctx.lineWidth = thin;
      ctx.stroke();

      // white survey lines along the grid (back edges only, so each is drawn once)
      ctx.beginPath();
      line(dx, dy, ax, ay); line(ax, ay, bx, by);
      ctx.strokeStyle = `rgba(255,255,255,${0.06 + 0.3 * (v - DIM) / (1 - DIM)})`;
      ctx.stroke();

      // beams: half-lines from the tile's middle to its edges, hugging the ground
      const mx0 = SX(x + 0.5, y + 0.5), my0 = SY(x + 0.5, y + 0.5, tileH(x, y));
      const segs = g.segs.get(k);
      if (segs) {
        for (const s of segs) {
          const p = g.oldSegs.has(`${k}:${s.d}:${s.bit}`) ? 1
            : clamp((now - g.segT - (s.a - (s.in ? 0.5 : 0)) * STEP) / (STEP / 2 || 1));
          if (p < 1) busy = true;
          if (p <= 0) continue;
          const [e0, e1] = ENDS[s.d], [mgx, mgy] = MID[s.d];
          const eh = (corner(x + e0[0], y + e0[1]) + corner(x + e1[0], y + e1[1])) / 2;
          const ex = SX(x + mgx, y + mgy), ey = SY(x + mgx, y + mgy, eh);
          const [sx, sy, tx, ty] = s.in ? [ex, ey, mx0, my0] : [mx0, my0, ex, ey];
          ctx.beginPath();
          line(sx, sy, sx + (tx - sx) * p, sy + (ty - sy) * p);
          const c = P.beam[Math.log2(s.bit)], w = Math.min(1, s.w);
          ctx.strokeStyle = rgba(P.warm, 0.35 * w); // soft glow (square ends, so halves don't overlap)
          ctx.lineWidth = z * (0.12 + 0.1 * w);
          ctx.stroke();
          ctx.lineCap = 'round';
          ctx.strokeStyle = rgba(c, 0.55 + 0.45 * w);
          ctx.lineWidth = z * (0.022 + 0.028 * w);
          ctx.stroke();
          ctx.lineCap = 'butt';
        }
      }

      // what stands on the tile
      const mk = landmark(x, y);
      if (x === SOURCE.x && y === SOURCE.y) drawSource(mx0, my0, z);
      else if (mk) drawLandmark(mk, mx0, my0, v, g.marks.has(k), z);
      const cube = g.cubes.get(k);
      if (cube) {
        const age = clamp((now - (cube.born || 0)) / 260);
        if (age < 1) busy = true;
        const sc = age < 1 ? 0.7 + 0.3 * age + 0.12 * Math.sin(age * Math.PI) : 1;
        drawCube(cube.t, cube.r, mx0, my0, v, g.hits.get(k) || 0, sc);
      }
    }
  }

  // long-press ring
  if (g.hold) {
    const p = clamp((now - g.hold.t) / g.hold.ms);
    ctx.beginPath();
    ctx.arc(g.hold.x, g.hold.y, 26, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    ctx.strokeStyle = rgba(P.ink, 0.7);
    ctx.lineWidth = 2;
    ctx.stroke();
    busy = true;
  }
  return busy;
}

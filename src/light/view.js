// view.js — the isometric camera: grid ⇄ screen, panning, zooming, picking a tile.
//
// Grid point (gx, gy) at terrace height h appears at
//   x = W/2 + ((gx - cam.x) - (gy - cam.y)) · z/2
//   y = H/2 + ((gx - cam.x) + (gy - cam.y)) · z/4 − h · LIFT · z
// where z is the width of one tile on screen, in CSS pixels.

import { corner, tileH, MAX_H } from './world.js';

export const LIFT = 1.0;                // screen height of one unit of ground height, in tile widths
export const ZOOM_MAX = 120;
// Zoomed out, at most ~24 tiles span the short side of the screen (keeps big screens fast).
const zoomMin = () => Math.max(22, Math.min(cam.W, cam.H) / 24);
export const cam = { x: 0.5, y: 0.5, z: 56, W: 1, H: 1 };

export function project(gx, gy, h) {
  return [
    cam.W / 2 + ((gx - cam.x) - (gy - cam.y)) * cam.z / 2,
    cam.H / 2 + ((gx - cam.x) + (gy - cam.y)) * cam.z / 4 - h * LIFT * cam.z,
  ];
}

export function unproject(px, py, h) {
  const u = (px - cam.W / 2) / (cam.z / 2), v = (py - cam.H / 2 + h * LIFT * cam.z) / (cam.z / 4);
  return [(u + v) / 2 + cam.x, (v - u) / 2 + cam.y];
}

// Drag: the ground follows the finger.
export function pan(dx, dy) {
  const u = dx / (cam.z / 2), v = dy / (cam.z / 4);
  cam.x -= (u + v) / 2;
  cam.y -= (v - u) / 2;
}

// Zoom by factor f, keeping the point under (px, py) still.
export function zoom(f, px, py) {
  const [x0, y0] = unproject(px, py, 3);
  cam.z = Math.min(ZOOM_MAX, Math.max(zoomMin(), cam.z * f));
  const [x1, y1] = unproject(px, py, 3);
  cam.x += x0 - x1;
  cam.y += y0 - y1;
}

// Put the top of tile (x, y) in the middle of the screen.
export function centerOn(x, y) {
  const h = tileH(x, y);
  cam.x = x + 0.5 - 2 * h * LIFT;
  cam.y = y + 0.5 - 2 * h * LIFT;
}

// Is (px, py) inside the polygon given as a flat list of points?
function inside(px, py, pts) {
  let s = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [pts[i], pts[i + 1], pts[j], pts[j + 1]];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) s = !s;
  }
  return s;
}

// The tile whose ground is under (px, py): the frontmost tile whose outline holds the point.
export function pickTile(px, py) {
  const [gx, gy] = unproject(px, py, MAX_H / 2);
  let best = null;
  for (let y = Math.floor(gy) - 4; y <= gy + 4; y++) for (let x = Math.floor(gx) - 4; x <= gx + 4; x++) {
    if (best && x + y <= best[0] + best[1]) continue;
    const pts = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].flatMap(([cx, cy]) => project(cx, cy, corner(cx, cy)));
    if (inside(px, py, pts)) best = [x, y];
  }
  return best;
}

// Grid bounds that cover the screen, with room for tall terraces and objects.
export function visibleBounds() {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [px, py] of [[0, 0], [cam.W, 0], [0, cam.H], [cam.W, cam.H]]) {
    for (const h of [-1, MAX_H + 3]) {
      const [gx, gy] = unproject(px, py, h);
      x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); y0 = Math.min(y0, gy); y1 = Math.max(y1, gy);
    }
  }
  return [Math.floor(x0) - 1, Math.ceil(x1) + 1, Math.floor(y0) - 1, Math.ceil(y1) + 1];
}

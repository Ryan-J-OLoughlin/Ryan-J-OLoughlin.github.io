// input.js — one finger or a mouse does everything.
//   tap: place / rotate      long-press (or right-click): pick up
//   drag: pan                pinch (or wheel): zoom        arrows, + and −: pan and zoom
// The handlers in `h` decide what a tap or hold means; this file only tells gestures apart.

export const HOLD_MS = 480;
const MOVE = 9; // px a finger may wander before a tap becomes a drag

export function setupInput(el, h) {
  const pts = new Map();
  let press = null, timer = 0, pinch = null, lastType = 'mouse';

  const cancelPress = () => { clearTimeout(timer); press = null; h.holding(null); };
  const twoFingers = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  el.addEventListener('pointerdown', (e) => {
    lastType = e.pointerType;
    if (e.button > 0) return;
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      press = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
      h.holding({ ...press, ms: HOLD_MS });
      timer = setTimeout(() => {
        if (press && !press.moved) { h.hold(press.x, press.y); cancelPress(); }
      }, HOLD_MS);
    } else {
      cancelPress();
      pinch = twoFingers();
    }
  });

  el.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 1) {
      if (press && !press.moved && Math.hypot(p.x - press.x, p.y - press.y) > MOVE) {
        press.moved = true;
        clearTimeout(timer);
        h.holding(null);
        h.pan(p.x - press.x, p.y - press.y); // catch up the slack
        return;
      }
      if (!press || press.moved) h.pan(dx, dy);
    } else if (pts.size === 2 && pinch) {
      const n = twoFingers();
      h.zoom(n.d / pinch.d, n.x, n.y);
      h.pan(n.x - pinch.x, n.y - pinch.y);
      pinch = n;
    }
  });

  const up = (e) => {
    if (!pts.delete(e.pointerId)) return;
    if (e.type === 'pointerup' && press && !press.moved) h.tap(press.x, press.y);
    cancelPress();
    if (pts.size < 2) pinch = null;
    if (pts.size === 1) press = { moved: true }; // the finger left behind after a pinch only pans
    h.end();
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    h.zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
    h.end();
  }, { passive: false });

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (lastType === 'mouse') h.hold(e.clientX, e.clientY); // touch long-press is handled above
  });

  addEventListener('keydown', (e) => {
    const s = 60, keys = { ArrowLeft: [s, 0], ArrowRight: [-s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] };
    if (keys[e.key]) h.pan(...keys[e.key]);
    else if (e.key === '+' || e.key === '=') h.zoom(1.2, innerWidth / 2, innerHeight / 2);
    else if (e.key === '-') h.zoom(1 / 1.2, innerWidth / 2, innerHeight / 2);
    else return;
    e.preventDefault();
    h.end();
  });
}

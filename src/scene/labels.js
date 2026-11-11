// labels.js — keeps web-text labels pinned to points in the 3D scene.
// Each frame a 3D point is projected to the screen and the label is moved there.
// The text stays sharp, selectable and readable by screen readers.

import { Vector3 } from 'three';

const point = new Vector3();

// Screen position (in px, inside `container`) of a world point.
export function toScreen(camera, container, x, y, z) {
  point.set(x, y, z).project(camera);
  return {
    x: (point.x * 0.5 + 0.5) * container.clientWidth,
    y: (-point.y * 0.5 + 0.5) * container.clientHeight,
  };
}

export function pin(el, pos, opacity, anchor = 'left') {
  const shift = anchor === 'topleft' ? '' : anchor === 'right' ? 'translate(-100%, -50%)' : anchor === 'center' ? 'translate(-50%, -100%)' : 'translateY(-50%)';
  el.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px) ${shift}`;
  el.style.opacity = String(Math.max(0, Math.min(1, opacity)));
  el.style.visibility = opacity > 0.01 ? 'visible' : 'hidden';
}

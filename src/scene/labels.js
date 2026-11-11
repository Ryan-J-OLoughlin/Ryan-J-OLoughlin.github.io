// labels.js — keeps the layer names (real web text) next to their cubes.
// Each frame, the right-hand edge of each cube is projected from 3D to the screen,
// and the label is moved there. The text stays sharp, selectable and readable by screen readers.

import { Vector3 } from 'three';

export function createLabels(container, elements) {
  const point = new Vector3();

  return function place(camera, layout) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    for (const [layer, el] of Object.entries(elements)) {
      const { y, size, visibility } = layout[layer];
      // Right-hand vertical edge of the cube, as seen from the camera, at mid height.
      point.set(size * 0.5, y, -size * 0.5).project(camera);
      const x = (point.x * 0.5 + 0.5) * w;
      const top = (-point.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${Math.round(x + 24)}px, ${Math.round(top)}px) translateY(-50%)`;
      el.style.opacity = String(Math.max(0, (visibility - 0.6) / 0.4));
    }
  };
}

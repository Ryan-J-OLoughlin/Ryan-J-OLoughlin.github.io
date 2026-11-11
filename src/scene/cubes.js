// cubes.js — the tinted-glass cube.
// Glass is faked cheaply: a see-through surface (both sides drawn, so the back
// faces show through) plus thin edge lines. Real refraction is too costly on phones.

import {
  BoxGeometry, EdgesGeometry, Mesh, LineSegments, Group,
  MeshStandardMaterial, LineBasicMaterial, DoubleSide,
} from 'three';

const box = new BoxGeometry(1, 1, 1);
const edges = new EdgesGeometry(box);

export function createGlassCube(color, edgeColor) {
  const surface = new MeshStandardMaterial({
    color,
    transparent: true,
    opacity: 0.34,
    roughness: 0.45,
    metalness: 0,
    side: DoubleSide,
    depthWrite: false,
  });
  const lines = new LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.7 });

  const group = new Group();
  group.add(new Mesh(box, surface), new LineSegments(edges, lines));

  return {
    group,
    // Set color and see-through-ness together, so a fading cube fades evenly.
    set(colorValue, visibility) {
      surface.color.copy(colorValue);
      surface.opacity = 0.34 * visibility;
      lines.opacity = 0.7 * visibility;
      group.visible = visibility > 0.001;
    },
  };
}

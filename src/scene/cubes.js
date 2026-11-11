// cubes.js — the tinted-glass cube.
//
// How the glass look is made (cheaply, no real refraction):
//   1. An invisible copy of the cube writes depth only, so the renderer knows what's in front.
//   2. Front edges: drawn where nothing is in front of them, crisp.
//   3. Hidden edges: drawn only where something IS in front of them, faint. This is what
//      makes the back of the cube read as "behind" and gives the 3D effect.
//   4. The see-through tinted surface on top.
// Hidden-edge strength is one number below (HIDDEN_EDGES), so it's easy to tune.

import {
  BoxGeometry, EdgesGeometry, Mesh, LineSegments, Group,
  MeshStandardMaterial, MeshBasicMaterial, LineBasicMaterial, GreaterDepth,
} from 'three';

const SURFACE = 0.46;      // how tinted the glass is (0 clear – 1 solid)
const FRONT_EDGES = 0.75;  // visible edges
const HIDDEN_EDGES = 0.16; // edges behind the glass

const box = new BoxGeometry(1, 1, 1);
const edges = new EdgesGeometry(box);

export function createGlassCube(color, edgeColor) {
  // 1. depth only (pushed back a hair so the cube's own front edges still pass in front of it)
  const depthOnly = new MeshBasicMaterial({
    colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  // 2. front edges
  const front = new LineBasicMaterial({ color: edgeColor, transparent: true, opacity: FRONT_EDGES });
  // 3. hidden edges: only where they are behind something
  const hidden = new LineBasicMaterial({
    color: edgeColor, transparent: true, opacity: HIDDEN_EDGES, depthFunc: GreaterDepth, depthWrite: false,
  });
  // 4. tinted surface
  const surface = new MeshStandardMaterial({
    color, transparent: true, opacity: SURFACE, roughness: 0.45, metalness: 0, depthWrite: false,
  });

  const depthMesh = new Mesh(box, depthOnly);
  const hiddenLines = new LineSegments(edges, hidden);
  const frontLines = new LineSegments(edges, front);
  const glass = new Mesh(box, surface);
  depthMesh.renderOrder = 0;
  hiddenLines.renderOrder = 1;
  frontLines.renderOrder = 2;
  glass.renderOrder = 3;

  const group = new Group();
  group.add(depthMesh, hiddenLines, frontLines, glass);

  return {
    group,
    // Set color and visibility together, so a fading cube fades evenly.
    set(colorValue, visibility) {
      surface.color.copy(colorValue);
      surface.opacity = SURFACE * visibility;
      front.opacity = FRONT_EDGES * visibility;
      hidden.opacity = HIDDEN_EDGES * visibility;
      // A half-faded cube shouldn't hide what's behind it.
      depthMesh.visible = visibility > 0.98;
      group.visible = visibility > 0.001;
    },
  };
}

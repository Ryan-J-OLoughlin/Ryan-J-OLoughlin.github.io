// The site's glass cube (../scene/cubes.js), kept in a list so the light layer can relight edges at dusk.
import * as THREE from 'three';
import { createGlassCube } from '../scene/cubes.js';
import { C } from './palette.js';

export const box = new THREE.BoxGeometry(1, 1, 1);
export const boxEdges = new THREE.EdgesGeometry(box);
export const allGlass = [];

export function glass(color, tint = 0.46, geometry) {
  const c = createGlassCube(color, C.ink, 1, { tint, geometry });
  const r = { g: c.group, ...c.materials, base: new THREE.Color(color), tint };
  allGlass.push(r);
  return r;
}
export function forgetGlass(root) {
  root.traverse((o) => {
    const i = allGlass.findIndex((r) => r.g === o);
    if (i >= 0) allGlass.splice(i, 1);
  });
}

// The four cube types: colour, tint and the small mark drawn on each top face.
import * as THREE from 'three';
import { C } from './palette.js';

export function segs(pairs) {
  const a = [];
  for (const [[x1, z1], [x2, z2]] of pairs) a.push(x1, 0.502, z1, x2, 0.502, z2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
  return g;
}
function arrow(dx, dz) {
  const s = 0.3,
    h = 0.13,
    px = -dz,
    pz = dx;
  return [
    [
      [-dx * s, -dz * s],
      [dx * s, dz * s],
    ],
    [
      [dx * s, dz * s],
      [dx * (s - h) + px * h, dz * (s - h) + pz * h],
    ],
    [
      [dx * s, dz * s],
      [dx * (s - h) - px * h, dz * (s - h) - pz * h],
    ],
  ];
}
const arc = [];
{
  let p = [-0.3, 0];
  for (let i = 1; i <= 8; i++) {
    const x = -0.3 + (0.6 * i) / 8,
      z = 0.26 * (i / 8) ** 2;
    arc.push([p, [x, z]]);
    p = [x, z];
  }
  arc.push(
    [
      [0.3, 0.26],
      [0.16, 0.24],
    ],
    [
      [0.3, 0.26],
      [0.25, 0.12],
    ],
  );
}
const circ = [];
for (let i = 0; i < 20; i++) {
  const a = (i / 20) * Math.PI * 2,
    b = ((i + 1) / 20) * Math.PI * 2;
  circ.push([
    [Math.cos(a) * 0.2, Math.sin(a) * 0.2],
    [Math.cos(b) * 0.2, Math.sin(b) * 0.2],
  ]);
}
for (const [a, b] of [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
])
  circ.push([
    [a * 0.27, b * 0.27],
    [a * 0.37, b * 0.37],
  ]);
export const TYPES = {
  prism: { color: C.ocean, tint: 0.46, mark: segs(arrow(1, 0)), lift: 0x7fa9c4 },
  amp: { color: C.earth, tint: 0.5, mark: segs(arc), lift: 0xc99b72 },
  split: { color: C.purple, tint: 0.48, mark: segs([...arrow(1, 0), ...arrow(0, 1)]), lift: 0xae9fcb },
  diffuse: { color: C.sand, tint: 0.58, mark: segs(circ), rough: 1, lift: 0xd2c08e },
};
export const crackGeo = new THREE.BufferGeometry();
{
  const a = [],
    z = 0.502,
    pts = [
      [-0.5, 0.15],
      [-0.2, 0.05],
      [-0.05, 0.22],
      [0.18, -0.02],
      [0.32, 0.1],
      [0.5, -0.08],
    ];
  for (let i = 0; i < pts.length - 1; i++) {
    a.push(
      pts[i][0],
      pts[i][1] * 1.4 + 0.05,
      z,
      pts[i + 1][0],
      pts[i + 1][1] * 1.4 + 0.05,
      z,
      z,
      pts[i][1] * 1.4 + 0.05,
      pts[i][0],
      z,
      pts[i + 1][1] * 1.4 + 0.05,
      pts[i + 1][0],
    );
  }
  crackGeo.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
}

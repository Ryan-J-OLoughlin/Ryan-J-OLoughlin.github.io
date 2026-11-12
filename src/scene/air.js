// air.js — vapor moving between the layers in stage 1D.
//
// Two kinds of faint marks, both kept inside the gaps between cubes (a little loose,
// never everywhere):
//   - wisps: short curved strands that drift around the column, like vapor,
//            fading out at both ends;
//   - specks: a sprinkle of tiny points in the same gaps.
// Some wisps climb from the lower cube toward the upper one, to suggest exchange.
// Everything is in world units, so it scales with the cubes on any screen.

import {
  BufferGeometry, BufferAttribute, Line, LineBasicMaterial, Points, PointsMaterial, Group,
} from 'three';

const SEGMENTS = 28;
const WISPS_PER_GAP = 11;
const SPECKS_PER_GAP = 45;

export function createAir(color, gaps) {
  // gaps: [{ bottom, top, tint }] in world units: the top face of one cube, the bottom of the next.
  // tint: a color for that gap's wisps (a blend of the two layers it joins), so they
  // read as vapor rather than as the contour lines in the background.
  const group = new Group();
  const wisps = [];
  const rand = (a, b) => a + Math.random() * (b - a);

  for (const gap of gaps) {
    for (let i = 0; i < WISPS_PER_GAP; i++) {
      const positions = new Float32Array((SEGMENTS + 1) * 3);
      const colors = new Float32Array((SEGMENTS + 1) * 4);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      geometry.setAttribute('color', new BufferAttribute(colors, 4));
      const material = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
      const line = new Line(geometry, material);
      line.renderOrder = 4;
      group.add(line);
      wisps.push({
        gap, positions, colors, geometry, line,
        start: rand(0, Math.PI * 2),
        span: rand(0.7, 1.7),                 // how far around the column it reaches
        radius: rand(0.62, 0.92),             // just outside the cube's corners
        climbs: i % 3 === 0,                  // a third of them rise from one cube to the next
        level: rand(0.25, 0.75),              // where in the gap it sits
        speed: rand(0.06, 0.14) * (Math.random() < 0.5 ? 1 : -1),
        phase: rand(0, Math.PI * 2),
        strength: rand(0.5, 1),
      });
    }
  }

  // specks
  const specks = [];
  for (const gap of gaps) {
    for (let i = 0; i < SPECKS_PER_GAP; i++) {
      specks.push({
        gap, angle: rand(0, Math.PI * 2), radius: rand(0.45, 1.0),
        level: rand(0.1, 0.9), speed: rand(0.08, 0.2) * (Math.random() < 0.5 ? 1 : -1), phase: rand(0, 6.3),
      });
    }
  }
  const speckPositions = new Float32Array(specks.length * 3);
  const speckGeometry = new BufferGeometry();
  speckGeometry.setAttribute('position', new BufferAttribute(speckPositions, 3));
  const speckMaterial = new PointsMaterial({
    color, size: 1.8, sizeAttenuation: false, transparent: true, depthWrite: false,
  });
  const points = new Points(speckGeometry, speckMaterial);
  points.renderOrder = 4;
  group.add(points);

  return {
    object: group,
    // t: seconds; strength: 0 (gone) – 1 (fully visible)
    update(t, strength) {
      group.visible = strength > 0.001;
      if (!group.visible) return;

      for (const w of wisps) {
        const { bottom, top } = w.gap;
        const h = top - bottom;
        const turn = w.start + t * w.speed;
        const breathe = 0.5 + 0.5 * Math.sin(t * 0.5 + w.phase); // slow fade in and out
        for (let s = 0; s <= SEGMENTS; s++) {
          const u = s / SEGMENTS; // along the strand
          const a = turn + u * w.span;
          const r = w.radius + 0.06 * Math.sin(u * 5 + t * 0.7 + w.phase);
          const level = w.climbs ? 0.15 + 0.7 * u : w.level + 0.12 * Math.sin(u * 4 + t * 0.6 + w.phase);
          w.positions[s * 3] = Math.cos(a) * r;
          w.positions[s * 3 + 1] = bottom + h * level;
          w.positions[s * 3 + 2] = Math.sin(a) * r;
          const ends = Math.sin(Math.PI * u); // fade at both ends
          const c = w.gap.tint ?? color;
          w.colors[s * 4] = c.r;
          w.colors[s * 4 + 1] = c.g;
          w.colors[s * 4 + 2] = c.b;
          w.colors[s * 4 + 3] = 0.6 * ends * breathe * w.strength * strength;
        }
        w.geometry.attributes.position.needsUpdate = true;
        w.geometry.attributes.color.needsUpdate = true;
      }

      speckMaterial.opacity = 0.45 * strength;
      specks.forEach((p, i) => {
        const a = p.angle + t * p.speed;
        const { bottom, top } = p.gap;
        speckPositions[i * 3] = Math.cos(a) * p.radius;
        speckPositions[i * 3 + 1] = bottom + (top - bottom) * (p.level + 0.08 * Math.sin(a * 2 + p.phase));
        speckPositions[i * 3 + 2] = Math.sin(a) * p.radius;
      });
      speckGeometry.attributes.position.needsUpdate = true;
    },
  };
}

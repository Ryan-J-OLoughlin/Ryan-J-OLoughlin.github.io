// air.js — the faint air moving between the layers in stage 1D.
// A few hundred small points circling the column at the two gaps between cubes,
// drifting up and down a little. Not a fluid simulation: cheap, and quiet on purpose.

import { BufferGeometry, BufferAttribute, Points, PointsMaterial } from 'three';

export function createAir(color, gapHeights, count = 220) {
  const positions = new Float32Array(count * 3);
  const particles = Array.from({ length: count }, (_, i) => ({
    angle: Math.random() * Math.PI * 2,
    radius: 0.85 + Math.random() * 0.9,
    height: gapHeights[i % gapHeights.length],
    wobble: Math.random() * Math.PI * 2,
    speed: (0.12 + Math.random() * 0.18) * (Math.random() < 0.5 ? 1 : -1),
  }));

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false,
  });
  const points = new Points(geometry, material);

  return {
    object: points,
    // t: seconds since start; strength: 0 (gone) to 1 (fully visible); scale: column size
    update(t, strength, scale) {
      material.opacity = 0.55 * strength;
      points.visible = strength > 0.001;
      if (!points.visible) return;
      particles.forEach((p, i) => {
        const a = p.angle + t * p.speed;
        positions[i * 3] = Math.cos(a) * p.radius * scale;
        positions[i * 3 + 1] = (p.height + Math.sin(a * 2 + p.wobble) * 0.12) * scale;
        positions[i * 3 + 2] = Math.sin(a) * p.radius * scale;
      });
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

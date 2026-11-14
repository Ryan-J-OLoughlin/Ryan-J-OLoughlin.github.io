// Ambient motion that tells you which land you're in, without a word:
// slow mist (ocean), small drifting specks (green), warm dust carried sideways (earth). Blended lands mix them.
import * as THREE from 'three';
import { glowTex } from './textures.js';

const COUNT = 40;
const COLORS = [new THREE.Color(0x9fc3d8), new THREE.Color(0xb9d3b2), new THREE.Color(0xd9b48a)];

export function createAmbient(scene) {
  const parts = [];
  for (let i = 0; i < COUNT; i++) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      }),
    );
    s.renderOrder = 9;
    scene.add(s);
    parts.push({ s, kind: 0, x: 0, y: 0, z: 0, ph: Math.random() * 6, age: Math.random() * 10, life: 1 });
  }

  // weights: how much of each land is here [ocean, green, earth]; strength fades it in and out
  return function update(dt, t, center, weights, strength, reduce) {
    for (const p of parts) {
      p.age += dt;
      if (p.age > p.life) {
        const r = Math.random();
        p.kind = r < weights[0] ? 0 : r < weights[0] + weights[1] ? 1 : 2;
        p.x = center.x + (Math.random() - 0.5) * 26;
        p.z = center.z + (Math.random() - 0.5) * 26;
        p.y = p.kind === 0 ? 0.3 + Math.random() * 0.6 : Math.random() * 1.5;
        p.age = 0;
        p.life = p.kind === 0 ? 9 + Math.random() * 6 : 5 + Math.random() * 5;
        p.s.material.color.copy(COLORS[p.kind]);
        p.s.scale.setScalar(p.kind === 0 ? 2.2 + Math.random() * 1.6 : 0.07 + Math.random() * 0.05);
      }
      if (!reduce) {
        if (p.kind === 0)
          p.x += dt * 0.15; // mist drifts
        else if (p.kind === 1) {
          p.y += dt * 0.12; // specks rise
          p.x += Math.sin(t + p.ph) * dt * 0.05;
        } else {
          p.x += dt * 0.35; // dust is carried sideways
          p.z -= dt * 0.1;
          p.y += Math.sin(t * 1.3 + p.ph) * dt * 0.04;
        }
      }
      p.s.position.set(p.x, p.y, p.z);
      p.s.material.opacity = strength * Math.sin(Math.PI * (p.age / p.life)) * (p.kind === 0 ? 0.05 : 0.55);
    }
  };
}

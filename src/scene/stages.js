// stages.js — where every cube sits at each stage, and everything in between.
// One number, `progress`, runs from 0 (stage 0D: one cube) to 1 (stage 1D: three
// stacked cubes). Any value in between is a frame of the morph, so the same code
// works for a click animation now and for scroll-driven morphing on phones later.

import { Color } from 'three';

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;

// Layer order, bottom to top. The middle cube is the one visible at 0D.
export const LAYERS = ['robustness', 'errors', 'antifragility'];

const SIZE_0D = 1.9;   // the single cube
const SIZE_1D = 1.0;  // each cube in the column
const SPACING = 1.75;  // centre to centre in the column
const DELAY = { robustness: 0.1, errors: 0, antifragility: 0.2 }; // small stagger

// The two gaps between cubes in the column, where the air moves.
export const GAPS = [
  { bottom: -SPACING + SIZE_1D / 2, top: -SIZE_1D / 2 },
  { bottom: SIZE_1D / 2, top: SPACING - SIZE_1D / 2 },
];

export function createStages({ cubes, air, colors }) {
  const scratch = new Color();

  // Returns, for each layer, where its cube is and how visible it is (used by labels too).
  function apply(progress, seconds) {
    const result = {};
    LAYERS.forEach((layer, i) => {
      const local = ease(clamp((progress - DELAY[layer]) / 0.8));
      const size = lerp(SIZE_0D, SIZE_1D, local);
      const y = lerp(0, (i - 1) * SPACING, local);
      const visibility = layer === 'errors' ? 1 : clamp(local / 0.35);

      const cube = cubes[layer];
      cube.group.position.set(0, y, 0);
      cube.group.scale.setScalar(size);
      cube.group.rotation.y = ease(clamp(progress)) * (Math.PI / 2); // a quarter turn while it splits
      scratch.copy(colors.start).lerp(colors[layer], local);
      cube.set(scratch, visibility);

      result[layer] = { y, size, visibility: local };
    });

    air.update(seconds, clamp((progress - 0.55) / 0.45));
    return result;
  }

  return { apply };
}

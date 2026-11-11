// stages.js — where everything sits at each stage, and everything in between.
//
// One number, `progress`, drives the whole scene:
//   0 = stage 0D (one cube)   1 = stage 1D (three stacked cubes)   2 = stage 3D (three grids)
// Any value in between is a frame of a morph, so the same code serves click animations
// now and scroll-driven morphing on phones later.

import { Color } from 'three';

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp = (x) => Math.min(1, Math.max(0, x));
const lerp = (a, b, t) => a + (b - a) * t;

// Layer order, bottom to top. The middle cube is the one visible at 0D.
export const LAYERS = ['robustness', 'errors', 'antifragility'];

const SIZE_0D = 1.9;   // the single cube
const SIZE_1D = 1.0;   // each cube in the column
const SPACING = 1.75;  // column: centre to centre
const DELAY = { robustness: 0.1, errors: 0, antifragility: 0.2 }; // small stagger in the split

// Stage 3D: the three grids sit further apart than the column cubes.
export const LAYER_Y = { robustness: -1.9, errors: 0, antifragility: 1.9 };

// The two gaps between cubes in the column, where the air moves.
export const GAPS = [
  { bottom: -SPACING + SIZE_1D / 2, top: -SIZE_1D / 2 },
  { bottom: SIZE_1D / 2, top: SPACING - SIZE_1D / 2 },
];

export function createStages({ cubes, air, grid, colors }) {
  const scratch = new Color();

  function apply(progress, seconds, focusedTopic) {
    const p1 = clamp(progress);      // 0D → 1D
    const p2 = clamp(progress - 1);  // 1D → 3D
    const flatten = ease(clamp(p2 / 0.6));               // column cubes spread into slabs
    const fadeColumn = 1 - clamp((p2 - 0.45) / 0.35);    // ...and fade as the grid appears
    const reveal = clamp((p2 - 0.35) / 0.65);            // grid builds up

    const layout = { layers: {}, reveal, p1, p2 };

    LAYERS.forEach((layer, i) => {
      const local = ease(clamp((p1 - DELAY[layer]) / 0.8));
      const size = lerp(SIZE_0D, SIZE_1D, local);
      const y1 = lerp(0, (i - 1) * SPACING, local);
      const y = lerp(y1, LAYER_Y[layer], flatten);
      const visibility = (layer === 'errors' ? 1 : clamp(local / 0.35)) * fadeColumn;

      const cube = cubes[layer];
      cube.group.position.set(0, y, 0);
      cube.group.scale.set(
        lerp(size, grid.width, flatten),
        lerp(size, 0.04, flatten),
        lerp(size, grid.depth, flatten),
      );
      // a quarter turn while splitting, another while flattening (ends square to the grid)
      cube.group.rotation.y = (ease(p1) + flatten) * (Math.PI / 2);
      scratch.copy(colors.start).lerp(colors[layer], local);
      cube.set(scratch, visibility);

      layout.layers[layer] = { y, size, local, column: 1 - flatten };
    });

    air.update(seconds, clamp((p1 - 0.55) / 0.45) * (1 - clamp(p2 / 0.3)));
    grid.update(reveal, focusedTopic);
    return layout;
  }

  return { apply };
}

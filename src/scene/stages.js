// stages.js — where everything sits at each stage, and everything in between.
//
// One number, `progress`, drives the whole scene:
//   0 = stage 0D (one cube)   1 = stage 1D (three stacked cubes)   2 = stage 3D (three grids)
//   3 = stage ESM (zoomed far out: the whole model is one small cube on a shared landscape)
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

export function createStages({ cubes, air, grid, landscape, modelSpot, modelSize, colors }) {
  const scratch = new Color();

  function apply(progress, seconds, focusedTopic) {
    const p1 = clamp(progress);      // 0D → 1D
    const p2 = clamp(progress - 1);  // 1D → 3D
    const p3 = clamp(progress - 2);  // 3D → ESM
    const flatten = ease(clamp(p2 / 0.6));               // column cubes spread into slabs
    const fadeColumn = 1 - clamp((p2 - 0.45) / 0.35);    // ...and fade as the grid appears
    const reveal = clamp((p2 - 0.35) / 0.65);            // grid builds up

    const layout = { layers: {}, reveal, p1, p2, p3 };

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
    // 3D → ESM happens in clear steps, so it's easy to follow:
    //   0.00–0.35  zoom out: the grid shrinks to the size of one cube, camera pulls back
    //   0.30–0.40  the grid hands over to the small "this model" cube, with its label
    //   0.50–0.80  the landscape rises around it
    //   0.72–1.00  the other people's cubes pop up, with their names
    const shrink = 1 - Math.pow(1 - clamp(p3 / 0.35), 3);
    grid.object.scale.setScalar(lerp(1, modelSize / grid.width, shrink)); // ends the size of one cube
    grid.object.position.set(
      lerp(0, modelSpot.x, shrink),
      lerp(0, modelSpot.y, shrink),
      lerp(0, modelSpot.z, shrink),
    );
    grid.update(reveal, focusedTopic, 1 - clamp((p3 - 0.3) / 0.08));
    const me = clamp((p3 - 0.28) / 0.1);
    const ground = clamp((p3 - 0.5) / 0.3);
    const people = clamp((p3 - 0.72) / 0.28);
    landscape.update(ground, people, me);
    Object.assign(layout, { me, ground, people });
    layout.shrink = shrink;
    return layout;
  }

  return { apply };
}

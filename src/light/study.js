// Visual studies for the Land component (?study=1|2|3): staged scenes in the real game, so frames show
// the real ground, cubes and light. Growth is not painted in: the light grows it live, except the older
// ground of frame 3, which stands for a component already played.
const L = (x, z, r) => ({ k: "s", x, z, r, s: 1 });
const cube = (ty, x, z, r, b = false) => ({ k: "c", x, z, r, ty, f: true, b });
const beacon = (x, z, n = 1, w = false, g = false) => ({
  k: "b",
  x,
  z,
  n,
  w,
  g,
  r: 0,
  h: false,
});
const rock = (x, z) => ({ k: "r", x, z });

function field(cx, cz, R, seed) {
  // an irregular patch of grown ground, denser toward the middle
  const out = [];
  for (let x = cx - R; x <= cx + R; x++)
    for (let z = cz - R; z <= cz + R; z++) {
      const d = Math.hypot(x - cx, z - cz) / R,
        n = Math.sin(x * 1.7 + seed) * Math.cos(z * 1.3 - seed) * 0.5 + 0.5;
      if (d < 1 && n > d * 0.9 - 0.05) out.push(x + "," + z);
    }
  return out;
}

const SCENES = {
  // 1 · early: bare ground, one route; its beam leaves the first green trail
  1: {
    cam: [3, -2],
    E: [
      L(0, 4, 3),
      cube("prism", 0, -2, 0),
      beacon(7, -2),
      rock(4, 2),
      rock(-3, -5),
    ],
  },
  // 2 · mid: a split feeds a diffuser garden and a cracked prism whose leak grows a thin line
  2: {
    cam: [2, -2],
    E: [
      L(0, 5, 3),
      cube("split", 0, 1, 3),
      cube("diffuse", 0, -4, 0),
      cube("prism", 5, 1, 3, true),
      beacon(5, -5),
      beacon(-3, -4),
      rock(2, -7),
      rock(-4, 2),
    ],
  },
  // 3 · equilibrium: the great beacon takes three beams; the Tree has grown and the land around it is green
  3: {
    cam: [0, -5],
    E: [
      L(0, 2, 3),
      L(-7, -6, 0),
      L(7, -6, 2),
      beacon(0, -6, 3, true, true),
      cube("diffuse", -5, -11, 0),
      cube("diffuse", 5, -1, 0),
      beacon(-6, -12, 1, true),
      rock(-3, 1),
      rock(4, -10),
    ],
    grown: [...field(0, -6, 11, 1.3), ...field(-6, -12, 4, 0.4)],
    tree: [5, -11],
  },
};
// 4 · the same place before any life: the boxy model on the bare map
SCENES[4] = { ...SCENES[3], grown: [], tree: null };

// 5 · the moment of equilibrium: starts bare, then the land flushes out from the great beacon
SCENES[5] = {
  ...SCENES[3],
  grown: [],
  tree: [5, -11],
  flush: { at: 3, center: [0, -6], cells: SCENES[3].grown },
};
export const studyFlush = (n) => SCENES[n] && SCENES[n].flush;

export function studySave(n) {
  const S = SCENES[n];
  if (!S) return null;
  return {
    v: 1,
    E: S.E,
    inv: { prism: 0, amp: 0, split: 0, diffuse: 0 },
    seen: ["prism", "amp", "split", "diffuse"],
    terr: 0,
    found: 0,
    chunks: [],
    great: null,
    last: null,
    res: [],
    cam: S.cam,
    grown: S.grown || [],
  };
}
export const studyTree = (n) => SCENES[n] && SCENES[n].tree;

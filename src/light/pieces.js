// Puzzle pieces: small light problems, each built together with its own solution, so a route made of
// them is always solvable. A piece takes the lit beacon P and the direction of travel toward T, lays
// out its cells (only where nothing permanent stands), and returns the next stepping stone plus a plan:
// the moves that solve it. Players never see the plan; the test bot follows it.
//
//   turn   one prism at a corner                                   (any land)
//   fork   a twin beacon fed by a puzzle splitter + two prisms     (ocean: robustness)
//   fault  an old chain with one cracked cube to find and replace  (green: errors)
//   spill  a crack you cannot remove; its leaking light is the way (earth: antifragility)

export const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
// direction index from a to b along one axis: 0 east, 1 south, 2 west, 3 north
export const dirTo = (a, b) => (b[0] > a[0] ? 0 : b[1] > a[1] ? 1 : b[0] < a[0] ? 2 : 3);
const add = (a, d, n = 1) => [a[0] + DIRS[d][0] * n, a[1] + DIRS[d][1] * n];
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

/* ctx: { free(x,z) — nothing permanent and not reserved; lane(P,C,N) — the L-lane is clear;
          claim(P,C,N) — reserve and clear a lane; stone(cell, need) — a route beacon;
          cube(type, cell, rot, opts) — place a cube on the map; rock(cell); spot(near) — a free cell nearby } */

export function turn(ctx, P, T, last) {
  const step = (d) => Math.sign(d) * Math.min(4, Math.abs(d));
  const base = last ? T : [P[0] + step(T[0] - P[0]), P[1] + step(T[1] - P[1])];
  // candidates nearest the ideal spot first, widening when it's crowded (a hop may reach 5 each way:
  // 5 + 5 = 10, a stepping stone's reach)
  const offsets = [[0, 0]];
  if (!last) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (x || z) offsets.push([x, z]);
  offsets.sort((u, v) => Math.hypot(...u) - Math.hypot(...v));
  for (const [ox, oz] of offsets) {
    const N = [base[0] + ox, base[1] + oz];
    if (Math.abs(N[0] - P[0]) > 5 || Math.abs(N[1] - P[1]) > 5 || same(N, P)) continue;
    if (!last && !ctx.free(...N)) continue;
    for (const C of [
      [N[0], P[1]],
      [P[0], N[1]],
    ]) {
      if (!ctx.lane(P, C, N)) continue;
      ctx.claim(P, C, N);
      ctx.stone(N, 1);
      const straight = same(C, P) || same(C, N);
      const plan = straight
        ? [{ op: 'aim', at: P, rot: dirTo(P, N) }]
        : [
            { op: 'aim', at: P, rot: dirTo(P, C) },
            { op: 'put', type: 'prism', cell: C, rot: dirTo(C, N) },
          ];
      return { kind: 'turn', at: N, plan };
    }
  }
  return null;
}

// Light from P runs forward (f) into a splitter; one half turns sideways (s) straight into a twin beacon,
// the other runs on, turns twice with prisms and arrives at the twin from the far side.
export function fork(ctx, P, T) {
  const dx = T[0] - P[0],
    dz = T[1] - P[1];
  const f = Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 2) : dz >= 0 ? 1 : 3;
  const sides = [(f + 1) % 4, (f + 3) % 4].sort((a, b) => {
    const toward = (d) => DIRS[d][0] * dx + DIRS[d][1] * dz;
    return toward(b) - toward(a);
  });
  for (const s of sides) {
    // the long way round (2 + 2 + 3 + 2 = 9 cells) must fit within a stepping stone's reach of 10
    const Sp = add(P, f, 2),
      N = add(Sp, s, 3),
      C2 = add(Sp, f, 2),
      C3 = add(C2, s, 3);
    const cells = [Sp, N, C2, C3];
    if (!cells.every((c) => ctx.free(...c))) continue;
    if (!(
      ctx.lane(P, P, Sp) &&
      ctx.lane(Sp, Sp, N) &&
      ctx.lane(Sp, Sp, C2) &&
      ctx.lane(C2, C2, C3) &&
      ctx.lane(C3, C3, N)
    ))
      continue;
    for (const [a, b] of [
      [P, Sp],
      [Sp, N],
      [Sp, C2],
      [C2, C3],
      [C3, N],
    ])
      ctx.claim(a, a, b);
    ctx.stone(N, 2);
    // the splitter belongs to this puzzle: it waits nearby, can be moved but not kept
    const r = (f + 1) % 4 === s ? f : s; // a splitter at rotation r sends light along r and r+1
    const home = ctx.spot(add(Sp, (s + 2) % 4, 1));
    if (!home) continue;
    ctx.cube('split', home, 0, { bound: { cell: Sp, r: 6, until: N } });
    return {
      kind: 'fork',
      at: N,
      plan: [
        { op: 'aim', at: P, rot: f },
        { op: 'move', from: home, to: Sp, rot: r },
        { op: 'put', type: 'prism', cell: C2, rot: s },
        { op: 'put', type: 'prism', cell: C3, rot: (f + 2) % 4 },
      ],
    };
  }
  return null;
}

// An old Z-shaped chain of pinned prisms from P to the next beacon; one of the two is cracked.
// Its stutter shows downstream; take the cracked one out and put your own prism in its place.
export function fault(ctx, P, T, pickBad) {
  const dx = T[0] - P[0],
    dz = T[1] - P[1];
  const f = Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 2) : dz >= 0 ? 1 : 3;
  const s = (Math.abs(dx) >= Math.abs(dz) ? (dz >= 0 ? 1 : 3) : dx >= 0 ? 0 : 2) % 4;
  const A = add(P, f, 2),
    B = add(A, s, 3),
    N = add(B, f, 2);
  if (![A, B, N].every((c) => ctx.free(...c))) return null;
  if (!(ctx.lane(P, P, A) && ctx.lane(A, A, B) && ctx.lane(B, B, N))) return null;
  for (const [a, b] of [
    [P, A],
    [A, B],
    [B, N],
  ])
    ctx.claim(a, a, b);
  ctx.stone(N, 1);
  const badA = pickBad();
  ctx.cube('prism', A, s, { fixed: true, broken: badA });
  ctx.cube('prism', B, f, { fixed: true, broken: !badA });
  const bad = badA ? A : B;
  return {
    kind: 'fault',
    at: N,
    plan: [
      { op: 'aim', at: P, rot: f },
      { op: 'discard', cell: bad },
      { op: 'put', type: 'prism', cell: bad, rot: badA ? s : f },
    ],
  };
}

// The straight way is a cracked prism that cannot be moved; its main light runs into stone,
// but the crack leaks light sideways — right into the next beacon.
export function spill(ctx, P, T) {
  const dx = T[0] - P[0],
    dz = T[1] - P[1];
  const f = Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 2) : dz >= 0 ? 1 : 3;
  // a cracked cube at rotation r sends its weakened light along r (into stone) and leaks along r+1
  for (const leak of [(f + 1) % 4]) {
    const r = f;
    const X = add(P, f, 3),
      W = add(X, r, 1),
      N = add(X, leak, 4);
    if (![X, W, N].every((c) => ctx.free(...c))) continue;
    if (!(ctx.lane(P, P, X) && ctx.lane(X, X, N))) continue;
    for (const [a, b] of [
      [P, X],
      [X, N],
    ])
      ctx.claim(a, a, b);
    ctx.claim(X, X, W);
    ctx.stone(N, 1);
    ctx.cube('prism', X, r, { fixed: true, broken: true, keep: true });
    ctx.rock(W);
    return { kind: 'spill', at: N, plan: [{ op: 'aim', at: P, rot: f }] };
  }
  return null;
}

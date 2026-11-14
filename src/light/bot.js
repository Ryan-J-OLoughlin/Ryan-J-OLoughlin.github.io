// A test bot: plays the first stretch from its hints, then follows each great beacon's route
// using only the cubes it owns, and reports whether it ever got stuck.
// Open /light/?bot=5 to watch it reach five great beacons. Results go to the console and document.title.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(test, ms = 30000) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    if (test()) return true;
    await sleep(150);
  }
  return false;
}
// direction index from a to b along one axis: 0 east, 1 south, 2 west, 3 north
const dirTo = (a, b) => (b.cx > a.cx ? 0 : b.cz > a.cz ? 1 : b.cx < a.cx ? 2 : 3);

export async function runBot(api, { greats = 3 } = {}) {
  const pieceCount = {};
  const report = (msg) => {
    console.log('[light-bot] ' + msg);
    document.title = 'bot: ' + msg;
  };
  try {
    // 1. the first stretch, from its own wordless hints
    await waitFor(() => api.hint() || api.state.firstDone, 20000);
    while (!api.state.firstDone) {
      const h = api.hint();
      if (h?.cell) api.place(h.type, h.cell, h.rot);
      else if (h?.tap) api.aim(h.tap, h.rot);
      else if (h?.discard) api.pickUp(h.discard);
      await sleep(900);
    }
    report('first stretch done');

    // 2. great beacons, one after another
    for (let n = 1; n <= greats; n++) {
      await waitFor(() => api.state.great && !api.state.great.woken && api.state.great.route, 15000);
      const G = api.state.great;
      for (let i = 1; i < G.route.length; i++) await play(G.route[i]);
      const [S1, S2, S3] = G.helpers.map(([x, z]) => api.at(x, z));
      await hop(S1, S2);
      await hop(S1, S3);
      for (const S of [S1, S2, S3]) api.aim(S, dirTo(S, G));
      api.look(G.cx, G.cz);
      if (!(await waitFor(() => G.woken, 30000))) throw new Error(`great beacon ${n} did not wake`);
      report(`great beacon ${n} of ${greats} awake`);
    }
    report(`PASS: ${greats} great beacons, never stuck; pieces solved ${JSON.stringify(pieceCount)}`);
  } catch (err) {
    report('FAIL: ' + err.message);
  }

  // carry out one piece's plan, wait for its beacon, then take back the cubes it used
  async function play(hop) {
    const N = api.at(...hop.at);
    api.look(N.cx, N.cz);
    if (N.woken) return;
    const used = [];
    for (const step of hop.plan) {
      if (step.op === 'aim') api.aim(api.at(...step.at), step.rot);
      else if (step.op === 'discard') api.pickUp(api.at(...step.cell));
      else if (step.op === 'move') api.move(api.at(...step.from), step.to, step.rot);
      else if (step.op === 'put') {
        if (!(api.state.inv[step.type] > 0)) {
          const spare = api.spareCubes().find((c) => c.type === step.type && !used.includes(c));
          if (spare) api.pickUp(spare);
        }
        const c = api.place(step.type, step.cell, step.rot);
        if (!c)
          throw new Error(
            `${hop.kind}: could not put a ${step.type} at ${step.cell} (inventory ${JSON.stringify(api.state.inv)})`,
          );
        used.push(c);
      }
      await sleep(250);
    }
    if (!(await waitFor(() => N.woken, 25000)))
      throw new Error(`${hop.kind}: beacon at ${N.cx},${N.cz} did not wake`);
    for (const c of used) api.pickUp(c);
    pieceCount[hop.kind] = (pieceCount[hop.kind] || 0) + 1;
  }

  // bring light from P to N with at most one prism, then take the prism back
  async function hop(P, N, via) {
    if (!P || !N) throw new Error('route is missing a beacon');
    api.look(N.cx, N.cz);
    if (N.woken) return;
    let prism = null;
    if (P.cx === N.cx || P.cz === N.cz) api.aim(P, dirTo(P, N));
    else {
      const corner =
        via && !(via.cx === P.cx && via.cz === P.cz) && !(via.cx === N.cx && via.cz === N.cz)
          ? via
          : { cx: N.cx, cz: P.cz };
      // out of prisms? pick up an old one, as a player would (lit beacons stay lit)
      if (!(api.state.inv.prism > 0)) {
        const spare = api.spareCubes().find((c) => c.type === 'prism');
        if (spare) api.pickUp(spare);
      }
      prism = api.place('prism', [corner.cx, corner.cz], dirTo(corner, N));
      if (!prism)
        throw new Error(
          `no prism (or blocked corner) at ${corner.cx},${corner.cz}; inventory ${JSON.stringify(api.state.inv)}`,
        );
      api.aim(P, dirTo(P, corner));
    }
    if (!(await waitFor(() => N.woken, 25000))) {
      const c = prism ? [prism.cx, prism.cz] : null;
      const seen = [];
      for (let x = Math.min(P.cx, N.cx); x <= Math.max(P.cx, N.cx); x++)
        for (let z = Math.min(P.cz, N.cz); z <= Math.max(P.cz, N.cz); z++) {
          const o = api.at(x, z);
          if (o) seen.push(`${o.kind}${o.broken ? '(broken)' : ''}${o.woken ? '(lit)' : ''}@${x},${z}`);
        }
      throw new Error(
        `beacon at ${N.cx},${N.cz} did not wake (from ${P.cx},${P.cz} reach ${P.reach || (P.great ? 14 : 8)}, corner ${c}); in the box: ${seen.join(' ')}`,
      );
    }
    if (prism) api.pickUp(prism);
  }
}

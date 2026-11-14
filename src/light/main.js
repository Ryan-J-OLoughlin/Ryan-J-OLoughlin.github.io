// Light — a quiet game about guiding light with glass cubes.
// Entry point: camera, world, light transport, entities, input, the first stretch, saving.
import * as THREE from 'three';
import { C } from './palette.js';
import { createGround, toVec3 } from './ground.js';
import { glowCv, glowTex, flameTex, sprite } from './textures.js';
import { box, boxEdges, allGlass, glass, forgetGlass } from './glass.js';
import { segs, TYPES, crackGeo } from './marks.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DIR = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]; // 0 east, 1 south, 2 west, 3 north
const key = (x, z) => x + ',' + z;
const STEP = 0.05,
  THRESH = 0.3,
  HOUSE_T = 0.3,
  SPEED = 9,
  MAXLEN = 12;
const easeOut = (x) => 1 - Math.pow(1 - x, 3),
  easeIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  clamp01 = (x) => Math.max(0, Math.min(1, x)),
  lerp = (a, b, k) => a + (b - a) * k,
  deg = (d) => (d * Math.PI) / 180;
let t = 0;

/* ---------- the site's camera: from the corner, ~30° up; tilt lifts it toward top-down ---------- */
const EL_SITE = Math.atan2(8.2, Math.hypot(10, 10)),
  EL_MAX = deg(84);
let EL = EL_SITE;
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
const camT = new THREE.Vector3(1, 0, 0);
const hemi = new THREE.HemisphereLight(0xffffff, 0xc9d0c4, 2.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.position.set(-4, 10, 6);
scene.add(sun);
let half = 6;
const gameHalf = () => Math.max(6.2, Math.min(9.5, innerHeight * 0.0102));
const homeHalf = () => (innerWidth / innerHeight > 1 ? 5.2 : 6.4);
function applyCam() {
  const a = innerWidth / innerHeight;
  camera.left = -half * a;
  camera.right = half * a;
  camera.top = half;
  camera.bottom = -half;
  camera.updateProjectionMatrix();
  const c = (Math.cos(EL) * 40) / Math.SQRT2;
  camera.position.set(camT.x + c, camT.y + Math.sin(EL) * 40, camT.z + c);
  camera.lookAt(camT);
}
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight, false));
renderer.setSize(innerWidth, innerHeight, false);
const SCR_UP = new THREE.Vector3(-1, 0, -1).normalize(),
  SCR_RIGHT = new THREE.Vector3(1, 0, -1).normalize();

/* ---------- light canvases ---------- */
const LW = 46,
  LS = 460,
  RS = 1024,
  RW = 420,
  RO = -210;
const lightCv = Object.assign(document.createElement('canvas'), { width: LS, height: LS }),
  lctx = lightCv.getContext('2d');
const revCv = Object.assign(document.createElement('canvas'), { width: RS, height: RS }),
  rctx = revCv.getContext('2d');
rctx.fillStyle = '#000';
rctx.fillRect(0, 0, RS, RS);
const lightTex = new THREE.CanvasTexture(lightCv),
  revTex = new THREE.CanvasTexture(revCv);
lightTex.flipY = revTex.flipY = false;
let tintTex = null;
let lox = 0,
  loz = 0;

/* ---------- ground: endless survey map ---------- */
const U = {
  tintT: { value: null },
  light: { value: lightTex },
  reveal: { value: revTex },
  lO: { value: new THREE.Vector2() },
  lS: { value: LW },
  rO: { value: new THREE.Vector2(RO, RO) },
  rS: { value: RW },
  day: { value: 1 },
  center: { value: new THREE.Vector2() },
  duskC: { value: toVec3(C.dusk) },
  paperC: { value: toVec3(C.ground) },
  ember: { value: toVec3(C.ember) },
};
const ground = createGround(U, RW);
scene.add(ground);

/* ---------- motes ---------- */
const motes = [];
for (let i = 0; i < 80; i++) {
  const s = sprite(C.core, 0.12);
  s.visible = false;
  scene.add(s);
  motes.push({ s, t0: -9, life: 1, x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0 });
}
let moteI = 0;
function mote(x, y, z, big = 0, color = C.core) {
  const m = motes[moteI++ % motes.length];
  Object.assign(m, {
    t0: t,
    life: 1.6 + Math.random() * (1 + big),
    x,
    y,
    z,
    vx: (Math.random() - 0.5) * 0.25,
    vz: (Math.random() - 0.5) * 0.25,
    vy: 0.35 + Math.random() * 0.35 + big * 0.2,
  });
  m.s.material.color.set(color);
  m.s.visible = true;
}
function updateMotes() {
  for (const m of motes) {
    if (!m.s.visible) continue;
    const a = (t - m.t0) / m.life;
    if (a >= 1) {
      m.s.visible = false;
      continue;
    }
    m.s.position.set(m.x + m.vx * a * m.life, m.y + m.vy * a * m.life, m.z + m.vz * a * m.life);
    m.s.material.opacity = Math.sin(a * Math.PI) * 0.85;
    m.s.scale.setScalar(0.1 + 0.06 * Math.sin(a * 9));
  }
}

/* ---------- entities (one endless map) ---------- */
const cells = new Map(),
  ents = [];
function add(e) {
  cells.set(key(e.cx, e.cz), e);
  ents.push(e);
  scene.add(e.g);
  return e;
}
function removeEnt(e) {
  scene.remove(e.g);
  forgetGlass(e.g);
  if (cells.get(key(e.cx, e.cz)) === e) cells.delete(key(e.cx, e.cz));
  const i = ents.indexOf(e);
  if (i >= 0) ents.splice(i, 1);
}
const free = (x, z) => !cells.has(key(x, z));
function ringMeshes(g, need, color) {
  const rings = [];
  for (let i = 0; i < need; i++) {
    const seg = (Math.PI * 2) / need,
      gap = need > 1 ? 0.16 : 0;
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.665, 48, 1, i * seg + gap, seg - 2 * gap),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.015;
    g.add(m);
    rings.push(m);
  }
  return rings;
}
function makeCube(type, cx, cz, rot = 0, fixed = false, broken = false) {
  const T = TYPES[type],
    c = glass(T.color, T.tint);
  if (T.rough) c.surface.roughness = 1;
  c.own = true;
  const markMat = new THREE.LineBasicMaterial({ color: T.lift, transparent: true, opacity: 0.9 });
  const mark = new THREE.LineSegments(T.mark, markMat);
  mark.renderOrder = 5;
  c.g.add(mark);
  if (fixed) {
    const pin = new THREE.Mesh(
      new THREE.CircleGeometry(0.055, 14),
      new THREE.MeshBasicMaterial({ color: C.chalk, transparent: true, opacity: 0.75 }),
    );
    pin.rotation.x = -Math.PI / 2;
    pin.position.set(-0.36, 0.503, -0.36);
    c.g.add(pin);
  }
  const crackMat = new THREE.LineBasicMaterial({ color: C.fault, transparent: true, opacity: 0 });
  const crack = new THREE.LineSegments(crackGeo, crackMat);
  crack.renderOrder = 5;
  c.g.add(crack);
  const coreSp = sprite(C.flame, 0.75);
  c.g.add(coreSp);
  const wrap = new THREE.Group();
  wrap.add(c.g);
  wrap.position.set(cx + 0.5, 0, cz + 0.5);
  c.g.rotation.y = (-rot * Math.PI) / 2;
  const sel = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ].map(([x, z]) => new THREE.Vector3(x, 0.03, z)),
    ),
    new THREE.LineBasicMaterial({ color: T.lift, transparent: true, opacity: 0 }),
  );
  sel.renderOrder = 8;
  wrap.add(sel);
  return add({
    kind: 'cube',
    type,
    cx,
    cz,
    rot,
    fixed,
    broken,
    ang: (-rot * Math.PI) / 2,
    c,
    markMat,
    crackMat,
    coreSp,
    sel,
    lift: new THREE.Color(T.lift),
    g: wrap,
    h: 0.8,
    ap: fixed ? 1 : 0,
    glow: 0,
    lifted: 0,
    spinT: -9,
  });
}
function makeRock(cx, cz) {
  const c = glass(C.ink, 0.85);
  c.g.scale.set(0.8, 0.5, 0.8);
  c.g.position.y = 0.25;
  const g = new THREE.Group();
  g.position.set(cx + 0.5, 0, cz + 0.5);
  g.add(c.g);
  return add({ kind: 'rock', cx, cz, g, h: 0.5 });
}
function makeLantern(cx, cz, rot, s = 1) {
  const g = new THREE.Group();
  g.position.set(cx + 0.5, 0, cz + 0.5);
  const sz = 0.42 + 0.16 * s,
    c = glass(C.ground, 0.16);
  c.g.scale.setScalar(sz);
  c.g.position.y = sz / 2;
  g.add(c.g);
  const wick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6),
    new THREE.MeshBasicMaterial({ color: 0x3a3530 }),
  );
  wick.position.y = 0.06;
  g.add(wick);
  const flame = sprite(0xffffff, 0.3, flameTex);
  flame.center.set(0.5, 0.08);
  flame.position.y = 0.08;
  g.add(flame);
  const haze = sprite(C.flame, 1.2 + 1.1 * s);
  haze.position.y = sz * 0.55;
  g.add(haze);
  const pl = new THREE.PointLight(C.flame, 0, 4.5, 1.5);
  pl.position.y = 0.6;
  g.add(pl);
  const [dx, dz] = DIR[rot];
  const sp = new THREE.Mesh(
    new THREE.PlaneGeometry(0.14, 0.14),
    new THREE.MeshBasicMaterial({
      color: C.core,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sp.position.set(dx * (sz / 2 + 0.002), sz * 0.3, dz * (sz / 2 + 0.002));
  sp.lookAt(dx * 5, sz * 0.3, dz * 5);
  g.add(sp);
  return add({
    kind: 'source',
    cx,
    cz,
    rot,
    s,
    g,
    c,
    flame,
    haze,
    pl,
    spout: sp,
    h: sz,
    on: -1,
    sz,
    moteT: 0,
  });
}
const aimGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0.72, 0.02, -0.13),
  new THREE.Vector3(0.98, 0.02, 0),
  new THREE.Vector3(0.72, 0.02, 0.13),
]);
aimGeo.setIndex([0, 1, 2]);
function makeBeacon(cx, cz, hidden = false, need, tag, great = false) {
  const g = new THREE.Group();
  g.position.set(cx + 0.5, 0, cz + 0.5);
  const tint = hidden ? C.earth : C.ocean;
  need = need || 1;
  const base = glass(tint, 0.4);
  base.g.scale.set(0.7, 0.16, 0.7);
  base.g.position.y = 0.08;
  g.add(base.g);
  // one pillar per beam it needs: two beams → twin pillars, three → a trio
  const OFF = {
      1: [[0, 0]],
      2: [
        [0.15, -0.15],
        [-0.15, 0.15],
      ],
      3: [
        [0.17, -0.17],
        [-0.17, 0.17],
        [-0.2, -0.2],
      ],
    }[need],
    ph = great ? 1.9 : 1.2,
    pw = need > 1 ? 0.15 : 0.22;
  const pils = OFF.map(([ox, oz]) => {
    const p = glass(tint, 0.46);
    p.g.scale.set(pw, ph, pw);
    p.g.position.set(ox, 0.16 + ph / 2, oz);
    p.own = true;
    g.add(p.g);
    return p;
  });
  let column = null;
  if (great) {
    g.scale.setScalar(1.3);
    column = sprite(C.chalk, 1, glowTex);
    column.scale.set(1.1, 10, 1);
    column.position.y = 5.2;
    column.material.opacity = 0.12;
    g.add(column);
  }
  const rings = ringMeshes(g, need, tint);
  const aim = new THREE.Mesh(
    aimGeo,
    new THREE.MeshBasicMaterial({
      color: C.flame,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  aim.renderOrder = 8;
  const aimG = new THREE.Group();
  aimG.add(aim);
  g.add(aimG);
  const sp = sprite(C.flame, 2.3);
  sp.position.y = ph + 0.25;
  g.add(sp);
  const pl = new THREE.PointLight(C.flame, 0, 6, 1.4);
  pl.position.y = 1.4;
  g.add(pl);
  if (hidden) g.visible = false;
  return add({
    kind: 'beacon',
    cx,
    cz,
    hidden,
    need,
    tint,
    tag,
    great,
    column,
    revealed: false,
    woken: false,
    wakeAt: 1e9,
    fed: false,
    inputs: [],
    rings,
    aim,
    aimG,
    rot: 3,
    ang: (-3 * Math.PI) / 2,
    sp,
    pl,
    pils,
    pilGlow: pils.map(() => 0),
    pilSeen: pils.map(() => false),
    g,
    h: great ? 2.4 : 1.4,
    glow: 0,
    bloom: 0,
    bloomT: 0,
    cel: false,
    flare: -9,
  });
}
const roofGeo = new THREE.ConeGeometry(0.44, 0.3, 4, 1);
roofGeo.rotateY(Math.PI / 4);
function makeHouse(cx, cz, hidden = false) {
  const g = new THREE.Group();
  g.position.set(cx + 0.5, 0, cz + 0.5);
  const tint = hidden ? C.earth : C.ground;
  const body = glass(tint, hidden ? 0.42 : 0.3);
  body.g.scale.set(0.56, 0.44, 0.56);
  body.g.position.y = 0.22;
  const roof = glass(tint, hidden ? 0.42 : 0.3, roofGeo);
  roof.g.position.y = 0.59;
  const win = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.17, 0.24),
    new THREE.MeshBasicMaterial({
      color: C.flame,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  win.position.y = 0.2;
  win.renderOrder = 4;
  g.add(body.g, roof.g, win);
  const rings = ringMeshes(g, 1, hidden ? C.earth : C.chalk);
  const sp = sprite(C.flame, 1.4);
  sp.position.y = 0.35;
  g.add(sp);
  const pl = new THREE.PointLight(C.flame, 0, 3.5, 1.6);
  pl.position.y = 0.8;
  g.add(pl);
  if (hidden) g.visible = false;
  return add({
    kind: 'house',
    cx,
    cz,
    hidden,
    need: 1,
    tint: hidden ? C.earth : C.chalk,
    revealed: false,
    woken: false,
    wakeAt: 1e9,
    hit: 0,
    inputs: [],
    rings,
    win,
    sp,
    pl,
    g,
    h: 0.74,
    glow: 0,
    bloom: 0,
    bloomT: 0,
    cel: false,
    flare: -9,
  });
}
function makeGift(cx, cz, type) {
  const T = TYPES[type],
    g = new THREE.Group();
  g.position.set(cx + 0.5, 0, cz + 0.5);
  const c = glass(T.color, 0.55);
  c.own = true;
  c.g.scale.setScalar(0.3);
  c.g.position.y = 0.55;
  g.add(c.g);
  c.front.color.set(T.lift);
  c.hidden.color.set(T.lift);
  const sp = sprite(T.lift, 0.9);
  sp.position.y = 0.55;
  g.add(sp);
  const rings = ringMeshes(g, 1, T.lift);
  rings[0].scale.setScalar(0.6);
  return add({
    kind: 'gift',
    cx,
    cz,
    type,
    g,
    c,
    sp,
    rings,
    h: 0.75,
    taken: false,
    takeAt: 0,
    ph: Math.random() * 6,
  });
}

/* ---------- the first stretch (wordless), then the open map ---------- */
const SAVE = 'light-save-v1';
let saved = null;
try {
  saved = JSON.parse(localStorage.getItem(SAVE));
} catch (_) {}
let inv = { prism: 1, amp: 0, split: 0, diffuse: 0 },
  seen = new Set(['prism']);
let lantern0 = null,
  L1 = null;
let step = 1,
  stepT = 0,
  hints = [{ cell: [0, -1], type: 'prism', rot: 0 }],
  firstDone = false;
if (!saved) {
  lantern0 = makeLantern(0, 3, 3);
  L1 = makeBeacon(2, -1, false, 1, 'L1');
}
const born = (e) => {
  e.born = t;
  return e;
};
const STEPS = {
  2: () => {
    born(makeGift(2, -3, 'prism'));
    born(makeBeacon(2, -6, false, 1, 'L2'));
    return [];
  },
  3: () => {
    born(makeGift(2, -7, 'prism'));
    born(makeBeacon(5, -8, false, 2, 'L3'));
    return [
      { cell: [2, -8], type: 'prism', rot: 0 },
      { tap: L1, rot: 0 },
      { cell: [5, -1], type: 'prism', rot: 3 },
    ];
  },
  4: () => {
    born(makeGift(5, -10, 'prism'));
    born(makeCube('prism', 5, -11, 2, true));
    const b = born(makeCube('prism', 3, -11, 3, true, true));
    born(makeBeacon(3, -14, false, 1, 'L4'));
    return [{ discard: b }, { cell: [3, -11], type: 'prism', rot: 3 }];
  },
};
const FRAME = {
  1: [
    [0, 3],
    [2, -1],
    [0, -1],
  ],
  2: [
    [2, -1],
    [2, -3],
    [2, -6],
  ],
  3: [
    [2, -1],
    [5, -1],
    [2, -6],
    [2, -8],
    [5, -8],
  ],
  4: [
    [5, -8],
    [5, -11],
    [3, -11],
    [3, -14],
  ],
};
let tutHalf = 5;
function frameStep(n, dur = 2.4) {
  const P = FRAME[n].map(([x, z]) => [x + 0.5, z + 0.5]),
    a = innerWidth / innerHeight,
    se = Math.sin(EL_SITE);
  const sx = P.map(([x, z]) => (x - z) / Math.SQRT2),
    sy = P.map(([x, z]) => ((x + z) / Math.SQRT2) * se);
  const cx = (Math.min(...sx) + Math.max(...sx)) / 2,
    cy = (Math.min(...sy) + Math.max(...sy)) / 2;
  const w = (Math.max(...sx) - Math.min(...sx)) / 2 + 1.2,
    h = (Math.max(...sy) - Math.min(...sy)) / 2 + 2.3;
  tutHalf = Math.max(4.6, Math.min(gameHalf() * 1.45, Math.max(h, w / a)));
  const u = cx,
    v = cy / se,
    c = new THREE.Vector3((u + v) / Math.SQRT2, 0, (v - u) / Math.SQRT2); // back from screen space to the ground
  c.addScaledVector(SCR_UP, -0.6);
  glideTo(c, dur);
}
function advance(n) {
  step = n;
  stepT = t;
  hints = STEPS[n]();
  dirty = true;
  frameStep(n);
}
const inFirst = (x, z) => x >= -6 && x <= 9 && z >= -18 && z <= 6;

// territories: each great beacon you wake moves you into new land, a blend of the three ideas (never named)
let terr = 0;
const chunkTerr = new Map();
const TS = 512,
  tintCv = Object.assign(document.createElement('canvas'), { width: TS, height: TS }),
  tctx = tintCv.getContext('2d');
tintTex = new THREE.CanvasTexture(tintCv);
tintTex.flipY = false;
U.tintT.value = tintTex;
function terrParams(k) {
  const r = rng(k * 7919 + 17);
  let w = k === 0 ? [1, 0.3, 0.45] : [0.15 + r(), 0.15 + r(), 0.15 + r()];
  const sm = w[0] + w[1] + w[2];
  w = w.map((x) => x / sm);
  const col = new THREE.Color(0, 0, 0);
  [
    [C.ocean, w[0]],
    [C.green, w[1]],
    [C.earth, w[2]],
  ].forEach(([c, x]) => {
    const cc = new THREE.Color(c);
    col.r += cc.r * x;
    col.g += cc.g * x;
    col.b += cc.b * x;
  });
  return {
    w,
    col,
    density: Math.max(0.45, 1 - 0.12 * k),
    multi: 0.12 + 0.45 * w[0],
    brk: 0.5 + 1.6 * w[1],
    hidden: 0.1 + 0.32 * w[2],
    dist: Math.min(40, 20 + 4 * k),
  };
}
function paintTint(i, j, k) {
  const P = terrParams(k),
    sc = TS / RW,
    x = ((i + 0.5) * CH - RO) * sc,
    z = ((j + 0.5) * CH - RO) * sc,
    R = CH * 1.25 * sc;
  const gr = tctx.createRadialGradient(x, z, 0, x, z, R);
  const c = P.col.getStyle();
  gr.addColorStop(0, c);
  gr.addColorStop(1, c.replace('rgb(', 'rgba(').replace(')', ',0)'));
  tctx.globalAlpha = 0.85;
  tctx.fillStyle = gr;
  tctx.fillRect(x - R, z - R, 2 * R, 2 * R);
  tintTex.needsUpdate = true;
}

const reserved = new Set();
// seeded chunks: the same map every visit, generated as you look around
const CH = 9,
  chunks = new Set();
function rng(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t2 = Math.imul(a ^ (a >>> 15), 1 | a);
    t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2;
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  };
}
function genChunk(i, j) {
  const r = rng((i * 73856093) ^ (j * 19349663) ^ 0x5f3759df),
    cells0 = [];
  const pick = () => {
    for (let k = 0; k < 20; k++) {
      const x = i * CH + Math.floor(r() * CH),
        z = j * CH + Math.floor(r() * CH);
      if (inFirst(x, z) || reserved.has(key(x, z)) || !free(x, z) || (!free(x + 1, z) && !free(x - 1, z)))
        continue;
      if (cells0.some(([a, b]) => Math.abs(a - x) + Math.abs(b - z) < 3)) continue;
      cells0.push([x, z]);
      return [x, z];
    }
    return null;
  };
  const P = terrParams(terr),
    D = P.density;
  chunkTerr.set(key(i, j), terr);
  paintTint(i, j, terr);
  let p;
  if (r() < 0.3 * D && (p = pick())) makeBeacon(...p, false, r() < P.multi ? 2 : 1);
  if (r() < 0.22 * D && (p = pick())) makeHouse(...p);
  if (r() < 0.5 && (p = pick())) makeRock(...p);
  if (r() < 0.35 * D && (p = pick())) {
    const ty = ['prism', 'prism', 'amp', 'split', 'diffuse'][Math.floor(r() * 5)];
    makeGift(...p, ty);
  }
  if (r() < P.hidden && (p = pick())) (r() < 0.5 ? makeBeacon : makeHouse)(...p, true);
}
function ensureChunks() {
  const ci = Math.floor(camT.x / CH),
    cj = Math.floor(camT.z / CH);
  for (let i = ci - 3; i <= ci + 3; i++)
    for (let j = cj - 3; j <= cj + 3; j++) {
      const k = key(i, j);
      if (chunks.has(k)) continue;
      chunks.add(k);
      genChunk(i, j);
    }
}

/* ---------- light transport ---------- */
let beams = [],
  pools = [],
  dirty = true,
  prevT0 = new Map(),
  found = 0;
function trace(PV = false) {
  const snap = PV
    ? ents.map((e) => [e, e.inS, e.inF, e.visits, e.inputs, e.hit, e.arr, e.active, e.fed])
    : null;
  const nextT0 = new Map(),
    B = [],
    Po = [];
  for (const e of ents) {
    e.inS = 0;
    e.inF = false;
    e.visits = 0;
    e.inputs = [];
    e.hit = 0;
    e.arr = 1e9;
  }
  const q = [];
  for (const e of ents) {
    if (e.kind === 'source' && e.on >= 0) {
      const [dx, dz] = DIR[e.rot];
      q.push({
        x: e.cx + 0.5,
        z: e.cz + 0.5,
        dx,
        dz,
        s: e.s,
        curve: 0,
        f: false,
        from: key(e.cx, e.cz),
        t0: e.on + 0.9,
        max: 12,
      });
    }
    if (e.kind === 'beacon' && e.woken) {
      const [dx, dz] = DIR[e.rot];
      q.push({
        x: e.cx + 0.5,
        z: e.cz + 0.5,
        dx,
        dz,
        s: 1,
        curve: 0,
        f: false,
        from: key(e.cx, e.cz),
        t0: e.wakeAt + 1,
        src: e,
        max: e.great ? 14 : e.tag ? 12 : e.reach || 8,
      });
    }
  }
  let guard = 0;
  while (q.length && guard++ < 400) {
    const r = q.shift();
    let { x, z, dx, dz } = r;
    const pts = [[x, z, 0]];
    let last = r.from,
      hit = null,
      len = 0,
      acc = 0;
    const max = r.max ?? MAXLEN;
    while (len < max) {
      if (r.curve) {
        const a = r.curve * STEP,
          c = Math.cos(a),
          s = Math.sin(a),
          nx = dx * c - dz * s;
        dz = dx * s + dz * c;
        dx = nx;
      }
      x += dx * STEP;
      z += dz * STEP;
      len += STEP;
      acc += STEP;
      if (acc >= 0.18) {
        acc = 0;
        pts.push([x, z, len]);
      }
      const cx = Math.floor(x),
        cz = Math.floor(z),
        k = key(cx, cz);
      if (k !== last) {
        last = k;
        const e = cells.get(k);
        if (e && e.kind !== 'source' && !e.dragging && !(e.kind === 'gift' && e.taken)) {
          hit = e;
          break;
        }
      }
    }
    if (hit) {
      len += Math.hypot(hit.cx + 0.5 - x, hit.cz + 0.5 - z);
      x = hit.cx + 0.5;
      z = hit.cz + 0.5;
    }
    pts.push([x, z, len]);
    const bk =
      r.from + '|' + r.dx.toFixed(2) + ',' + r.dz.toFixed(2) + '|' + r.s.toFixed(3) + (r.f ? 'f' : '');
    const t0 = PV ? t : prevT0.has(bk) ? prevT0.get(bk) : Math.max(t, r.t0);
    nextT0.set(bk, t0);
    const at = t0 + len / SPEED;
    B.push({
      pts,
      s: r.s,
      f: r.f,
      t0,
      len,
      fade: !hit,
      end: hit && hit.kind === 'cube' && r.s < THRESH,
      pv: !!r.pv,
    });
    if (!hit) continue;
    const e = hit,
      s = r.s;
    e.arr = Math.min(e.arr, at);
    if (e.kind === 'cube') {
      e.inS = Math.max(e.inS, s);
      if (r.f) e.inF = true;
      if (s < THRESH || e.visits++ > 3) continue;
      const out = e.broken ? s * 0.4 : s,
        f = r.f || e.broken,
        from = key(e.cx, e.cz),
        D = (a) => DIR[(e.rot + a) & 3],
        rem = Math.max(2, max - len),
        base = { x, z, f, from, t0: at, curve: 0, max: rem, pv: r.pv || e.preview };
      if (e.type === 'prism') {
        const [a, b] = D(0);
        q.push({ ...base, dx: a, dz: b, s: out * 0.78 });
      }
      if (e.type === 'amp') {
        const [a, b] = D(0);
        q.push({ ...base, dx: a, dz: b, s: Math.min(1.6, out * 1.4), curve: 0.17, max: rem + 5 });
      }
      if (e.type === 'split')
        for (const i of [0, 1]) {
          const [a, b] = D(i);
          q.push({ ...base, dx: a, dz: b, s: out * 0.5 });
        }
      if (e.type === 'diffuse') Po.push({ x, z, r: 1.2 + 1.4 * out, s: out * 0.6, f, t0: at, diff: true });
      if (e.broken && s * 0.3 >= 0.2) {
        const [a, b] = D(1);
        q.push({ ...base, dx: a, dz: b, s: s * 0.3, f: true });
      } // a crack leaks stray light sideways
    } else if (e.kind === 'gift') {
      if (!PV && s >= 0.2 && !e.taken) {
        e.taken = true;
        e.takeAt = at;
      }
    } else if (e.kind === 'beacon' || e.kind === 'house') {
      if (e.hidden && !e.revealed) {
        if (!PV && s >= 0.2) reveal(e, at);
      } else {
        e.inputs.push({ s, f: r.f, at });
        e.hit = Math.max(e.hit, s);
        if (r.f) e.inF = true;
      }
    }
  }
  if (PV) {
    for (const [e, a, b, c, d, f, g2, h, i] of snap)
      Object.assign(e, { inS: a, inF: b, visits: c, inputs: d, hit: f, arr: g2, active: h, fed: i });
    return B.filter((b) => b.pv);
  }
  prevT0 = nextT0;
  beams = B;
  for (const e of ents) {
    if (e.kind === 'cube') e.active = e.inS >= THRESH;
    if (e.kind === 'beacon' && !e.hidden) {
      const sum = e.inputs.reduce((a, b) => a + b.s, 0);
      e.fed = e.inputs.length >= e.need && sum >= (e.need > 1 ? 0.35 * e.need : 0.3);
      if (e.fed && !e.woken) {
        e.woken = true;
        e.wakeAt = Math.max(...e.inputs.map((i) => i.at));
        dirty = true;
      }
    }
    if (e.kind === 'house' && !e.hidden && !e.woken && e.hit >= HOUSE_T) {
      e.woken = true;
      e.wakeAt = e.arr;
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const P = [...Po];
    for (const e of ents) {
      if (e.kind === 'beacon' && e.woken)
        P.push({
          x: e.cx + 0.5,
          z: e.cz + 0.5,
          r: e.hidden ? 4.2 : e.great ? 4.5 : 2.4,
          s: 0.75,
          f: e.inF,
          e,
          t0: e.wakeAt,
        });
      if (e.kind === 'house' && e.woken)
        P.push({ x: e.cx + 0.5, z: e.cz + 0.5, r: 1.6, s: 0.5, f: e.inF, e, t0: e.wakeAt });
    }
    for (const e of ents) {
      if (e.kind !== 'house' && e.kind !== 'beacon') continue;
      const ex = e.cx + 0.5,
        ez = e.cz + 0.5;
      if (e.hidden && !e.revealed) {
        for (const p of P) {
          if (p.e === e) continue;
          const d = Math.hypot(p.x - ex, p.z - ez);
          if (d < p.r * 0.75 && (p.diff || d < p.r * 0.45)) {
            reveal(e, p.t0 + 0.6);
            break;
          }
        }
      } else if (e.kind === 'house' && !e.woken) {
        let sum = 0,
          tt = 0;
        for (const p of P) {
          if (p.e === e) continue;
          const d = Math.hypot(p.x - ex, p.z - ez),
            c = p.s * Math.max(0, 1 - d / p.r);
          if (c > 0) {
            sum += c;
            tt = Math.max(tt, p.t0);
          }
        }
        if (sum >= HOUSE_T) {
          e.woken = true;
          e.wakeAt = tt + 0.5;
        }
      }
    }
    if (pass === 2) pools = P;
  }
}
function reveal(e, at) {
  e.revealed = true;
  e.woken = true;
  e.wakeAt = at;
  e.bloomT = at;
  found++;
  dirty = true;
}

/* ---------- breath & stutter ---------- */
const hash = (n) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};
const noise = (u) => {
  const a = Math.floor(u),
    f = u - a,
    s = f * f * (3 - 2 * f);
  return hash(a) + (hash(a + 1) - hash(a)) * s;
};
function stutter(t) {
  if (reduce) return 0.62 + 0.38 * (0.5 + 0.5 * Math.cos(t * Math.PI * 1.6));
  const v = noise(t * 7);
  return v < 0.32 ? 0.3 + v * 0.8 : 0.72 + 0.28 * v;
}
const breath = (t) => (reduce ? 1 : 1 + 0.035 * Math.sin(t * Math.PI * 2 * 0.3));

/* ---------- drawing light ---------- */
const MAXV = 30000,
  corePos = new Float32Array(MAXV * 3),
  coreCol = new Float32Array(MAXV * 3);
const coreGeo = new THREE.BufferGeometry();
coreGeo.setAttribute('position', new THREE.BufferAttribute(corePos, 3));
coreGeo.setAttribute('color', new THREE.BufferAttribute(coreCol, 3));
const core = new THREE.LineSegments(
  coreGeo,
  new THREE.LineBasicMaterial({
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  }),
);
core.renderOrder = 7;
core.frustumCulled = false;
scene.add(core);
const coreC = new THREE.Color(C.core),
  emberC = new THREE.Color(C.ember),
  flameC = new THREE.Color(C.flame),
  chalkC = new THREE.Color(C.chalk),
  inkC = new THREE.Color(C.ink),
  greenC = new THREE.Color(C.green),
  groundC = new THREE.Color(C.ground),
  oceanC = new THREE.Color(C.ocean),
  tmp = new THREE.Color(),
  edgeNow = new THREE.Color();
function blob(x, z, r, a) {
  if (a <= 0.003) return;
  const px = ((x - lox) / LW) * LS,
    pz = ((z - loz) / LW) * LS,
    R = (r * LS) / LW;
  if (px < -R || pz < -R || px > LS + R || pz > LS + R) return;
  lctx.globalAlpha = Math.min(1, a);
  lctx.drawImage(glowCv, px - R, pz - R, 2 * R, 2 * R);
}
function ripple(x, z, rad, a, w) {
  if (a <= 0.003) return;
  const px = ((x - lox) / LW) * LS,
    pz = ((z - loz) / LW) * LS,
    R = (rad * LS) / LW;
  lctx.strokeStyle = '#fff';
  for (const [k, ww] of [
    [0.35, w * 2.4],
    [0.6, w * 1.4],
    [1, w * 0.6],
  ]) {
    lctx.globalAlpha = Math.min(1, a * k);
    lctx.lineWidth = (ww * LS) / LW;
    lctx.beginPath();
    lctx.arc(px, pz, Math.max(0.1, R), 0, Math.PI * 2);
    lctx.stroke();
  }
}
let nv = 0;
function drawPath(b, m) {
  const reach = (t - b.t0) * SPEED;
  if (reach <= 0) return;
  const a0 = Math.min(1.2, b.s) * m,
    col = b.end ? emberC : coreC;
  let hx = 0,
    hz = 0;
  for (let i = 0; i < b.pts.length; i++) {
    const [x, z, d] = b.pts[i];
    if (d > reach) break;
    const fd = b.fade ? clamp01((b.len - d) / 3) : 1,
      a = a0 * fd,
      k = Math.min(1, a) * (b.end ? 0.55 : 0.95);
    blob(x, z, 0.62, a * 0.2);
    hx = x;
    hz = z;
    if (i < b.pts.length - 1 && nv < MAXV - 2) {
      let [x2, z2, d2] = b.pts[i + 1];
      if (d2 > reach) {
        const f = (reach - d) / (d2 - d);
        x2 = x + (x2 - x) * f;
        z2 = z + (z2 - z) * f;
      }
      corePos.set([x, 0.07, z, x2, 0.07, z2], nv * 3);
      coreCol.set([col.r * k, col.g * k, col.b * k, col.r * k, col.g * k, col.b * k], nv * 3);
      nv += 2;
    }
  }
  if (reach < b.len) blob(hx, hz, 0.95, a0 * 0.5);
}
const cels = [];
function drawLight() {
  const br = breath(t),
    st = stutter(t);
  lox = camT.x - LW / 2;
  loz = camT.z - LW / 2;
  U.lO.value.set(lox, loz);
  U.center.value.set(camT.x, camT.z);
  lctx.globalCompositeOperation = 'source-over';
  lctx.globalAlpha = 1;
  lctx.fillStyle = '#000';
  lctx.fillRect(0, 0, LS, LS);
  lctx.globalCompositeOperation = 'lighter';
  nv = 0;
  for (const b of beams) drawPath(b, (b.f ? st : 1) * br);
  for (const p of pools) {
    const age = t - p.t0;
    if (age <= 0) continue;
    const bl = p.e && p.e.revealed ? p.e.bloom : clamp01(age * 1.5);
    blob(p.x, p.z, p.r * (0.4 + 0.6 * bl), p.s * (p.f ? st : 1) * br * 0.9 * clamp01(age * 2));
  }
  for (const e of ents)
    if (e.kind === 'source' && e.on >= 0)
      blob(e.cx + 0.5, e.cz + 0.5, 0.9 + 0.8 * e.s, (0.5 + 0.45 * e.s) * br * ignite(e) * (e.flick || 1));
  for (let i = cels.length - 1; i >= 0; i--) {
    const c = cels[i],
      a = (t - c.t0) / c.dur;
    if (a > 1) {
      cels.splice(i, 1);
      continue;
    }
    if (a < 0) continue;
    ripple(c.x, c.z, 0.5 + c.r * easeOut(a), (1 - a) * (1 - a) * 0.55, 0.18 + 0.1 * c.big);
  }
  coreGeo.setDrawRange(0, nv);
  coreGeo.attributes.position.needsUpdate = true;
  coreGeo.attributes.color.needsUpdate = true;
  lightTex.needsUpdate = true;
  const sc = RS / RW;
  rctx.globalCompositeOperation = 'lighten';
  if (frame % 5 === 0) {
    rctx.drawImage(lightCv, (lox - RO) * sc, (loz - RO) * sc, LW * sc, LW * sc);
    revTex.needsUpdate = true;
  }
}
const ignite = (e) => {
  if (e.on < 0) return 0;
  const a = t - e.on;
  if (a > 1.2) return 1;
  if (a < 0) return 0;
  return clamp01(a / 1.2) * (reduce ? 1 : 0.5 + 0.5 * hash(Math.floor(a * 10) + e.cx * 7));
};
function celebrate(e, big = e.hidden || e.great ? 1 : 0) {
  const x = e.cx + 0.5,
    z = e.cz + 0.5;
  e.flare = t;
  cels.push({ x, z, t0: t, dur: big ? 2.8 : 1.8, r: big ? 5 : 3, big });
  cels.push({ x, z, t0: t + 0.35, dur: big ? 2.6 : 1.6, r: big ? 3.4 : 2, big });
  const y = e.kind === 'beacon' ? 1.4 : 0.5,
    n = big ? 22 : 12;
  for (let i = 0; i < n; i++)
    setTimeout(
      () => mote(x + (Math.random() - 0.5) * 0.5, y * Math.random(), z + (Math.random() - 0.5) * 0.5, big),
      i * 55,
    );
}

/* ---------- per-frame look ---------- */
let selE = null;
function wiggle(e) {
  const a = t - (e.wigT ?? -9);
  e.g.rotation.z = a < 0.6 && !reduce ? 0.07 * Math.sin(a * 38) * (1 - a / 0.6) : 0;
}
function updateEnts(dt) {
  const br = breath(t),
    st = stutter(t),
    k = Math.min(1, dt * 4),
    day = U.day.value;
  edgeNow.copy(chalkC).lerp(inkC, day);
  for (const g of allGlass)
    if (!g.own) {
      g.front.color.copy(edgeNow);
      g.hidden.color.copy(edgeNow);
    }
  for (let i = ents.length - 1; i >= 0; i--) {
    const e = ents[i];
    if (e.wigT != null) wiggle(e);
    if (e.kind === 'cube') {
      e.ap = Math.min(1, e.ap + dt * 3.2);
      // site-like selection: rise and grow
      e.lifted += ((e.dragging ? 1 : e === selE ? 0.45 : 0) - e.lifted) * Math.min(1, dt * 12);
      const s = 0.8 * easeOut(e.ap) * (1 + 0.12 * e.lifted);
      e.c.g.scale.setScalar(Math.max(0.001, s));
      e.c.g.position.y = s / 2 + (1 - easeOut(e.ap)) * 0.25 + e.lifted * 0.4;
      const spin = reduce
        ? 0
        : Math.PI * 2 * easeOut(clamp01((t - e.spinT) / 0.9)) - (t - e.spinT < 0.9 ? Math.PI * 2 : 0); // place: one gentle spin
      e.c.g.rotation.y += (e.ang + (t - e.spinT < 0.9 ? spin : 0) - e.c.g.rotation.y) * Math.min(1, dt * 12);
      const arrived = t >= e.arr;
      e.glow += ((e.active && arrived && !e.dragging ? Math.min(1, e.inS) : 0) - e.glow) * k;
      const m = (e.broken || e.inF ? st : 1) * br,
        gl = e.glow * m;
      e.c.surface.color.copy(e.c.base).lerp(greenC, e.broken ? 0.7 : 0);
      const bf = clamp01(1 - (t - (e.breakT ?? -9)) / 1.2);
      e.c.surface.emissive.copy(e.broken ? greenC : e.lift).multiplyScalar(0.16 + gl * 0.2 + bf * 0.9); // a little of its own colour, so it reads at duske.c.surface.opacity=e.c.tint+e.glow*.08;
      e.coreSp.material.opacity = Math.min(1, gl * 0.75);
      e.coreSp.scale.setScalar(0.55 + 0.25 * gl);
      const sub = !e.active && e.inS > 0 && arrived ? 0.5 : 0;
      tmp
        .copy(edgeNow)
        .lerp(e.lift, 0.35)
        .lerp(emberC, sub)
        .lerp(coreC, Math.min(1, gl * 0.8));
      e.c.front.color.copy(tmp);
      e.c.hidden.color.copy(edgeNow);
      e.markMat.color.copy(e.lift).lerp(coreC, Math.min(1, gl * 0.6));
      e.c.front.opacity = 0.65 + 0.3 * Math.min(1, gl);
      e.crackMat.opacity = e.broken ? Math.min(1, 0.95 * (0.55 + 0.45 * st) + bf) : 0;
      e.sel.material.opacity +=
        ((e === selE || e.dragging ? 0.9 : 0) - e.sel.material.opacity) * Math.min(1, dt * 10);
    } else if (e.kind === 'source') {
      const ig = ignite(e),
        fl = reduce ? 1 : 0.88 + 0.24 * noise(t * 3.1 + e.cx);
      e.flick = fl;
      e.flame.material.opacity = ig * 0.95;
      e.flame.scale.set(0.2 * (0.9 + 0.1 * fl) * (0.7 + 0.3 * e.s), 0.42 * fl * (0.7 + 0.3 * e.s), 1);
      e.flame.position.x = reduce ? 0 : (noise(t * 1.3 + e.cz) - 0.5) * 0.05;
      e.haze.material.opacity = 0.55 * br * ig * fl;
      e.pl.intensity = 2.4 * br * ig * e.s * fl;
      e.spout.material.opacity = 0.7 * ig;
      if (ig > 0.9 && !reduce && t > e.moteT) {
        e.moteT = t + 1.4 + Math.random() * 1.8;
        mote(e.cx + 0.5 + (Math.random() - 0.5) * 0.1, e.sz * 0.8, e.cz + 0.5, 0);
      }
    } else if (e.kind === 'gift') {
      if (e.taken && t >= e.takeAt) {
        collect(e);
        continue;
      }
      if (e.born != null) {
        const b = easeOut(clamp01((t - e.born) / 0.9));
        e.g.scale.setScalar(Math.max(0.001, b));
      }
      e.c.g.position.y = 0.55 + (reduce ? 0 : 0.06 * Math.sin(t * 1.6 + e.ph));
      e.c.g.rotation.y += reduce ? 0 : dt * 0.6;
      e.c.g.rotation.x = 0.4;
      e.sp.material.opacity = 0.35 + 0.15 * Math.sin(t * 1.6 + e.ph);
      e.rings[0].material.opacity = 0.25 + 0.15 * Math.sin(t * 1.6 + e.ph);
    } else if (e.kind === 'beacon' || e.kind === 'house') {
      if (e.born != null && !e.hidden) {
        e.g.scale.setScalar(Math.max(0.001, easeOut(clamp01((t - e.born) / 0.9))) * (e.great ? 1.3 : 1));
      }
      if (e.revealed) {
        e.g.visible = t >= e.bloomT;
        e.bloom = easeOut(clamp01((t - e.bloomT) / 2.6));
        e.g.scale.setScalar(0.2 + 0.8 * e.bloom);
      }
      const awake = e.woken && t >= e.wakeAt;
      if (awake && !e.cel) {
        e.cel = true;
        celebrate(e);
        onWake(e);
      }
      const call = reduce ? 0.42 : 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(t * Math.PI * 0.5 + e.cx));
      e.rings.forEach((r, i) => {
        let inp = e.inputs[i];
        if (inp && t < inp.at) inp = null;
        if (awake) inp = inp || { f: e.inF };
        r.material.color.set(inp ? C.flame : e.tint);
        r.material.opacity = inp ? 0.9 * (inp.f ? st : 1) : call;
      });
      const fa = clamp01(1 - (t - e.flare) / 1.4),
        flare = fa * fa,
        m = (e.inF ? st : 1) * br;
      if (e.kind === 'beacon') {
        e.glow += ((awake ? 1 : 0) - e.glow) * Math.min(1, dt * 1.5);
        e.sp.material.opacity = Math.min(1, e.glow * m + flare);
        e.sp.scale.setScalar(2.3 * (1 + 1.6 * flare));
        e.pl.intensity = e.glow * m * 5 + flare * 6;
        const anyIn = e.inputs.some((i) => t >= i.at);
        e.pils.forEach((p, i) => {
          const inp = e.inputs[i],
            lit = awake || (inp && t >= inp.at);
          if (lit && !e.pilSeen[i] && !awake) {
            e.pilSeen[i] = true;
            const [wx, wz] = [e.cx + 0.5 + p.g.position.x, e.cz + 0.5 + p.g.position.z]; // each beam gets its own small moment
            for (let k = 0; k < 6; k++) setTimeout(() => mote(wx, 1.2 * Math.random() + 0.3, wz, 0), k * 60);
            cels.push({ x: wx, z: wz, t0: t, dur: 1, r: 1.1, big: 0 });
          }
          e.pilGlow[i] += ((lit ? 1 : 0) - e.pilGlow[i]) * Math.min(1, dt * 3);
          const pg = e.pilGlow[i];
          const wait = !lit && anyIn && !reduce ? 0.5 + 0.5 * Math.sin(t * 3.4) : 0; // the one still waiting pulses
          p.surface.emissive.copy(flameC).multiplyScalar(pg * m * 0.55 + flare * 0.5 + wait * 0.12);
          p.front.color
            .copy(edgeNow)
            .lerp(flameC, wait * 0.6)
            .lerp(coreC, Math.min(1, pg + flare));
          p.hidden.color.copy(edgeNow);
        });
        if (e.column) {
          e.column.material.color.set(awake ? C.flame : C.chalk);
          e.column.material.opacity = awake ? 0.38 * br : 0.1 + 0.04 * Math.sin(t * 0.8);
        }
        e.aimG.rotation.y += (e.ang - e.aimG.rotation.y) * Math.min(1, dt * 10);
        e.aim.material.opacity = e.glow * 0.85;
      } else {
        e.glow += ((awake ? 1 : 0) - e.glow) * Math.min(1, dt * 1.2);
        e.win.material.opacity = 0.95 * e.glow * m;
        e.sp.material.opacity = Math.min(1, 0.55 * e.glow * m + flare);
        e.sp.scale.setScalar(1.4 * (1 + 1.4 * flare));
        e.pl.intensity = 1.6 * e.glow * m + flare * 4;
      }
    }
  }
}
function collect(e) {
  inv[e.type] = (inv[e.type] || 0) + 1;
  seen.add(e.type);
  removeEnt(e);
  dirty = true;
  refreshTray();
  landPulse(e.type);
  for (let i = 0; i < 10; i++)
    setTimeout(
      () =>
        mote(
          e.cx + 0.5 + (Math.random() - 0.5) * 0.4,
          0.5,
          e.cz + 0.5 + (Math.random() - 0.5) * 0.4,
          0,
          TYPES[e.type].lift,
        ),
      i * 50,
    );
  cels.push({ x: e.cx + 0.5, z: e.cz + 0.5, t0: t, dur: 1.2, r: 1.4, big: 0 });
}

/* ---------- the first stretch: drift the camera gently onward after each wake ---------- */
let glide = null;
function glideTo(v, dur = 2.6) {
  glide = { from: camT.clone(), to: v.clone(), t0: t, dur };
}
let great = null;
function spawnGreat(fx, fz) {
  const a = (Math.random() - 0.5) * 1.6,
    dist = terrParams(terr).dist + Math.random() * 6;
  const tx = Math.round(fx + Math.sin(a) * dist),
    tz = Math.round(fz - Math.cos(a) * dist);
  // the nearest spot where the great beacon and all its helper lanes avoid anything permanent
  let site = null;
  for (let r = 0; r < 10 && !site; r++)
    for (let i = -r; i <= r && !site; i++)
      for (let j = -r; j <= r && !site; j++) {
        const x = tx + i,
          z = tz + j;
        if (helperCells(x, z).every(([u, v]) => !permanent(u, v))) site = [x, z];
      }
  site ??= [tx, tz];
  for (let u = -1; u <= 1; u++)
    for (let v = -1; v <= 1; v++) {
      const o = cells.get(key(site[0] + u, site[1] + v));
      if (o && !permanent(o.cx, o.cz)) removeEnt(o);
    }
  const e = makeBeacon(site[0], site[1], false, 3, null, true);
  e.born = t;
  great = e;
  routeTo(fx, fz, e);
  dirty = true;
}

/* ---------- routes: solvable by construction ----------
   Stepping-stone beacons lead from a lit beacon to three helpers set in line with the great beacon.
   Each hop is an L-shaped lane needing at most one prism (at its corner); lanes never cross anything
   permanent (lit beacons, placed cubes, lanterns, other routes) and are reserved so scatter can't block them. */
const permanent = (x, z) => {
  const o = cells.get(key(x, z));
  return !!o && (o.kind === 'cube' || o.kind === 'source' || o.woken || o.great || o.route);
};
function runCells(x1, z1, x2, z2) {
  const out = [[x1, z1]];
  let x = x1,
    z = z1;
  while (x !== x2 || z !== z2) {
    if (x !== x2) x += Math.sign(x2 - x1);
    else z += Math.sign(z2 - z1);
    out.push([x, z]);
  }
  return out;
}
// cells of an L-shaped lane P → corner → N, without its two ends
const laneCells = (P, C, N) => [...runCells(...P, ...C).slice(1), ...runCells(...C, ...N).slice(1, -1)];
const laneClear = (P, C, N) => laneCells(P, C, N).every(([x, z]) => !permanent(x, z));
function helperLayout(gx, gz) {
  const S1 = [gx, gz + 4],
    S2 = [gx - 4, gz],
    S3 = [gx + 4, gz],
    G = [gx, gz];
  return {
    S1,
    S2,
    S3,
    lanes: [
      [S1, S1, G],
      [S2, S2, G],
      [S3, S3, G],
      [S1, [S2[0], S1[1]], S2],
      [S1, [S3[0], S1[1]], S3],
    ],
  };
}
function helperCells(gx, gz) {
  const L = helperLayout(gx, gz);
  return [L.S1, L.S2, L.S3, ...L.lanes.flatMap((l) => laneCells(...l))];
}
function keepClear(x, z) {
  reserved.add(key(x, z));
  if (!permanent(x, z)) {
    const o = cells.get(key(x, z));
    if (o) removeEnt(o);
  }
}
const clearLane = (P, C, N) => [P, ...laneCells(P, C, N), N].forEach(([x, z]) => keepClear(x, z));
function stone(x, z) {
  keepClear(x, z);
  const o = cells.get(key(x, z));
  if (o) return o;
  const b = makeBeacon(x, z, false, 1);
  b.reach = 10;
  b.route = true;
  b.born = t;
  return b;
}
// the next hop from P toward the target T: a stone within 4 cells each way, reached through a clear lane
function nextHop(P, T, last) {
  const step = (d) => Math.sign(d) * Math.min(4, Math.abs(d));
  const base = last ? T : [P[0] + step(T[0] - P[0]), P[1] + step(T[1] - P[1])];
  const offsets = last
    ? [[0, 0]]
    : [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ];
  for (const [ox, oz] of offsets) {
    const N = [base[0] + ox, base[1] + oz];
    if (Math.abs(N[0] - P[0]) > 4 || Math.abs(N[1] - P[1]) > 4 || (N[0] === P[0] && N[1] === P[1])) continue;
    if (!last && (permanent(...N) || reserved.has(key(...N)))) continue; // never inside another lane
    for (const C of [
      [N[0], P[1]],
      [P[0], N[1]],
    ])
      if (laneClear(P, C, N)) return { at: N, via: C };
  }
  return null;
}
function routeTo(fx, fz, G) {
  const { S1, S2, S3, lanes } = helperLayout(G.cx, G.cz);
  for (const l of lanes) clearLane(...l);
  for (const S of [S1, S2, S3]) stone(...S);
  const route = [{ at: [fx, fz] }]; // G.route: the hops in order, each with the corner its prism goes on
  let P = [fx, fz];
  for (let guard = 0; guard < 40; guard++) {
    const last = Math.abs(S1[0] - P[0]) <= 4 && Math.abs(S1[1] - P[1]) <= 4;
    const hop = nextHop(P, S1, last) || (last && nextHop(P, S1, false));
    if (!hop) break; // should not happen; the safety valve and the solver (next) cover it
    clearLane(P, hop.via, hop.at);
    stone(...hop.at);
    route.push(hop);
    if (route.length % 2 === 0) {
      const c = nearestFree(P[0] + 0.5, P[1] + 1.7);
      if (c && !reserved.has(key(...c))) makeGift(...c, 'prism').born = t;
    }
    P = hop.at;
    if (P[0] === S1[0] && P[1] === S1[1]) break;
  }
  G.route = route;
  G.helpers = [S1, S2, S3];
  G.routed = true;
}
function onWake(e) {
  if (e.great) {
    terr++;
    setTimeout(() => spawnGreat(e.cx, e.cz), 2600);
  }
  const nx = { L1: 2, L2: 3, L3: 4 }[e.tag];
  if (nx) setTimeout(() => advance(nx), 1500);
  if (e.tag === 'L4') {
    firstDone = true;
    hints = [];
    setTimeout(() => spawnGreat(e.cx, e.cz), 1800);
    setTimeout(() => {
      edgesEl.classList.add('on');
      ui.forEach((el) => el.classList.remove('off'));
    }, 2500);
  }
}
function glideTick() {
  if (!glide) return;
  const a = clamp01((t - glide.t0) / glide.dur);
  camT.lerpVectors(glide.from, glide.to, easeIO(a));
  if (a >= 1) glide = null;
}

/* rare breaks, after the first stretch: never your last cube of a kind */
let nextBreak = 1e9;
function breakTick() {
  if (!firstDone) return;
  const iv = () => (140 + Math.random() * 80) / terrParams(terr).brk;
  if (nextBreak > 1e8) nextBreak = t + iv();
  if (t < nextBreak) return;
  nextBreak = t + iv();
  const placed = ents.filter((e) => e.kind === 'cube' && !e.broken && !e.fixed && e.active);
  const c = placed.filter((e) => placed.filter((o) => o.type === e.type).length + (inv[e.type] || 0) > 1);
  if (c.length) {
    const e = c[Math.floor(Math.random() * c.length)];
    e.broken = true;
    e.breakT = t;
    e.wigT = t;
    dirty = true;
    for (let i = 0; i < 10; i++)
      mote(
        e.cx + 0.5 + (Math.random() - 0.5) * 0.6,
        0.2 + Math.random() * 0.6,
        e.cz + 0.5 + (Math.random() - 0.5) * 0.6,
        0,
        C.fault,
      );
  }
}

/* safety valve: if you're nearly out of cubes, a prism gift appears near you */
let nextValve = 0;
function valveTick() {
  if (!firstDone || t < nextValve) return;
  nextValve = t + 20;
  const own =
    Object.values(inv).reduce((a, b) => a + b, 0) +
    ents.filter((e) => e.kind === 'cube' && !e.fixed && !e.broken).length;
  if (own >= 2 || ents.some((e) => e.kind === 'gift' && Math.hypot(e.cx - camT.x, e.cz - camT.z) < 9)) return;
  const c = nearestFree(camT.x + (Math.random() - 0.5) * 4, camT.z + (Math.random() - 0.5) * 4);
  if (c) {
    const g2 = makeGift(...c, 'prism');
    g2.born = t;
    dirty = true;
  }
}

/* ---------- tray ---------- */
let tool = 'prism';
const toolBtns = [...document.querySelectorAll('.tool')],
  trayEl = document.getElementById('tray');
function refreshTray() {
  for (const b of toolBtns) {
    const ty = b.dataset.t,
      n = inv[ty] || 0;
    b.hidden = !seen.has(ty);
    b.querySelector('.dots').innerHTML = '<i></i>'.repeat(Math.min(n, 8));
    b.classList.toggle('empty', n === 0);
  }
  if (!(inv[tool] > 0)) tool = Object.keys(inv).find((k) => inv[k] > 0) || tool;
  for (const b of toolBtns) b.setAttribute('aria-pressed', b.dataset.t === tool && inv[tool] > 0);
  updateGhost();
}
function landPulse(type) {
  const b = toolBtns.find((b) => b.dataset.t === type);
  if (!b) return;
  b.classList.remove('land');
  void b.offsetWidth;
  b.classList.add('land');
}

/* ---------- picking ---------- */
const ghost = new THREE.Group();
const ghostEdges = new THREE.LineSegments(
  boxEdges,
  new THREE.LineBasicMaterial({ color: C.flame, transparent: true, opacity: 0.75, depthWrite: false }),
);
ghostEdges.renderOrder = 8;
const ghostMark = new THREE.LineSegments(
  TYPES.prism.mark,
  new THREE.LineBasicMaterial({ color: C.flame, transparent: true, opacity: 0.75 }),
);
ghostMark.renderOrder = 8;
ghost.add(ghostEdges, ghostMark);
ghost.scale.setScalar(0.8);
ghost.visible = false;
scene.add(ghost);
const hov = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([x, z]) => new THREE.Vector3(x, 0.025, z)),
  ),
  new THREE.LineBasicMaterial({ color: C.flame, transparent: true, opacity: 0.8 }),
);
hov.visible = false;
scene.add(hov);
let ghostCell = null,
  ghostType = null;
function updateGhost() {
  const ty = ghostType || tool;
  if (!ghostCell || !ty || !free(...ghostCell)) {
    ghost.visible = false;
    if (!dragE) hov.visible = false;
    return;
  }
  ghostMark.geometry = TYPES[ty].mark;
  ghostMark.material.color.set(TYPES[ty].lift);
  ghostEdges.material.color.set(TYPES[ty].lift);
  hov.material.color.set(TYPES[ty].lift);
  ghost.position.set(ghostCell[0] + 0.5, 0.4, ghostCell[1] + 0.5);
  ghost.visible = true;
  hov.position.set(ghostCell[0], 0, ghostCell[1]);
  hov.visible = true;
}
const ray = new THREE.Raycaster(),
  ndc = new THREE.Vector2(),
  hp = new THREE.Vector3(),
  PL = (h) => new THREE.Plane(new THREE.Vector3(0, 1, 0), -h),
  pv = new THREE.Vector3();
function rayAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function groundAt(x, y) {
  rayAt(x, y);
  if (!ray.ray.intersectPlane(PL(0), hp)) return null;
  return { cell: [Math.floor(hp.x), Math.floor(hp.z)], x: hp.x, z: hp.z };
}
function toScreen(x, y, z) {
  pv.set(x, y, z).project(camera);
  return [((pv.x + 1) / 2) * innerWidth, ((1 - pv.y) / 2) * innerHeight];
}
function thingAt(x, y, kinds, reach = 34) {
  rayAt(x, y);
  for (const h of [1.3, 1.0, 0.7, 0.4]) {
    if (!ray.ray.intersectPlane(PL(h), hp)) continue;
    const e = cells.get(key(Math.floor(hp.x), Math.floor(hp.z)));
    if (e && kinds(e) && e.h >= h) return e;
  }
  let best = null,
    bd = reach;
  for (const e of ents) {
    if (!kinds(e)) continue;
    const [sx, sy] = toScreen(e.cx + 0.5, 0.45, e.cz + 0.5);
    const d = Math.hypot(sx - x, sy - y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}
const isCube = (e) => e.kind === 'cube',
  isAimable = (e) => e.kind === 'beacon' && e.woken && e.g.visible;
const overTray = (x, y) => {
  const r = trayEl.getBoundingClientRect();
  return x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 14 && y <= r.bottom + 6;
};
const movable = (e) => !e.fixed || e.broken;

/* ---------- selection ---------- */
const selEl = document.getElementById('sel'),
  selRot = document.getElementById('selRot'),
  selBack = document.getElementById('selBack');
const ICON_BACK = selBack.innerHTML,
  ICON_DISCARD = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
function select(e) {
  selE = e;
  selEl.classList.toggle('on', !!e);
  if (!e) return;
  selRot.style.display = e.fixed ? 'none' : '';
  selBack.style.display = movable(e) ? '' : 'none';
  selBack.innerHTML = e.broken ? ICON_DISCARD : ICON_BACK;
}
function placeSel() {
  if (!selE || selE.dragging || !ents.includes(selE)) {
    selEl.classList.remove('on');
    return;
  }
  selEl.classList.add('on');
  const [sx, sy] = toScreen(selE.cx + 0.5, 1.1, selE.cz + 0.5);
  const off = Math.min(52, innerWidth * 0.13);
  let lx = sx - off,
    rx = sx + off;
  if (lx < 30) {
    rx += 30 - lx;
    lx = 30;
  }
  if (rx > innerWidth - 30) {
    lx -= rx - (innerWidth - 30);
    rx = innerWidth - 30;
  }
  const one = selRot.style.display === 'none' || selBack.style.display === 'none';
  selRot.style.left = (one ? sx : lx) + 'px';
  selRot.style.top = sy - 24 + 'px';
  selBack.style.left = (one ? sx : rx) + 'px';
  selBack.style.top = sy - 24 + 'px';
}
function turn(e) {
  if (e.fixed) return;
  e.rot = (e.rot + 1) & 3;
  e.ang -= Math.PI / 2;
  dirty = true;
}
function takeBack(e) {
  if (!movable(e)) return;
  if (selE === e) select(null);
  if (e.broken) {
    for (let i = 0; i < 8; i++)
      mote(
        e.cx + 0.5 + (Math.random() - 0.5) * 0.5,
        0.3,
        e.cz + 0.5 + (Math.random() - 0.5) * 0.5,
        0,
        C.fault,
      );
    removeEnt(e);
    dirty = true;
    return;
  } // broken: discarded, not returned
  inv[e.type] = (inv[e.type] || 0) + 1;
  removeEnt(e);
  dirty = true;
  refreshTray();
  landPulse(e.type);
}
selRot.addEventListener('click', () => {
  if (selE) turn(selE);
});
selBack.addEventListener('click', () => {
  if (selE) takeBack(selE);
});
function place(type, cell) {
  if (!(inv[type] > 0) || !free(...cell)) return;
  const h = curHint();
  const r = h && h.cell && h.cell[0] === cell[0] && h.cell[1] === cell[1] && h.type === type ? h.rot : 0;
  const e = makeCube(type, ...cell, r);
  e.spinT = t;
  inv[type]--;
  dirty = true;
  refreshTray();
}

/* ---------- gestures: drag a cube moves it; drag ground pans; two fingers tilt ---------- */
const pts = new Map();
let g = null,
  manualEl = 0,
  sensorEl = null,
  beta0 = null;
const lift = (pt) => (pt === 'mouse' ? 0 : 44);
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
const centroid = () => {
  const p = [...pts.values()];
  return [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2];
};
canvas.addEventListener(
  'wheel',
  (ev) => {
    ev.preventDefault();
    manualEl = Math.max(0, Math.min(EL_MAX - EL_SITE, manualEl + ev.deltaY * 0.0018));
  },
  { passive: false },
);
canvas.addEventListener('pointerdown', (ev) => {
  if (intro.state === 'transit') {
    skipIntro();
    return;
  }
  if (intro.state !== 'play') return;
  canvas.setPointerCapture(ev.pointerId);
  pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
  glide = null;
  lastAct = t;
  if (pts.size === 2) {
    if (g && g.drag) endDrag(null);
    const c = centroid(),
      h = groundAt(...c);
    g = { two: true, gx: h && h.x, gz: h && h.z };
    return;
  }
  if (pts.size > 2) return;
  const gr = groundAt(ev.clientX, ev.clientY);
  const grab = thingAt(
    ev.clientX,
    ev.clientY,
    (e) => isCube(e) && movable(e),
    ev.pointerType === 'mouse' ? 30 : 50,
  ); // generous: near a cube = holding the cube
  const stuck = grab
    ? null
    : thingAt(
        ev.clientX,
        ev.clientY,
        (e) => e.kind !== 'gift' && e.g.visible && (e.kind !== 'cube' || !movable(e)),
        36,
      );
  g = {
    x: ev.clientX,
    y: ev.clientY,
    pt: ev.pointerType,
    mouseRight: ev.pointerType === 'mouse' && ev.button === 2,
    grab,
    stuck,
    cube: grab || thingAt(ev.clientX, ev.clientY, isCube),
    beacon: thingAt(ev.clientX, ev.clientY, isAimable, 28),
    moved: false,
    gx: gr && gr.x,
    gz: gr && gr.z,
  };
});
canvas.addEventListener('pointermove', (ev) => {
  if (pts.has(ev.pointerId)) pts.set(ev.pointerId, [ev.clientX, ev.clientY]);
  if (g && g.two) {
    if (pts.size < 2 || g.gx == null) return;
    const h = groundAt(...centroid());
    if (h) {
      camT.x += g.gx - h.x;
      camT.z += g.gz - h.z;
      applyCam();
    }
    return;
  }
  if (!g) {
    if (ev.pointerType === 'mouse' && intro.state === 'play' && !trayDrag) {
      const h = groundAt(ev.clientX, ev.clientY);
      ghostCell =
        h && free(...h.cell) && !thingAt(ev.clientX, ev.clientY, isCube, 0) && inv[tool] > 0 ? h.cell : null;
      ghostType = null;
      updateGhost();
    }
    return;
  }
  if (!g.moved && Math.hypot(ev.clientX - g.x, ev.clientY - g.y) > 7) {
    g.moved = true;
    if (g.grab) startDrag(g.grab);
    else if (g.stuck)
      g.stuck.wigT = t; // can't be moved: a small wiggle says so
    else if (g.mouseRight)
      g.pan = true; // mouse: right-drag moves the map
    else {
      const hh = curHint(),
        ty = hh && hh.cell ? hh.type : tool,
        h = groundAt(g.x, g.y); // one finger on empty ground: pull a cube from the tray
      if (inv[ty] > 0 && h) {
        const c = nearestFree(h.x, h.z);
        if (c) {
          const e = makeCube(ty, ...c, 0);
          inv[ty]--;
          refreshTray();
          startDrag(e);
        }
      } else if (!(inv[ty] > 0)) g.pan = true;
    }
  }
  g.lx = ev.clientX;
  g.ly = ev.clientY;
  if (g.drag) moveDrag(ev.clientX, ev.clientY - lift(g.pt));
  else if (g.pan && g.gx != null) {
    const h = groundAt(ev.clientX, ev.clientY);
    if (h) {
      camT.x += g.gx - h.x;
      camT.z += g.gz - h.z;
      applyCam();
    }
  }
});
canvas.addEventListener('pointerup', (ev) => {
  pts.delete(ev.pointerId);
  if (!g) return;
  if (g.two) {
    if (pts.size === 0) g = null;
    return;
  }
  const G = g;
  g = null;
  if (G.drag) {
    endDrag(ev);
    return;
  }
  if (G.moved) return;
  const x = ev.clientX,
    y = ev.clientY,
    h = groundAt(x, y);
  if (G.cube) {
    const e = G.cube;
    if (selE === e) turn(e);
    else select(e);
    ghostCell = null;
    updateGhost();
    return;
  }
  if (G.beacon) {
    const e = G.beacon;
    e.rot = (e.rot + 1) & 3;
    e.ang -= Math.PI / 2;
    dirty = true;
    select(null);
    return;
  } // aim a woken beacon
  if (selE) {
    select(null);
  }
  if (!h) return;
  ghostCell = null;
  updateGhost();
  if (G.stuck) {
    G.stuck.wigT = t;
    nudge(h.x, h.z);
    return;
  }
  {
    const m = Math.min(70, innerWidth * 0.15),
      hh0 = curHint(),
      nearHint = hh0 && hh0.cell && Math.hypot(h.x - hh0.cell[0] - 0.5, h.z - hh0.cell[1] - 0.5) < 2.6;
    const ex = x < m ? -1 : x > innerWidth - m ? 1 : 0,
      ey = y < m + 40 ? 1 : y > trayEl.getBoundingClientRect().top - 50 ? -1 : 0;
    if ((ex || ey) && !nearHint && G.pt !== 'mouse') {
      const v = camT
        .clone()
        .addScaledVector(SCR_RIGHT, ex * 2.6)
        .addScaledVector(SCR_UP, ey * 3.2);
      glideTo(v, 0.9);
      nudge(h.x, h.z);
      return;
    }
  }
  const hh = curHint();
  if (hh && hh.cell) {
    // first stretch: any tap near the glowing spot puts the cube there
    if (inv[hh.type] > 0 && Math.hypot(h.x - hh.cell[0] - 0.5, h.z - hh.cell[1] - 0.5) < 2.6)
      place(hh.type, hh.cell);
    else nudge(h.x, h.z);
    return;
  }
  if (hh) {
    nudge(h.x, h.z);
    return;
  }
  if (free(...h.cell) && inv[tool] > 0) {
    place(tool, h.cell);
    return;
  } // one tap places, everywhere
  nudge(h.x, h.z);
});
canvas.addEventListener('pointercancel', (ev) => {
  pts.delete(ev.pointerId);
  if (g && g.drag) endDrag(null);
  g = null;
});
let dragE = null,
  dragCell = null;
function startDrag(e) {
  dragE = e;
  e.dragging = true;
  dragCell = [e.cx, e.cz];
  cells.delete(key(e.cx, e.cz));
  dirty = true;
  select(e);
  g.drag = true;
  ghostCell = null;
  updateGhost();
}
function nearestFree(x, z) {
  let best = null,
    bd = 9;
  const cx = Math.floor(x),
    cz = Math.floor(z);
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) {
      const a = cx + i,
        b = cz + j;
      if (!free(a, b)) continue;
      const d = Math.hypot(a + 0.5 - x, b + 0.5 - z);
      if (d < bd) {
        bd = d;
        best = [a, b];
      }
    }
  return best;
}
function snapCell(x, z, type) {
  const hh = curHint();
  if (
    hh &&
    hh.cell &&
    hh.type === type &&
    free(...hh.cell) &&
    Math.hypot(x - hh.cell[0] - 0.5, z - hh.cell[1] - 0.5) < 2.2
  )
    return hh.cell;
  return nearestFree(x, z);
}
function edgeScroll(dt) {
  if (!g || !g.drag || g.lx == null) return;
  const m = 56,
    x = g.lx,
    y = g.ly;
  let ex = x < m ? -(1 - x / m) : x > innerWidth - m ? 1 - (innerWidth - x) / m : 0,
    ey = y < m + 30 ? -(1 - (y - 30) / m) : 0;
  ex = Math.max(-1, Math.min(1, ex));
  ey = Math.max(-1, Math.min(1, ey));
  if (!ex && !ey) return;
  const sp = 6 * dt;
  camT.addScaledVector(SCR_RIGHT, ex * sp).addScaledVector(SCR_UP, (-ey * sp) / Math.sin(EL));
  applyCam();
  moveDrag(x, y - lift(g.pt));
}
function moveDrag(x, y) {
  const h0 = groundAt(x, y),
    c = h0 && snapCell(h0.x, h0.z, dragE.type),
    h = c && { cell: c, x: h0.x, z: h0.z };
  if (h) {
    dragCell = h.cell;
    dragE.g.position.set(h.cell[0] + 0.5, 0, h.cell[1] + 0.5);
    hov.position.set(h.cell[0], 0, h.cell[1]);
    hov.material.color.copy(dragE.lift);
    hov.visible = true;
  } else {
    dragCell = null;
    hov.visible = false;
    if (h) dragE.g.position.set(h.x, 0, h.z);
  }
}
function endDrag(ev) {
  const e = dragE;
  dragE = null;
  if (!e) return;
  e.dragging = false;
  hov.visible = false;
  if (ev && overTray(ev.clientX, ev.clientY)) {
    cells.set(key(e.cx, e.cz), e);
    takeBack(e);
    return;
  }
  if (dragCell) {
    e.cx = dragCell[0];
    e.cz = dragCell[1];
  }
  const hh = curHint();
  if (hh && hh.cell && hh.type === e.type && hh.cell[0] === e.cx && hh.cell[1] === e.cz && e.rot !== hh.rot) {
    e.ang -= (((hh.rot - e.rot + 4) & 3) * Math.PI) / 2;
    e.rot = hh.rot;
  }
  e.g.position.set(e.cx + 0.5, 0, e.cz + 0.5);
  cells.set(key(e.cx, e.cz), e);
  dirty = true;
}

let trayDrag = null;
for (const b of toolBtns) {
  b.addEventListener('pointerdown', (ev) => {
    if (intro.state !== 'play' || !(inv[b.dataset.t] > 0)) return;
    trayDrag = { type: b.dataset.t, x: ev.clientX, y: ev.clientY, pt: ev.pointerType, started: false };
    b.setPointerCapture(ev.pointerId);
  });
  b.addEventListener('pointermove', (ev) => {
    if (!trayDrag) return;
    if (!trayDrag.started && Math.hypot(ev.clientX - trayDrag.x, ev.clientY - trayDrag.y) > 10) {
      trayDrag.started = true;
      select(null);
    }
    if (trayDrag.started) {
      const h = groundAt(ev.clientX, ev.clientY - lift(trayDrag.pt));
      ghostType = trayDrag.type;
      ghostCell = h && !overTray(ev.clientX, ev.clientY) ? snapCell(h.x, h.z, trayDrag.type) : null;
      updateGhost();
    }
  });
  b.addEventListener('pointerup', (ev) => {
    const d = trayDrag;
    trayDrag = null;
    if (!d) {
      return;
    }
    if (!d.started) {
      tool = d.type;
      refreshTray();
      return;
    }
    const cell = ghostCell;
    ghostCell = null;
    ghostType = null;
    if (cell) place(d.type, cell);
    tool = d.type;
    refreshTray();
  });
  b.addEventListener('pointercancel', () => {
    trayDrag = null;
    ghostCell = null;
    ghostType = null;
    updateGhost();
  });
}
const sys = document.getElementById('sys');
document.getElementById('sysBtn').onclick = () => sys.classList.toggle('on');
const wipe = () => {
  wiping = true;
  try {
    localStorage.removeItem(SAVE);
  } catch (_) {}
  saved = null;
  lastSave = 1e9;
  location.reload();
};
document.getElementById('resetBtn').onclick = wipe;
const confirmEl = document.getElementById('confirm');
document.getElementById('restartBtn').onclick = () => {
  confirmEl.classList.toggle('on');
  sys.classList.remove('on');
};
document.getElementById('keepBtn').onclick = () => confirmEl.classList.remove('on');
document.getElementById('clearBtn').onclick = wipe;

/* desktop: keys and cursor */
addEventListener('keydown', (ev) => {
  if (intro.state !== 'play') return;
  const k = ev.key;
  if (selE && (k === 'r' || k === 'R' || k === ' ')) {
    turn(selE);
    ev.preventDefault();
    return;
  }
  if (selE && (k === 'Backspace' || k === 'Delete')) {
    takeBack(selE);
    ev.preventDefault();
    return;
  }
  if (k === 'Escape') {
    select(null);
    return;
  }
  const m = {
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    w: [0, 1],
    s: [0, -1],
    a: [-1, 0],
    d: [1, 0],
  }[k];
  if (m) {
    glide = null;
    camT.addScaledVector(SCR_RIGHT, m[0] * 1.4).addScaledVector(SCR_UP, m[1] * 1.8);
    ev.preventDefault();
  }
});
canvas.addEventListener('pointermove', (ev) => {
  if (ev.pointerType !== 'mouse') return;
  canvas.style.cursor = dragE
    ? 'grabbing'
    : thingAt(ev.clientX, ev.clientY, (e) => isCube(e) && movable(e), 0)
      ? 'grab'
      : thingAt(ev.clientX, ev.clientY, isAimable, 0)
        ? 'pointer'
        : 'default';
});

/* edge arrows: the map is open */
const edgesEl = document.getElementById('edges');
function placeEdges() {
  const b = edgesEl.querySelectorAll('button'),
    trayTop = trayEl.getBoundingClientRect().top || innerHeight - 80;
  const pos = {
    up: [innerWidth / 2, 64],
    down: [innerWidth / 2, trayTop - 30],
    left: [26, innerHeight / 2],
    right: [innerWidth - 26, innerHeight / 2],
  };
  b.forEach((el) => {
    const [x, y] = pos[el.dataset.d];
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  });
}
edgesEl.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  const d = b.dataset.d,
    s = half * 0.9;
  const v = camT.clone();
  if (d === 'up') v.addScaledVector(SCR_UP, s * 1.6);
  if (d === 'down') v.addScaledVector(SCR_UP, -s * 1.6);
  if (d === 'right') v.addScaledVector(SCR_RIGHT, s);
  if (d === 'left') v.addScaledVector(SCR_RIGHT, -s);
  glideTo(v, 1.6);
});

/* ---------- phone tilt ---------- */
function onOrient(e) {
  if (e.beta == null) return;
  if (beta0 == null) beta0 = Math.max(30, Math.min(80, e.beta));
  sensorEl = (EL_MAX - EL_SITE) * (1 - clamp01(e.beta / beta0));
}
function enableTilt() {
  if (reduce) return;
  const D = window.DeviceOrientationEvent;
  if (!D) return;
  try {
    if (typeof D.requestPermission === 'function')
      D.requestPermission()
        .then((s) => {
          if (s === 'granted') addEventListener('deviceorientation', onOrient);
        })
        .catch(() => {});
    else addEventListener('deviceorientation', onOrient);
  } catch (_) {}
}
let elHeld = EL_SITE;
function tiltTick(dt) {
  let goal = Math.min(EL_MAX, EL_SITE + (sensorEl ?? 0) + manualEl);
  const fingerDown = g && !g.two && !g.drag;
  if (fingerDown) goal = elHeld;
  else elHeld = goal;
  if (dragE || (trayDrag && trayDrag.started)) goal = lerp(goal, EL_MAX, 0.5);
  EL += (goal - EL) * Math.min(1, dt * (reduce ? 6 : 3));
}

/* ---------- entrance: the homepage cube becomes the first lantern ---------- */
const intro = { state: 'home', t0: 0 };
const ui = ['hud', 'top'].map((id) => document.getElementById(id));
const dayHemiC = new THREE.Color(0xffffff),
  nightHemiC = new THREE.Color(0xb8c4d6),
  dayGC = new THREE.Color(0xc9d0c4),
  nightGC = new THREE.Color(0x2a3038),
  daySunC = new THREE.Color(0xffffff),
  nightSunC = new THREE.Color(0xc9d4e4),
  duskC = new THREE.Color(C.dusk);
function setDay(d) {
  U.day.value = d;
  hemi.intensity = lerp(0.75, 2.1, d);
  hemi.color.lerpColors(nightHemiC, dayHemiC, d);
  hemi.groundColor.lerpColors(nightGC, dayGC, d);
  sun.intensity = lerp(0.35, 1.3, d);
  sun.color.lerpColors(nightSunC, daySunC, d);
  tmp.lerpColors(duskC, groundC, d);
  renderer.setClearColor(tmp);
  document.body.style.background = '#' + tmp.getHexString();
}
const homeCube = glass(C.ocean, 0.46);
homeCube.own = true;
scene.add(homeCube.g);
function homeSpot() {
  const a = innerWidth / innerHeight;
  return camT
    .clone()
    .addScaledVector(SCR_RIGHT, a > 1.05 ? half * a * 0.3 : 0)
    .addScaledVector(SCR_UP, a > 1.05 ? 0 : -1.8)
    .add(new THREE.Vector3(0, 0.95, 0));
}
let flyFrom = null;
function beginEntrance() {
  if (intro.state !== 'home') return;
  enableTilt();
  intro.state = 'transit';
  intro.t0 = t;
  flyFrom = homeCube.g.position.clone();
}
setTimeout(beginEntrance, 500); // the homepage's "Light" link brings you here; the entrance plays by itself
const hideAtHome = [];
function introTick() {
  if (intro.state === 'home') {
    half = homeHalf();
    homeCube.g.position.copy(homeSpot());
    homeCube.g.scale.setScalar(1.9);
    homeCube.g.rotation.y = 0.05 * Math.sin(t * 0.4);
    return;
  }
  if (intro.state !== 'transit') return;
  const a = t - intro.t0,
    c = easeIO(clamp01((a - 0.3) / 2.6));
  setDay(1 - c);
  half = lerp(homeHalf(), firstDone ? gameHalf() : tutHalf, c);
  const f = easeIO(clamp01((a - 1.0) / 2.2)),
    to =
      saved || !lantern0
        ? new THREE.Vector3(camT.x, 0.3, camT.z)
        : new THREE.Vector3(lantern0.cx + 0.5, lantern0.sz / 2, lantern0.cz + 0.5);
  homeCube.g.position.lerpVectors(flyFrom, to, f);
  homeCube.g.position.y += Math.sin(f * Math.PI) * 1.1;
  homeCube.g.scale.setScalar(lerp(1.9, saved ? 0.05 : lantern0.sz, f));
  homeCube.g.rotation.y = reduce ? 0 : Math.PI * 2 * easeOut(f); // one spin, like the site
  homeCube.surface.color.copy(oceanC).lerp(groundC, clamp01((f - 0.6) / 0.4));
  homeCube.surface.opacity = lerp(0.46, 0.16, clamp01((f - 0.6) / 0.4));
  homeCube.surface.emissive.copy(flameC).multiplyScalar(0.3 * clamp01((f - 0.75) / 0.25));
  if (a > 2.4) for (const e of hideAtHome) e.g.visible = true;
  if (a >= 3.25 && homeCube.g.visible) {
    homeCube.g.visible = false;
    if (lantern0 && !saved) {
      lantern0.g.visible = true;
      lantern0.on = t;
    }
    dirty = true;
    const mp =
      saved || !lantern0 ? [camT.x, 0.3, camT.z] : [lantern0.cx + 0.5, lantern0.sz * 0.6, lantern0.cz + 0.5];
    for (let i = 0; i < 8; i++) setTimeout(() => mote(...mp, 0), i * 80);
  }
  if (a >= 3.9) startPlay();
}
function startPlay() {
  if (intro.state === 'play') return;
  intro.state = 'play';
  if (!firstDone) frameStep(1, 1.2);
  setDay(0);
  homeCube.g.visible = false;
  forgetGlass(homeCube.g);
  for (const e of hideAtHome) e.g.visible = true;
  for (const e of ents)
    if (e.kind === 'source') {
      e.g.visible = true;
      if (e.on < 0) e.on = t;
    }
  dirty = true;
  if (firstDone) {
    edgesEl.classList.add('on');
    ui.forEach((el) => el.classList.remove('off'));
    if (!great) spawnGreat(Math.round(camT.x), Math.round(camT.z));
  }
  trayEl.classList.remove('off');
  refreshTray();
  setTimeout(() => landPulse('prism'), 300);
}
function skipIntro() {
  intro.t0 = t - 3.9;
}

/* ---------- beam preview: where would the light go if the cube were here? ---------- */
const pvMat = new THREE.LineDashedMaterial({
  color: C.flame,
  transparent: true,
  opacity: 0.6,
  dashSize: 0.16,
  gapSize: 0.12,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const pvLines = new THREE.LineSegments(new THREE.BufferGeometry(), pvMat);
pvLines.renderOrder = 8;
pvLines.frustumCulled = false;
scene.add(pvLines);
let pvKey = '';
function preview(type, cell, rot) {
  const k = type + '|' + cell + '|' + rot;
  if (k === pvKey) return;
  pvKey = k;
  const ck = key(...cell),
    had = cells.get(ck);
  if (had && !had.dragging) {
    pvLines.visible = false;
    return;
  }
  const fake = {
    kind: 'cube',
    type,
    rot,
    cx: cell[0],
    cz: cell[1],
    preview: true,
    inS: 0,
    visits: 0,
    arr: 1e9,
    inputs: [],
  };
  cells.set(ck, fake);
  let B = [];
  try {
    B = trace(true);
  } finally {
    if (had) cells.set(ck, had);
    else cells.delete(ck);
  }
  const a = [];
  for (const b of B)
    for (let i = 0; i < b.pts.length - 1; i++) {
      const [x1, z1] = b.pts[i],
        [x2, z2] = b.pts[i + 1];
      a.push(x1, 0.09, z1, x2, 0.09, z2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
  pvLines.geometry.dispose();
  pvLines.geometry = g;
  pvLines.computeLineDistances();
  pvLines.visible = a.length > 0;
}
let lastAct = 0;
function previewTick() {
  if (dragE && dragCell) {
    const hh = curHint();
    let rot = dragE.rot;
    if (hh && hh.cell && hh.type === dragE.type && hh.cell[0] === dragCell[0] && hh.cell[1] === dragCell[1])
      rot = hh.rot;
    preview(dragE.type, dragCell, rot);
    pvMat.opacity = 0.65;
    return;
  }
  if (trayDrag && trayDrag.started && ghostCell) {
    const hh = curHint();
    const rot = hh && hh.cell && hh.cell[0] === ghostCell[0] && hh.cell[1] === ghostCell[1] ? hh.rot : 0;
    preview(trayDrag.type, ghostCell, rot);
    pvMat.opacity = 0.65;
    return;
  }
  // stuck in the first stretch for a while: show where the light would go from the glowing spot
  const hh = intro.state === 'play' ? curHint() : null;
  if (hh && hh.cell && t - lastAct > 12 && t - stepT > 12 && !glide) {
    preview(hh.type, hh.cell, hh.rot);
    pvMat.opacity = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.4));
    return;
  }
  pvLines.visible = false;
  pvKey = '';
}

/* ---------- wordless hints ---------- */
let hintBoost = -9;
function nudge(x, z) {
  cels.push({ x, z, t0: t, dur: 0.8, r: 0.7, big: 0 });
  hintBoost = t;
} // every tap answers: a small ripple, and the hint glows brighter
function done(h) {
  if (h.cell) {
    const c = cells.get(key(...h.cell));
    return c && c.kind === 'cube' && c.type === h.type && c.rot === h.rot && !c.broken;
  }
  if (h.tap) return h.tap.rot === h.rot;
  if (h.discard) return !ents.includes(h.discard);
  return true;
}
function curHint() {
  if (firstDone) return null;
  const targets = ents.filter((e) => e.kind === 'beacon' && e.tag === 'L' + step);
  if (targets.length && targets.every((e) => e.woken)) return null;
  return hints.find((h) => !done(h)) || null;
}
const hintG = new THREE.Group();
scene.add(hintG);
const hintEdges = new THREE.LineSegments(
  boxEdges,
  new THREE.LineBasicMaterial({ color: C.flame, transparent: true, opacity: 0, depthWrite: false }),
);
hintEdges.renderOrder = 8;
hintEdges.scale.setScalar(0.8);
hintEdges.position.y = 0.4;
const hintSq = new THREE.Mesh(
  new THREE.PlaneGeometry(0.92, 0.92),
  new THREE.MeshBasicMaterial({
    color: C.flame,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }),
);
hintSq.rotation.x = -Math.PI / 2;
hintSq.position.y = 0.02;
const hintRing = new THREE.Mesh(
  new THREE.RingGeometry(0.86, 0.95, 56),
  new THREE.MeshBasicMaterial({
    color: C.core,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }),
);
hintRing.rotation.x = -Math.PI / 2;
hintRing.position.y = 0.03;
hintG.add(hintEdges, hintSq, hintRing);
function hintTick() {
  const h = intro.state === 'play' ? curHint() : null,
    boost = t - hintBoost < 2.2,
    show = h && (t > stepT + 0.6 || boost) && !dragE && (!glide || boost),
    p = boost ? 0.75 + 0.25 * Math.sin(t * 9) : reduce ? 0.7 : 0.5 + 0.5 * Math.sin(t * 3.6);
  for (const b of toolBtns)
    b.classList.toggle('hint', !!(show && h.cell && b.dataset.t === h.type && inv[h.type] > 0 && !selE));
  selBack.classList.toggle('hint', !!(show && h.discard && selE === h.discard));
  hintEdges.material.opacity = hintSq.material.opacity = hintRing.material.opacity = 0;
  if (!show) return;
  if (h.cell) {
    hintG.position.set(h.cell[0] + 0.5, 0, h.cell[1] + 0.5);
    hintEdges.material.color.set(TYPES[h.type].lift);
    hintEdges.rotation.y = (-h.rot * Math.PI) / 2;
    hintEdges.material.opacity = 0.25 + 0.5 * p;
    hintSq.material.opacity = 0.05 + 0.12 * p;
  } else {
    const e = h.tap || h.discard;
    hintG.position.set(e.cx + 0.5, 0, e.cz + 0.5);
    hintRing.scale.setScalar(0.85 + 0.25 * p);
    hintRing.material.opacity = 0.25 + 0.55 * p;
  }
}

const goalEl = document.getElementById('goal');
function goalTick() {
  if (!great || great.woken || intro.state !== 'play') {
    goalEl.classList.remove('on');
    return;
  }
  const [sx, sy] = toScreen(great.cx + 0.5, 1.5, great.cz + 0.5),
    m = 40,
    top = 70,
    bot = (trayEl.getBoundingClientRect().top || innerHeight - 90) - 20;
  if (sx > m && sx < innerWidth - m && sy > top && sy < bot) {
    goalEl.classList.remove('on');
    return;
  }
  const cx = innerWidth / 2,
    cy = (top + bot) / 2,
    dx = sx - cx,
    dy = sy - cy,
    k = Math.min((innerWidth / 2 - m) / Math.abs(dx || 1e-6), (bot - top) / 2 / Math.abs(dy || 1e-6));
  goalEl.style.left = cx + dx * k + 'px';
  goalEl.style.top = cy + dy * k + 'px';
  goalEl.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  goalEl.classList.add('on');
}

/* ---------- saving (this browser only) ---------- */
function ser(e) {
  switch (e.kind) {
    case 'source':
      return { k: 's', x: e.cx, z: e.cz, r: e.rot, s: e.s };
    case 'cube':
      return { k: 'c', x: e.cx, z: e.cz, r: e.rot, ty: e.type, f: e.fixed, b: e.broken };
    case 'rock':
      return { k: 'r', x: e.cx, z: e.cz };
    case 'beacon':
      return {
        k: 'b',
        x: e.cx,
        z: e.cz,
        h: e.hidden,
        n: e.need,
        tag: e.tag || null,
        g: e.great,
        w: e.woken,
        rv: e.revealed,
        r: e.rot,
        re: e.reach || 0,
      };
    case 'house':
      return { k: 'h', x: e.cx, z: e.cz, h: e.hidden, w: e.woken, rv: e.revealed };
    case 'gift':
      return e.taken ? null : { k: 'g', x: e.cx, z: e.cz, ty: e.type };
  }
}
let lastSave = 0,
  wiping = false;
function save() {
  if (wiping || !firstDone || dragE || intro.state !== 'play') return;
  lastSave = t;
  try {
    localStorage.setItem(
      SAVE,
      JSON.stringify({
        v: 1,
        E: ents.map(ser).filter(Boolean),
        inv,
        seen: [...seen],
        terr,
        found,
        chunks: [...chunkTerr],
        great: great && !great.woken ? [great.cx, great.cz, !!great.routed] : null,
        res: [...reserved],
        cam: [camT.x, camT.z],
        rev: revCv.toDataURL('image/png'),
        tint: tintCv.toDataURL('image/png'),
      }),
    );
  } catch (_) {}
}
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});
function restore(S) {
  for (const o of S.E) {
    let e;
    if (o.k === 's') e = makeLantern(o.x, o.z, o.r, o.s);
    if (o.k === 'c') ((e = makeCube(o.ty, o.x, o.z, o.r, o.f, o.b)), (e.ap = 1));
    if (o.k === 'r') e = makeRock(o.x, o.z);
    if (o.k === 'g') e = makeGift(o.x, o.z, o.ty);
    if (o.k === 'b') {
      e = makeBeacon(o.x, o.z, o.h, o.n, o.tag, o.g);
      if (o.re) {
        e.reach = o.re;
        e.route = true;
      }
      e.rot = o.r;
      e.ang = (-o.r * Math.PI) / 2;
      e.aimG.rotation.y = e.ang;
    }
    if (o.k === 'h') e = makeHouse(o.x, o.z, o.h);
    if ((o.k === 'b' || o.k === 'h') && o.w) {
      e.woken = true;
      e.wakeAt = -10;
      e.cel = true;
      if (e.pilSeen) e.pilSeen.fill(true);
    }
    if ((o.k === 'b' || o.k === 'h') && o.rv) {
      e.revealed = true;
      e.bloomT = -10;
    }
  }
  inv = S.inv;
  seen = new Set(S.seen);
  terr = S.terr;
  found = S.found || 0;
  for (const [k, v] of S.chunks) {
    chunks.add(k);
    chunkTerr.set(k, v);
  }
  for (const k of S.res || []) reserved.add(k);
  if (S.great) great = ents.find((e) => e.great && e.cx === S.great[0] && e.cz === S.great[1]) || null;
  if (great && !S.great[2]) {
    // an older save with a stranded great beacon: build its route from the nearest lit beacon
    let best = null,
      bd = 1e9;
    for (const e of ents)
      if (e.kind === 'beacon' && e.woken && !e.hidden) {
        const d = Math.hypot(e.cx - great.cx, e.cz - great.cz);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
    if (best) routeTo(best.cx, best.cz, great);
  } else if (great) great.routed = true;
  camT.set(S.cam[0], 0, S.cam[1]);
  firstDone = true;
  step = 5;
  hints = [];
  lantern0 = ents.find((e) => e.kind === 'source') || null;
  for (const [src, cv, tx] of [
    [S.rev, rctx, () => revTex],
    [S.tint, tctx, () => tintTex],
  ]) {
    if (!src) continue;
    const im = new Image();
    im.onload = () => {
      cv.drawImage(im, 0, 0);
      tx().needsUpdate = true;
    };
    im.src = src;
  }
}
if (saved) {
  try {
    restore(saved);
  } catch (_) {
    localStorage.removeItem(SAVE);
    location.reload();
  }
}

/* ---------- HUD ---------- */
const hud = document.getElementById('hud');
let frame = 0;
function updateHud() {
  if (frame % 30) return;
  const lit = ents.filter((e) => (e.kind === 'beacon' || e.kind === 'house') && e.woken && !e.hidden).length;
  hud.innerHTML = `lights <b>${lit}</b>${found ? ` · ✦ <b>${found}</b>` : ''}`;
}

/* ---------- loop ---------- */
for (const e of ents)
  if (!e.hidden || e.revealed) {
    e.g.visible = false;
    if (e.kind !== 'source') hideAtHome.push(e);
  }
setDay(1);
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  frame++;
  introTick();
  glideTick();
  if (intro.state === 'play') {
    tiltTick(dt);
    edgeScroll(dt);
    half += ((firstDone ? gameHalf() : tutHalf) - half) * Math.min(1, dt * 2);
    if (t - lastSave > 8) save();
    if (firstDone && frame % 20 === 0) {
      const n = ents.length;
      ensureChunks();
      if (ents.length !== n) dirty = true;
    }
    breakTick();
    valveTick();
  }
  if (dirty) {
    dirty = false;
    trace();
  }
  applyCam();
  drawLight();
  updateEnts(dt);
  hintTick();
  goalTick();
  previewTick();
  updateMotes();
  placeSel();
  if (frame % 30 === 0) placeEdges();
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- flags: ?design shows the design-system panel; ?bot=N runs the test bot (bot.js) ---------- */
const flags = new URLSearchParams(location.search);
if (!flags.has('design')) document.getElementById('sysBtn').style.display = 'none';
if (flags.has('bot')) {
  // Test hook: the bot plays through the real game with only the cubes it owns.
  const api = {
    get state() {
      return { firstDone, step, terr, inv: { ...inv }, great };
    },
    hint: () => curHint(),
    at: (cx, cz) => cells.get(key(cx, cz)),
    look: (x, z) => camT.set(x, 0, z),
    place(type, cell, rot) {
      if (!(inv[type] > 0) || !free(...cell)) return null;
      place(type, cell);
      const e = cells.get(key(...cell));
      if (rot != null) {
        e.rot = rot;
        e.ang = (-rot * Math.PI) / 2;
        dirty = true;
      }
      return e;
    },
    aim(e, rot) {
      e.rot = rot;
      e.ang = (-rot * Math.PI) / 2;
      dirty = true;
    },
    pickUp: (e) => takeBack(e),
    spareCubes: () => ents.filter((e) => e.kind === 'cube' && !e.fixed && !e.broken),
  };
  import('./bot.js').then(({ runBot }) => runBot(api, { greats: Number(flags.get('bot')) || 3 }));
}

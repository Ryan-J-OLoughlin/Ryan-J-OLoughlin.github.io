// landscape.js — stage ESM: one shared, curving landscape of fields, with people on it.
//
// The fields (climate modeling, philosophy, AI, policy) are hills on one continuous
// surface, colored by gradients that blend where they meet. Each person is a small glass
// cube popping out of the ground where they sit: inside a field or on a boundary.
// "This model" (Ryan's work) is one cube among them, the same size as everyone else's.

import {
  PlaneGeometry, Mesh, MeshStandardMaterial, Color, Group, DoubleSide,
  BufferGeometry, Float32BufferAttribute, LineSegments, LineBasicMaterial,
} from 'three';
import { createGlassCube } from './cubes.js';

export const SIZE = 19;          // width of the landscape, world units
const SEGMENTS = 72;
const LINE_EVERY = 4;            // survey lines every 4 segments...
export const LAND_CELL = (SIZE / SEGMENTS) * LINE_EVERY; // ...so one landscape cell is this wide
export const CUBE = LAND_CELL * 0.86; // a person's cube fills its cell, like a block of the ground

// centre of the landscape cell that contains x (or z)
const snap = (v) => (Math.floor((v + SIZE / 2) / LAND_CELL) + 0.5) * LAND_CELL - SIZE / 2;

// Where each field's hill sits (world x, z). On screen: climate at the back,
// philosophy right, AI left, policy at the front.
export const FIELD_CENTERS = {
  'climate-modeling': [-4.6, -4.6],
  philosophy: [4.6, -4.6],
  ai: [-4.6, 4.6],
  policy: [4.6, 4.6],
};
export const MODEL_SPOT = [snap(0.3), snap(-1.8)]; // "this model": between climate and philosophy, in a cell

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp = (x) => Math.min(1, Math.max(0, x));
// pops up past full height and settles back
const pop = (x) => { const c1 = 1.9; const c3 = c1 + 1; return x <= 0 ? 0 : 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

// Ground height: a hill per field, gentle ripples, and the whole surface curving away at the edges.
export function heightAt(x, z) {
  let h = 0;
  for (const [cx, cz] of Object.values(FIELD_CENTERS)) {
    h += 1.5 * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / 16);
  }
  h += 0.35 * Math.sin(x * 0.55 + 0.6) * Math.cos(z * 0.5 - 0.3);
  h += 0.18 * Math.sin((x + z) * 0.9);
  h -= 0.012 * (x * x + z * z); // curves down towards the edges, like part of a globe
  return h;
}

function fieldColorAt(x, z, colors, out) {
  let total = 0;
  out.setRGB(0, 0, 0);
  for (const [id, [cx, cz]] of Object.entries(FIELD_CENTERS)) {
    const w = Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / 26);
    out.r += colors[id].r * w; out.g += colors[id].g * w; out.b += colors[id].b * w;
    total += w;
  }
  return out.multiplyScalar(1 / total);
}

// Place people near "this model", each pulled toward their own field(s), then snapped
// into a landscape cell. Everyone gets their own cell, with a little open ground
// between neighbours so names have room.
const SPACING_CELLS = 1; // empty cells kept around each cube (1 = one ring)
function placePeople(people) {
  const taken = new Set();
  const key = (x, z) => `${Math.round(x / LAND_CELL)}:${Math.round(z / LAND_CELL)}`;
  const blocked = (x, z) => {
    for (let dx = -SPACING_CELLS; dx <= SPACING_CELLS; dx++) for (let dz = -SPACING_CELLS - 1; dz <= SPACING_CELLS + 1; dz++) {
      if (taken.has(key(x + dx * LAND_CELL, z + dz * LAND_CELL))) return true;
    }
    return false;
  };
  taken.add(key(...MODEL_SPOT));

  return people.map((p, i) => {
    const centers = p.fields.map((f) => FIELD_CENTERS[f]).filter(Boolean);
    const ax = centers.reduce((s, c) => s + c[0], 0) / centers.length;
    const az = centers.reduce((s, c) => s + c[1], 0) / centers.length;
    const wantX = MODEL_SPOT[0] + (ax - MODEL_SPOT[0]) * 0.55 + Math.sin(i * 2.4) * 0.5;
    const wantZ = MODEL_SPOT[1] + (az - MODEL_SPOT[1]) * 0.55 + Math.cos(i * 1.7) * 0.5;
    // nearest free cell to where they'd like to be, searching outward ring by ring
    let best = null;
    for (let ring = 0; ring < 8 && !best; ring++) {
      let bestD = Infinity;
      for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const x = snap(wantX) + dx * LAND_CELL;
        const z = snap(wantZ) + dz * LAND_CELL;
        if (blocked(x, z)) continue;
        const d = Math.hypot(x - wantX, z - wantZ);
        if (d < bestD) { bestD = d; best = { x, z }; }
      }
    }
    best ??= { x: snap(wantX), z: snap(wantZ) };
    taken.add(key(best.x, best.z));
    return { person: p, ...best };
  });
}

export function createLandscape({ data, colors }) {
  const group = new Group();

  // ground
  const geometry = new PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const pos = geometry.attributes.position;
  const vertexColors = new Float32Array(pos.count * 3);
  const c = new Color();
  const fieldColors = Object.fromEntries(Object.keys(FIELD_CENTERS).map((id) => [id, colors[id]]));
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v); const z = pos.getZ(v);
    const h = heightAt(x, z);
    pos.setY(v, h);
    fieldColorAt(x, z, fieldColors, c);
    c.lerp(colors.paper, 0.4 - 0.08 * h); // higher ground a little richer, valleys paler
    vertexColors.set([c.r, c.g, c.b], v * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(vertexColors, 3));
  geometry.computeVertexNormals();
  const ground = new Mesh(geometry, new MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0, roughness: 0.95, side: DoubleSide, depthWrite: false,
  }));
  ground.renderOrder = -2;
  group.add(ground);

  // faint survey lines across the ground, every few rows
  const lines = [];
  const step = SIZE / SEGMENTS;
  for (let a = 0; a <= SEGMENTS; a += LINE_EVERY) {
    for (let b = 0; b < SEGMENTS; b++) {
      const u = -SIZE / 2 + a * step; const v0 = -SIZE / 2 + b * step; const v1 = v0 + step;
      lines.push(u, heightAt(u, v0) + 0.01, v0, u, heightAt(u, v1) + 0.01, v1);
      lines.push(v0, heightAt(v0, u) + 0.01, u, v1, heightAt(v1, u) + 0.01, u);
    }
  }
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', new Float32BufferAttribute(lines, 3));
  const lineMaterial = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const survey = new LineSegments(lineGeometry, lineMaterial);
  survey.renderOrder = -1;
  group.add(survey);

  // people, plus this model
  const spots = placePeople(data.people);
  const entries = spots.map((s, i) => ({ ...s, me: false, delay: 0.1 + (i / spots.length) * 0.5 }));
  entries.unshift({ person: { id: 'this-model', name: data.thisModel }, x: MODEL_SPOT[0], z: MODEL_SPOT[1], me: true, delay: 0 });
  for (const e of entries) {
    const base = e.me ? colors.start : colors[e.person.fields[0]];
    e.color = base.clone();
    e.cube = createGlassCube(e.color, colors.ink);
    e.cube.pick.userData.entry = e;
    const half = LAND_CELL / 2;
    e.ground = Math.min(heightAt(e.x - half, e.z - half), heightAt(e.x + half, e.z - half),
      heightAt(e.x - half, e.z + half), heightAt(e.x + half, e.z + half));
    e.hover = 0;
    group.add(e.cube.group);
  }

  return {
    object: group,
    entries,
    pickTargets: entries.filter((e) => !e.me).map((e) => e.cube.pick),

    // rise: 0 (flat, invisible) – 1 (full landscape)
    // people: 0 – 1 (everyone else's cubes popped up); me: 0 – 1 ("this model" cube)
    update(rise, people, me) {
      group.visible = me > 0.001 || rise > 0.001;
      if (!group.visible) return;
      ground.visible = rise > 0.001;
      survey.visible = rise > 0.001;
      const r = ease(clamp(rise));
      group.scale.set(1, Math.max(0.001, r), 1);
      ground.material.opacity = 0.9 * clamp(rise * 1.6);
      lineMaterial.opacity = 0.22 * clamp((rise - 0.4) / 0.6);
      for (const e of entries) {
        const p = e.me ? me : pop(clamp((people - e.delay) / 0.4));
        const tall = 1 + 0.9 * e.hover;
        const h = Math.max(0.001, CUBE * p * tall);
        // the group is squashed vertically while the ground rises; undo that for the cubes
        e.cube.group.scale.set(CUBE, h / Math.max(0.001, r), CUBE);
        e.cube.group.position.set(e.x, e.ground + (h / 2) / Math.max(0.001, r), e.z);
        e.cube.set(e.color, clamp(p * 2));
      }
    },

    stepHover(hovered) {
      let moving = false;
      for (const e of entries) {
        const target = e === hovered ? 1 : 0;
        const next = e.hover + (target - e.hover) * 0.2;
        if (Math.abs(next - e.hover) > 0.002) moving = true;
        e.hover = Math.abs(target - next) < 0.002 ? target : next;
      }
      return moving;
    },

    // world position of the top of someone's cube (for their label)
    topOf(e, out) {
      return out.set(e.x, e.ground + CUBE * (1 + 0.9 * e.hover) + 0.05, e.z);
    },
  };
}

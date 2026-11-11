// grid.js — stage 3D: one grid per layer, type of work × year, a cube per piece of work.
//
// Each layer is a flat grid of faint tiles (years along one side, categories along the
// other). Each piece of work is a small glass cube standing on its cell; several pieces
// in the same cell stack up. Work that belongs to two layers has a cube on both, joined
// by a dashed thread. All three grids stay aligned, so a cell means the same thing on
// every layer.

import {
  Group, InstancedMesh, BoxGeometry, MeshStandardMaterial, Object3D,
  BufferGeometry, Float32BufferAttribute, LineSegments, LineDashedMaterial, Color,
} from 'three';
import { createGlassCube } from './cubes.js';

export const CELL = 0.42;           // size of one grid cell, in world units
const CUBE = CELL * 0.72;           // a work cube, a little smaller than its cell
const STACK_GAP = CUBE * 0.12;

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp = (x) => Math.min(1, Math.max(0, x));

export function createGrid({ data, layerY, colors }) {
  const years = [];
  for (let y = data.years.from; y <= data.years.to; y++) years.push(y);
  const categories = data.categories.map((c) => c.id);
  const nx = years.length;
  const nz = categories.length;
  const width = nx * CELL;
  const depth = nz * CELL;

  // cell centre in a layer's own coordinates
  const cellX = (i) => (i - (nx - 1) / 2) * CELL;
  // Categories run back to front in reverse list order, so the first one (Papers)
  // sits at the front edge, where taller stacks behind it can't hide it.
  const cellZ = (j) => ((nz - 1 - j) - (nz - 1) / 2) * CELL;

  const root = new Group();
  const layers = {};

  for (const topic of data.topics) {
    const group = new Group();
    group.position.y = layerY[topic.id];
    root.add(group);

    // faint tiles, one draw call per layer
    const tileMaterial = new MeshStandardMaterial({
      color: colors.tile, transparent: true, opacity: 0, roughness: 1, depthWrite: false,
    });
    const tiles = new InstancedMesh(new BoxGeometry(1, 1, 1), tileMaterial, nx * nz);
    const place = new Object3D();
    let n = 0;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        place.position.set(cellX(i), -0.01, cellZ(j));
        place.scale.set(CELL * 0.92, 0.02, CELL * 0.92);
        place.updateMatrix();
        tiles.setMatrixAt(n++, place.matrix);
      }
    }
    tiles.renderOrder = -1;
    group.add(tiles);

    layers[topic.id] = { group, tileMaterial, focus: 0, y: layerY[topic.id] };
  }

  // work cubes
  const cubes = [];
  const stackCount = {};
  const inRange = (w) => w.year >= data.years.from && w.year <= data.years.to;
  for (const work of data.works.filter(inRange)) {
    const i = years.indexOf(work.year);
    const j = categories.indexOf(work.type);
    for (const topic of work.topics) {
      const key = `${topic}:${i}:${j}`;
      const k = (stackCount[key] = (stackCount[key] ?? -1) + 1);
      const cube = createGlassCube(colors[topic], colors.ink);
      cube.pick.userData.entry = null; // filled below
      layers[topic].group.add(cube.group);
      const entry = {
        work, topic, i, j, k, cube,
        x: cellX(i), z: cellZ(j),
        baseY: CUBE / 2 + k * (CUBE + STACK_GAP),
        delay: ((i + j) / (nx + nz)) * 0.45, // cubes rise in a wave across the grid
        hover: 0,
      };
      cube.pick.userData.entry = entry;
      cubes.push(entry);
    }
  }

  // threads between the two cubes of a work that sits on two layers
  const threadPoints = [];
  const byWork = {};
  for (const c of cubes) (byWork[c.work.id] ??= []).push(c);
  for (const list of Object.values(byWork)) {
    if (list.length < 2) continue;
    list.sort((a, b) => layers[a.topic].y - layers[b.topic].y);
    for (let s = 0; s < list.length - 1; s++) {
      const a = list[s];
      const b = list[s + 1];
      threadPoints.push(
        a.x, layers[a.topic].y + a.baseY + CUBE / 2, a.z,
        b.x, layers[b.topic].y + b.baseY - CUBE / 2, b.z,
      );
    }
  }
  const threadGeometry = new BufferGeometry();
  threadGeometry.setAttribute('position', new Float32BufferAttribute(threadPoints, 3));
  const threadMaterial = new LineDashedMaterial({
    color: colors.ink, dashSize: 0.05, gapSize: 0.06, transparent: true, opacity: 0, depthWrite: false,
  });
  const threads = new LineSegments(threadGeometry, threadMaterial);
  threads.computeLineDistances();
  root.add(threads);

  const scratch = new Color();

  return {
    object: root,
    width,
    depth,
    years,
    categories,
    cellX,
    cellZ,
    layers,
    pickTargets: cubes.map((c) => c.cube.pick),

    // reveal: 0 (no grid) – 1 (fully built); focused: a topic id or null
    // fade: 1 normally; goes to 0 as the grid shrinks away into the ESM stage
    update(reveal, focusedTopic, fade = 1) {
      root.visible = reveal > 0.001 && fade > 0.001;
      if (!root.visible) return;

      for (const [id, layer] of Object.entries(layers)) {
        const target = focusedTopic === null ? 0 : focusedTopic === id ? 1 : -1;
        layer.focus += (target - layer.focus) * 0.18; // eased each frame
        const grow = 1 + 0.32 * Math.max(0, layer.focus);
        const dim = 1 - 0.75 * Math.max(0, -layer.focus);
        layer.group.scale.setScalar(grow);
        // when a layer comes forward, the others move a little out of its way
        const away = focusedTopic && focusedTopic !== id ? Math.sign(layer.y - layers[focusedTopic].y) * 0.8 : 0;
        layer.offset = (layer.offset ?? 0) + (away - (layer.offset ?? 0)) * 0.18;
        layer.group.position.y = layer.y + layer.offset;
        layer.dim = dim;
        layer.tileMaterial.opacity = 0.55 * clamp(reveal * 1.5) * dim * fade;
      }

      for (const c of cubes) {
        const rise = ease(clamp((reveal - c.delay) / 0.55));
        const lift = c.hover * CUBE * 0.9;
        const grow = 1 + 0.45 * c.hover;
        c.cube.group.position.set(c.x, (c.baseY * rise) + lift, c.z);
        c.cube.group.scale.set(CUBE * grow, Math.max(0.001, CUBE * rise * grow), CUBE * grow);
        scratch.copy(colors[c.topic]);
        c.cube.set(scratch, clamp(rise * 1.2) * layers[c.topic].dim * fade);
      }

      const anyFocus = focusedTopic !== null;
      threadMaterial.opacity = 0.5 * clamp((reveal - 0.7) / 0.3) * (anyFocus ? 0 : 1) * fade; // threads hide while a layer is forward
      threads.visible = threadMaterial.opacity > 0.001;
    },

    // ease each cube's hover amount toward 1 for the hovered one, 0 for the rest
    stepHover(hovered) {
      let moving = false;
      for (const c of cubes) {
        const target = c === hovered ? 1 : 0;
        const next = c.hover + (target - c.hover) * 0.2;
        if (Math.abs(next - c.hover) > 0.002) moving = true;
        c.hover = Math.abs(target - next) < 0.002 ? target : next;
      }
      return moving;
    },

    // Turn the whole model about the vertical axis (radians).
    setTurn(angle) { root.rotation.y = angle; },

    // A point in the grid's own coordinates → world coordinates, allowing for the turn.
    turned(x, z) {
      const a = root.rotation.y;
      return { x: x * Math.cos(a) + z * Math.sin(a), z: -x * Math.sin(a) + z * Math.cos(a) };
    },

    // top centre of a cube in world coordinates (for the card)
    topOf(entry, out) {
      const layer = layers[entry.topic];
      const s = layer.group.scale.x;
      const p = this.turned(entry.x * s, entry.z * s);
      out.set(p.x, layer.group.position.y + (entry.baseY + entry.hover * CUBE * 0.9 + CUBE * (1 + 0.45 * entry.hover) / 2) * s, p.z);
      return out;
    },
  };
}

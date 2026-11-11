// index.js — puts the scene together and connects the stage control.
// Loaded by main.js only when the browser can draw 3D.

import { Color } from 'three';
import { gsap } from 'gsap';
import { createSetup } from './setup.js';
import { createGlassCube } from './cubes.js';
import { createAir } from './air.js';
import { createStages, LAYERS } from './stages.js';
import { createLabels } from './labels.js';

// Colors come from the CSS variables, so the palette lives in one place (base.css).
function cssColor(name) {
  return new Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
}

export function start() {
  const section = document.getElementById('scene');
  const holder = section.querySelector('.scene-canvas');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const colors = {
    start: cssColor('--ocean'),
    robustness: cssColor('--ocean'),
    errors: cssColor('--green'),
    antifragility: cssColor('--earth'),
    ink: cssColor('--ink'),
    air: cssColor('--ink-soft'),
  };

  const { renderer, scene, camera, resize } = createSetup(holder);

  const cubes = {};
  for (const layer of LAYERS) {
    cubes[layer] = createGlassCube(colors.start, colors.ink);
    scene.add(cubes[layer].group);
  }
  const air = createAir(colors.air, [-0.875, 0.875]);
  scene.add(air.object);

  const stages = createStages({ cubes, air, colors });
  const labelEls = Object.fromEntries(
    [...section.querySelectorAll('.scene-label')].map((el) => [el.dataset.topic, el]),
  );
  const placeLabels = createLabels(holder, labelEls);

  // ───── drawing: only while something moves, and only while on screen ─────
  const state = { progress: 0 };
  let tweening = false;
  let onScreen = true;
  let running = false;
  const clock0 = performance.now();

  function draw() {
    const seconds = reducedMotion ? 0 : (performance.now() - clock0) / 1000;
    const layout = stages.apply(state.progress, seconds);
    renderer.render(scene, camera);
    placeLabels(camera, layout);
    section.dataset.stage = state.progress > 0.5 ? '1' : '0';
  }

  function needsLoop() {
    const airMoving = state.progress > 0.55 && !reducedMotion;
    return onScreen && !document.hidden && (tweening || airMoving);
  }

  function loop() {
    draw();
    if (needsLoop()) requestAnimationFrame(loop);
    else running = false;
  }

  function wake() {
    if (!running && needsLoop()) {
      running = true;
      requestAnimationFrame(loop);
    } else if (!running) {
      draw();
    }
  }

  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    wake();
  }).observe(section);
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('resize', () => { resize(); draw(); });

  // ───── stage control ─────
  const buttons = [...document.querySelectorAll('.stage-control [data-goto]')];

  function goTo(stage) {
    const target = stage === '1' ? 1 : 0;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.goto === stage)));
    section.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (reducedMotion) {
      state.progress = target;
      draw();
      wake();
      return;
    }
    tweening = true;
    wake();
    gsap.to(state, {
      progress: target,
      duration: 1.8,
      ease: 'power2.inOut',
      overwrite: true,
      onComplete: () => { tweening = false; wake(); },
    });
  }

  buttons.forEach((b) => b.addEventListener('click', () => goTo(b.dataset.goto)));

  resize();
  section.classList.add('is-ready');
  draw();
}

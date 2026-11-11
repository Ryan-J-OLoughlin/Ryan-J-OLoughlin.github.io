// setup.js — renderer, camera, lights, and fitting the scene to the screen.
// The camera has no perspective (orthographic), which gives the flat, map-like
// isometric look of the design board.

import {
  WebGLRenderer, Scene, OrthographicCamera, HemisphereLight, DirectionalLight,
} from 'three';

const lerp = (a, b, t) => a + (b - a) * t;

export function createSetup(container) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap pixel density on phones
  container.appendChild(renderer.domElement);

  const scene = new Scene();

  // Looking down at the classic isometric angle.
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(10, 8.2, 10);
  camera.lookAt(0, 0, 0);

  // Soft sky light plus one sun from the upper left: gives each face its own shade.
  scene.add(new HemisphereLight(0xffffff, 0xc9d0c4, 2.1));
  const sun = new DirectionalLight(0xffffff, 1.3);
  sun.position.set(-4, 10, 6);
  scene.add(sun);

  let gridBlend = 0; // 0 = column stages, 1 = full grid

  function fit() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    const wide = w > 820;

    // World units visible top to bottom. Everything in the scene is sized in world
    // units, so this scales the model to the screen. The grid needs more room.
    const column = wide ? (h < 640 ? 7.8 : 7) : (w / h > 0.62 ? 10.5 : 9.6);
    const gridView = wide ? (h < 640 ? 8.6 : 8) : 11.5;
    const viewHeight = lerp(column, gridView, gridBlend);
    const aspect = w / h;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.left = (-viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;

    // Desktop: the model sits right of centre, text on the left.
    // Phone: below the text (and nudged left to leave room for labels).
    camera.clearViewOffset();
    if (wide) camera.setViewOffset(w, h, lerp(-w * 0.14, -w * 0.12, gridBlend), lerp(0, -h * 0.02, gridBlend), w, h);
    else camera.setViewOffset(w, h, lerp(w * 0.16, w * 0.07, gridBlend), lerp(-h * 0.13, -h * 0.12, gridBlend), w, h);
    camera.updateProjectionMatrix();
  }

  function resize() {
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    fit();
  }

  return {
    renderer, scene, camera, resize,
    // Called each frame with how far into the grid stage we are.
    blend(value) {
      if (value !== gridBlend) { gridBlend = value; fit(); }
    },
  };
}

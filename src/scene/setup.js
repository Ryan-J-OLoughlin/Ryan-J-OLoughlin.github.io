// setup.js — renderer, camera, lights, and resizing.
// The camera has no perspective (orthographic), which gives the flat, map-like
// isometric look of the design board.

import {
  WebGLRenderer, Scene, OrthographicCamera, HemisphereLight, DirectionalLight,
} from 'three';

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

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    const wide = w > 820;
    renderer.setSize(w, h, false);

    const viewHeight = wide ? 7 : 9.6; // world units visible top to bottom
    const aspect = w / h;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.left = (-viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;

    // Desktop: the model sits right of center, text on the left.
    // Phone: the model sits below the text.
    camera.clearViewOffset();
    if (wide) camera.setViewOffset(w, h, -w * 0.14, 0, w, h);
    else camera.setViewOffset(w, h, w * 0.16, -h * 0.13, w, h);
    camera.updateProjectionMatrix();
  }

  return { renderer, scene, camera, resize };
}

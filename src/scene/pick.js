// pick.js — pointing at cubes.
// Mouse: hovering a cube shows its card; clicking keeps the card open (so its link can be used).
// Touch: tapping a cube opens its card; tapping empty space closes it.
// Pointer events on `ignore` elements (the card itself) don't count as pointing at empty space.

import { Raycaster, Vector2 } from 'three';

export function createPicker({ element, camera, targets, onChange, ignore = null }) {
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  let hovered = null;
  let pinned = null;
  let enabled = false;

  function hit(event) {
    const rect = element.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const found = raycaster.intersectObjects(targets, false).find((h) => h.object.parent.visible);
    return found ? found.object.userData.entry : null;
  }

  function report() {
    onChange(pinned ?? hovered, Boolean(pinned));
  }

  element.addEventListener('pointermove', (event) => {
    if (!enabled || event.pointerType === 'touch') return;
    if (ignore && event.target.closest(ignore)) return; // over the card: keep things as they are
    const entry = hit(event);
    if (entry !== hovered) {
      hovered = entry;
      element.style.cursor = entry ? 'pointer' : '';
      report();
    }
  });

  element.addEventListener('pointerleave', () => {
    hovered = null;
    report();
  });

  element.addEventListener('click', (event) => {
    if (!enabled) return;
    if (event.target.closest('a, button')) return; // let links and buttons work normally
    if (ignore && event.target.closest(ignore)) return;
    const entry = hit(event);
    pinned = entry && entry !== pinned ? entry : null;
    report();
  });

  return {
    setEnabled(value) {
      enabled = value;
      if (!value) { hovered = null; pinned = null; element.style.cursor = ''; report(); }
    },
    clear() { pinned = null; hovered = null; report(); },
  };
}

// main.js — decides whether to add the 3D scene on top of the plain page.
// The plain page is complete on its own. The 3D code (Three.js, GSAP) only loads
// if the browser can draw 3D, and only after the first screen is already readable.

function canDraw3D() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

const toggle = document.querySelector('.text-toggle');
toggle?.addEventListener('click', () => {
  const open = document.documentElement.classList.toggle('show-text');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? 'Hide text version' : 'Text version';
  if (open) document.getElementById('work')?.scrollIntoView({ behavior: 'smooth' });
});

if (canDraw3D()) {
  document.documentElement.classList.add('has-scene');
  const start = () => import('./scene/index.js').then((m) => m.start());
  if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 800 });
  else setTimeout(start, 200);
}

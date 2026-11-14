// to-light.js — the "Light" link in the nav: from the opening view, the words fade, the page falls to
// dusk and the 0D cube shrinks where it stands; then the game page opens and carries on from that picture
// (it reads where the cube was and how big it looked). Anywhere else, or with reduced motion, it's a plain link.

import { gsap } from 'gsap';
import { Box3, Vector3 } from 'three';
import { toScreen } from './labels.js';

const SHRINK = 0.32; // how small the cube gets before the game takes over

export function enableLightLink({ camera, holder, cube }) {
  const link = document.querySelector('.site-head a[href="./light/"]');
  if (!link) return;
  link.addEventListener('click', (event) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.scrollY > 40 || event.metaKey || event.ctrlKey || event.shiftKey) return; // only from the opening view
    event.preventDefault();

    // where the cube is on screen, and how wide it looks
    const box = new Box3().setFromObject(cube);
    const centre = box.getCenter(new Vector3());
    const at = toScreen(camera, holder, centre.x, centre.y, centre.z);
    // the camera's scale (world units per pixel, after the shrink) and the cube's size, so the game
    // page can draw exactly the same picture in its first frame
    const perPixel = (camera.top - camera.bottom) / camera.zoom / holder.clientHeight / SHRINK;
    const rect = holder.getBoundingClientRect();
    const x = rect.left + at.x,
      y = rect.top + at.y;

    const shade = document.createElement('div');
    shade.className = 'to-light-shade';
    holder.parentElement.append(shade); // inside the pinned scene, so the cube's canvas can sit above it
    holder.classList.add('to-light-lifted');

    const go = () => {
      const q = new URLSearchParams({
        from: 'home',
        x: (x / innerWidth).toFixed(4),
        y: (y / innerHeight).toFixed(4),
        u: perPixel.toFixed(5),
        w: cube.scale.x.toFixed(3),
      });
      location.href = `${link.getAttribute('href')}?${q}`;
    };
    gsap
      .timeline({ onComplete: go })
      .to(
        '.site-head, .scene-text, .scroll-cue, .stage-control, .scene-labels',
        { opacity: 0, duration: 0.6 },
        0,
      )
      .to(shade, { opacity: 1, duration: 1.6, ease: 'power2.inOut' }, 0.2)
      .to(
        holder.querySelector('canvas'),
        { scale: SHRINK, transformOrigin: `${at.x}px ${at.y}px`, duration: 1.6, ease: 'power2.inOut' },
        0.4,
      );
  });
}

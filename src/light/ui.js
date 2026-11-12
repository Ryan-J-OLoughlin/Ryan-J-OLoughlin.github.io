// ui.js — everything drawn in HTML over the canvas: score, cube tray, region name,
// floating points and cubes flying to the tray. No words in play, only numbers and shapes.

import { NAMES } from './cubes.js';

const $ = (s) => document.querySelector(s);
const scoreEl = $('.score'), tray = $('.tray'), regionEl = $('.region');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

// A small isometric cube icon in a type's tint (CSS classes t0–t3 set the color).
export const cubeIcon = (t) => `<svg class="t${t}" viewBox="0 0 40 40" aria-hidden="true">
<path class="l" d="M6 14 20 21v15L6 29z"/><path class="r" d="M20 21l14-7v15l-14 7z"/><path class="u" d="M6 14 20 7l14 7-14 7z"/>
<path class="e" d="M6 14 20 7l14 7v15l-14 7-14-7zM6 14l14 7 14-7M20 21v15"/></svg>`;

export function setupTray(onSelect) {
  tray.innerHTML = NAMES.map((n, t) =>
    `<button type="button" class="slot" data-t="${t}" aria-label="${n}" aria-pressed="false">${cubeIcon(t)}<span class="n">0</span></button>`).join('');
  tray.addEventListener('click', (e) => {
    const b = e.target.closest('.slot');
    if (b) onSelect(+b.dataset.t);
  });
}

export function showTray(inv, sel) {
  tray.querySelectorAll('.slot').forEach((b, t) => {
    b.querySelector('.n').textContent = inv[t];
    b.classList.toggle('empty', !inv[t]);
    b.setAttribute('aria-pressed', String(t === sel));
  });
}

export const slot = (t) => tray.children[t];

export function nudge(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // restart the animation
  el.classList.add(cls);
}

export function showScore(n, bump) {
  scoreEl.textContent = n.toLocaleString();
  if (bump) nudge(scoreEl, 'bump');
}

let regionTimer = 0;
export function announceRegion(n) {
  regionEl.textContent = `Region ${n}`;
  regionEl.classList.add('show');
  clearTimeout(regionTimer);
  regionTimer = setTimeout(() => regionEl.classList.remove('show'), 2400);
}

function at(el, x, y, delay, remove = 1600) {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.animationDelay = `${delay}ms`;
  document.body.append(el);
  setTimeout(() => el.remove(), delay + remove);
  return el;
}

// "+10" rising from a point on screen.
export function floatPoints(points, x, y, delay, kind = '') {
  const el = document.createElement('div');
  el.className = `points ${kind}`;
  el.textContent = `+${points}`;
  at(el, x, y, delay);
}

// A cube flying from a point on screen into its tray slot; `done` runs when it lands.
export function flyCube(t, x, y, delay, done) {
  const target = slot(t).getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fly';
  el.innerHTML = cubeIcon(t);
  at(el, x, y, 0, delay + 1000);
  const dx = target.left + target.width / 2 - x, dy = target.top + target.height / 2 - y;
  const anim = el.animate([
    { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 },
    { transform: 'translate(-50%,-90%) scale(1.1)', opacity: 1, offset: 0.3 },
    { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.7)`, opacity: 1 },
  ], { duration: still ? 1 : 900, delay: still ? 0 : delay, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' });
  anim.onfinish = () => { el.remove(); done(); nudge(slot(t), 'got'); };
}

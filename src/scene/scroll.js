// scroll.js — scrolling drives the stages, on every kind of screen.
//
// The scene section is made taller than the window; its picture stays pinned while
// you scroll through it. How far you've scrolled through the section becomes the
// scene's `progress` (0 = 0D … 3 = ESM). Each stage has a short "hold" where the
// picture rests, so a stage doesn't slip past mid-scroll. The move to ESM gets more
// scroll than the others because it has several steps.
//
// All lengths below are in "units" of scroll; one unit is SCREEN_PER_UNIT of the
// window's height.

const SCREEN_PER_UNIT = 0.6;

// [kind, length]: holds sit on a stage, moves go to the next stage
const TRACK = [
  ['hold', 0.4], // 0D
  ['move', 1.0],
  ['hold', 0.5], // 1D
  ['move', 1.0],
  ['hold', 0.6], // 3D
  ['move', 1.8],
  ['hold', 0.6], // ESM
];

const TOTAL = TRACK.reduce((s, [, len]) => s + len, 0);

// progress for a distance along the track (in units)
function progressAt(units) {
  let stage = 0;
  let pos = 0;
  for (const [kind, len] of TRACK) {
    if (units <= pos + len) {
      return kind === 'hold' ? stage : stage + (units - pos) / len;
    }
    pos += len;
    if (kind === 'move') stage += 1;
  }
  return stage;
}

// distance along the track (in units) to the middle of a stage's hold
function unitsForStage(target) {
  let stage = 0;
  let pos = 0;
  for (const [kind, len] of TRACK) {
    if (kind === 'hold' && stage === target) return pos + (target === 0 ? 0 : len / 2);
    pos += len;
    if (kind === 'move') stage += 1;
  }
  return TOTAL;
}

export function createScroll(section) {
  // Make the section tall enough to scroll through the whole track.
  section.style.height = `calc(100svh + ${TOTAL * SCREEN_PER_UNIT * 100}svh)`;

  const unitPx = () => window.innerHeight * SCREEN_PER_UNIT;
  const sectionTop = () => section.getBoundingClientRect().top + window.scrollY;

  return {
    // the stage progress the current scroll position asks for
    progress() {
      const units = (window.scrollY - sectionTop()) / unitPx();
      return progressAt(Math.max(0, Math.min(TOTAL, units)));
    },
    // scroll the window to rest on a stage
    goTo(stage, smooth) {
      window.scrollTo({ top: sectionTop() + unitsForStage(stage) * unitPx(), behavior: smooth ? 'smooth' : 'auto' });
    },
  };
}

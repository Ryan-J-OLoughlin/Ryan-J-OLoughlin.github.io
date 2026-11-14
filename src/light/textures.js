// Soft glow and candle-flame sprites, drawn once on small canvases.
import * as THREE from 'three';

export const glowCv = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
{
  const g = glowCv.getContext('2d'),
    gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.42)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
}
export const glowTex = new THREE.CanvasTexture(glowCv);
const flameCv = Object.assign(document.createElement('canvas'), { width: 64, height: 128 });
{
  const g = flameCv.getContext('2d');
  const draw = (sc, col) => {
    g.save();
    g.translate(32, 118);
    g.scale(sc, sc);
    g.beginPath();
    g.moveTo(0, -108);
    g.bezierCurveTo(20, -62, 24, -24, 0, 0);
    g.bezierCurveTo(-24, -24, -20, -62, 0, -108);
    const gr = g.createRadialGradient(0, -26, 2, 0, -34, 70);
    gr.addColorStop(0, col[0]);
    gr.addColorStop(0.45, col[1]);
    gr.addColorStop(1, col[2]);
    g.fillStyle = gr;
    g.fill();
    g.restore();
  };
  draw(1, ['rgba(255,236,190,.9)', 'rgba(242,170,80,.55)', 'rgba(200,110,50,0)']);
  draw(0.62, ['rgba(255,255,245,1)', 'rgba(255,226,160,.8)', 'rgba(255,200,120,0)']);
}
export const flameTex = new THREE.CanvasTexture(flameCv);
export function sprite(color, size, map = glowTex) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map,
      color,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    }),
  );
  s.scale.setScalar(size);
  s.renderOrder = 9;
  return s;
}

// Vite settings: the site lives in src/, static files in public/, output in dist/.
// Two pages: the homepage (src/index.html) and the Light game (src/light/index.html → /light/).
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 700, // the 3D code is ~160 KB compressed, loaded after the page
    rollupOptions: {
      input: { main: page('src/index.html'), light: page('src/light/index.html') },
    },
  },
});

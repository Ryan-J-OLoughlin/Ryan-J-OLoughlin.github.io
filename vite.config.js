// Vite settings: the site lives in src/, static files in public/, output in dist/.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 700, // the 3D code is ~160 KB compressed, loaded after the page
    rollupOptions: {
      // two pages: the site, and the Light game at /light/
      input: {
        main: resolve(import.meta.dirname, 'src/index.html'),
        light: resolve(import.meta.dirname, 'src/light/index.html'),
      },
    },
  },
});

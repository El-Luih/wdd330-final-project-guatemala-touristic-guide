import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/wdd330-final-project-guatemala-touristic-guide/',
  root: 'src/',

  build: {
    outDir: '../docs',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        cuisine: resolve(__dirname, 'src/cuisine/index.html'),
        destinations: resolve(__dirname, 'src/destinations/index.html'),
        events: resolve(__dirname, 'src/events/index.html'),
        favorites: resolve(__dirname, 'src/favorites/index.html'),
        flights: resolve(__dirname, 'src/flights/index.html'),
      },
    },
  },
});

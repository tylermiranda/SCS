import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: './dashboard',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'dashboard/index.html'),
        properties: resolve(__dirname, 'dashboard/properties.html'),
      }
    }
  },
  server: {
    port: 5173,
    open: false,
  },
});

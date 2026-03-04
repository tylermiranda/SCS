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
        adminIndex: resolve(__dirname, 'dashboard/admin/index.html'),
        adminProperties: resolve(__dirname, 'dashboard/admin/properties.html'),
        adminLogs: resolve(__dirname, 'dashboard/admin/logs.html'),
        adminDatabase: resolve(__dirname, 'dashboard/admin/database.html'),
      }
    }
  },
  server: {
    port: 5173,
    open: false,
  },
});

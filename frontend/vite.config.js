import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 4180,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3100', changeOrigin: false },
      '/ws': { target: 'ws://127.0.0.1:3100', ws: true, changeOrigin: false }
    }
  },
  preview: { host: '0.0.0.0', port: 4180 },
  build: { outDir: 'dist', sourcemap: true }
});

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => ({
  define: {
    __DEBUG_PANEL__: mode === 'development',
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        chronography: resolve(__dirname, 'chronography.html'),
        human: resolve(__dirname, 'human.html'),
      },
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
}));

import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  define: {
    __DEBUG_PANEL__: mode === 'development',
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
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

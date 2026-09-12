import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Source maps are emitted for local debugging but excluded from the shipped
    // image: dist/ is copied wholesale into the container, and publishing full
    // application source there both discloses it and inflates the image well beyond
    // what the bundle itself costs. Set TOOLBOX_SOURCEMAPS=true to build them.
    sourcemap: process.env.TOOLBOX_SOURCEMAPS === 'true',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/yaml')) return 'yaml-chunk';
          if (id.includes('node_modules/fast-xml-parser')) return 'xml-chunk';
          if (id.includes('node_modules/papaparse')) return 'csv-chunk';
          if (id.includes('node_modules/idb')) return 'idb-chunk';
          if (id.includes('node_modules/ajv')) return 'ajv-chunk';
        },
      },
    },

  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
});

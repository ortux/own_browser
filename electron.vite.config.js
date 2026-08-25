import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const isProd = process.env.NODE_ENV === 'production';

// Fast minification, no sourcemaps, modern targets — Electron's bundled
// Chromium/Node are recent enough for ES2022, which keeps bundles small.
export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      minify: isProd,
      sourcemap: false,
      reportCompressedSize: false,
      target: 'node22',
      rollupOptions: {
        external: ['sql.js'],
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      minify: isProd,
      sourcemap: false,
      reportCompressedSize: false,
      target: 'node22',
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@': '/src/renderer',
      },
    },
    plugins: [tailwindcss(), react()],
    server: {
      port: 5173,
      strictPort: false,
    },
    build: {
      outDir: 'dist/renderer',
      minify: isProd ? 'esbuild' : false,
      sourcemap: false,
      reportCompressedSize: false,
      target: 'es2022',
      cssMinify: isProd,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        input: 'src/renderer/index.html',
      },
    },
  },
});

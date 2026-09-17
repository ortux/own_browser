import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
      commonjsOptions: {
        exclude: [/node_modules[\\/]fluent-ffmpeg[\\/]/],
      },
      rollupOptions: {
        // Externalize everything in node_modules. The main process runs in
        // Node — there is no benefit to bundling dependencies and doing so
        // breaks packages with native code, conditional requires, or unusual
        // module layouts (e.g. whatsapp-web.js / puppeteer / fluent-ffmpeg).
        external(id) {
          if (id.endsWith('/lib-cov/fluent-ffmpeg') || id === './lib-cov/fluent-ffmpeg') {
            return true;
          }
          if (id === 'bufferutil' || id === 'utf-8-validate') return true;
          // Keep entry point and all local source files internal
          if (id.startsWith('.') || id.startsWith('/') || id.startsWith('src/')) return false;
          // Externalize Node built-ins and every npm package
          return true;
        },
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
        input: {
          index: 'src/preload/index.ts',
          webviewPreload: 'src/preload/webviewPreload.js',
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
      },
    },
  },
  renderer: {
    // The renderer root is src/renderer, so Vite would otherwise look for
    // src/renderer/public and silently ship nothing. The OAuth callback pages
    // and the app icon live in the repo-root public/ folder.
    publicDir: resolve(__dirname, 'public'),
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

// electron.vite.config.js
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
var __electron_vite_injected_import_meta_url = "file:///E:/own_browser/electron.vite.config.js";
var __dirname = dirname(fileURLToPath(__electron_vite_injected_import_meta_url));
var isProd = process.env.NODE_ENV === "production";
var electron_vite_config_default = defineConfig({
  main: {
    build: {
      outDir: "dist/main",
      minify: isProd,
      sourcemap: false,
      reportCompressedSize: false,
      target: "node22",
      commonjsOptions: {
        exclude: [/node_modules[\\/]fluent-ffmpeg[\\/]/]
      },
      rollupOptions: {
        // Externalize everything in node_modules. The main process runs in
        // Node — there is no benefit to bundling dependencies and doing so
        // breaks packages with native code, conditional requires, or unusual
        // module layouts (e.g. whatsapp-web.js / puppeteer / fluent-ffmpeg).
        external(id) {
          if (id.endsWith("/lib-cov/fluent-ffmpeg") || id === "./lib-cov/fluent-ffmpeg") {
            return true;
          }
          if (id === "bufferutil" || id === "utf-8-validate") return true;
          if (id.startsWith(".") || id.startsWith("/") || id.startsWith("src/")) return false;
          return true;
        }
      }
    }
  },
  preload: {
    build: {
      outDir: "dist/preload",
      minify: isProd,
      sourcemap: false,
      reportCompressedSize: false,
      target: "node22",
      rollupOptions: {
        input: {
          index: "src/preload/index.ts",
          webviewPreload: "src/preload/webviewPreload.js"
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].js"
        }
      }
    }
  },
  renderer: {
    // The renderer root is src/renderer, so Vite would otherwise look for
    // src/renderer/public and silently ship nothing. The OAuth callback pages
    // and the app icon live in the repo-root public/ folder.
    publicDir: resolve(__dirname, "public"),
    resolve: {
      alias: {
        "@": "/src/renderer"
      }
    },
    plugins: [tailwindcss(), react()],
    server: {
      port: 5173,
      strictPort: false
    },
    build: {
      outDir: "dist/renderer",
      minify: isProd ? "esbuild" : false,
      sourcemap: false,
      reportCompressedSize: false,
      target: "es2022",
      cssMinify: isProd,
      chunkSizeWarningLimit: 1e3,
      rollupOptions: {
        input: "src/renderer/index.html"
      }
    }
  }
});
export {
  electron_vite_config_default as default
};

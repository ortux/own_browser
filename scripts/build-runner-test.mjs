/**
 * Bundles the agent runner test with the esbuild API rather than the CLI.
 *
 * The runner (via agent.ts) imports its injected page helper with Vite's
 * `?raw` suffix; the CLI cannot resolve that query, so this little plugin
 * strips it and inlines the file as a JSON string — exactly what `?raw`
 * does in the real build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(root, 'src/main/agentRunner.test.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(root, '.tmp-agentrunner-test.mjs'),
  alias: { electron: path.join(root, 'src/main/__mocks__/electron.ts') },
  plugins: [
    {
      name: 'vite-raw',
      setup(builder) {
        builder.onResolve({ filter: /\?raw$/ }, (args) => ({
          path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/, '')),
          namespace: 'raw',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'raw' }, async (args) => ({
          contents: JSON.stringify(await fs.promises.readFile(args.path, 'utf8')),
          loader: 'json',
        }));
      },
    },
  ],
  logLevel: 'info',
});

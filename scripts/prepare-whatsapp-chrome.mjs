import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(projectRoot, 'resources', 'whatsapp-chrome');
const puppeteerCli = path.join(projectRoot, 'node_modules', 'puppeteer', 'lib', 'cjs', 'puppeteer', 'node', 'cli.js');

function findChrome(root, depth = 0) {
  if (!fs.existsSync(root) || depth > 6) return null;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && (entry.name === 'chrome.exe' || entry.name === 'chrome' || entry.name === 'Google Chrome')) {
      return candidate;
    }
    if (entry.isDirectory()) {
      const result = findChrome(candidate, depth + 1);
      if (result) return result;
    }
  }
  return null;
}

function findArchive(root, depth = 0) {
  if (!fs.existsSync(root) || depth > 6) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && entry.name.endsWith('.zip')) return candidate;
    if (entry.isDirectory()) {
      const result = findArchive(candidate, depth + 1);
      if (result) return result;
    }
  }
  return null;
}

function extractArchiveIfNeeded() {
  const archive = findArchive(cacheDir);
  if (!archive) return;
  console.log(`[whatsapp-chrome] Extracting ${path.basename(archive)}`);
  const result = spawnSync('tar', ['-xf', archive, '-C', path.dirname(archive)], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('[whatsapp-chrome] Could not extract the downloaded Chrome archive.');
    process.exit(result.status ?? 1);
  }
  fs.rmSync(archive, { force: true });
  for (const entry of fs.readdirSync(path.dirname(archive), { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('win64-')) {
      fs.rmSync(path.join(path.dirname(archive), entry.name), { recursive: true, force: true });
    }
  }
}

fs.mkdirSync(cacheDir, { recursive: true });
extractArchiveIfNeeded();
if (findChrome(cacheDir)) {
  console.log(`[whatsapp-chrome] Browser already prepared in ${cacheDir}`);
  process.exit(0);
}

if (!fs.existsSync(puppeteerCli)) {
  console.error(`[whatsapp-chrome] Puppeteer CLI not found: ${puppeteerCli}`);
  process.exit(1);
}

console.log(`[whatsapp-chrome] Downloading Chrome into ${cacheDir}`);
const result = spawnSync(process.execPath, [puppeteerCli, 'browsers', 'install', 'chrome'], {
  env: { ...process.env, PUPPETEER_CACHE_DIR: cacheDir },
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!findChrome(cacheDir)) {
  console.error('[whatsapp-chrome] Download completed but no Chrome executable was found.');
  process.exit(1);
}

console.log('[whatsapp-chrome] Browser prepared successfully.');

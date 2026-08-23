import { app, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * SECURITY: The Pexels API key is read from the environment (process.env or a
 * local .env file). It never leaves the main process — the renderer only ever
 * receives pre-fetched image URLs, never the key itself.
 */
function getApiKey(): string {
  const fromEnv = process.env.PEXELS_API_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  // Fallback: read a local .env file (electron-vite loads this in dev; in a
  // packaged build we read it manually from the project/app resources).
  try {
    const candidates = [
      path.join(process.cwd(), '.env'),
      path.join(app.getAppPath?.() ?? process.cwd(), '.env'),
      // Packaged build: electron-builder copies .env into resources/ (outside asar)
      path.join(process.resourcesPath ?? process.cwd(), '.env'),
    ];
    for (const envPath of candidates) {
      if (!fs.existsSync(envPath)) continue;
      const content = fs.readFileSync(envPath, 'utf-8');
      const match = content.match(/PEXELS_API_KEY\s*=\s*([^\r\n]+)/);
      if (match) {
        const value = match[1].trim().replace(/^["']|["']$/g, '');
        if (value) return value;
      }
    }
  } catch {
    // ignore — key may simply be unavailable
  }
  return '';
}

const CATEGORY_QUERIES: Record<string, string[]> = {
  nature: ['nature', 'forest', 'mountain', 'ocean', 'landscape', 'aurora'],
  technology: ['technology', 'computer', 'circuit', 'robotics', 'code', 'futuristic'],
  space: ['space', 'galaxy', 'nebula', 'stars', 'astronaut', 'milky way'],
};

const FALLBACK_QUERIES = ['nature', 'technology', 'space'];

/**
 * Build a sized, cropped image URL so the file is small enough to appear
 * instantly rather than loading progressively line-by-line.
 */
function buildImageUrl(photo: any): string {
  const base = String(photo?.src?.large2x || photo?.src?.original || '').split('?')[0];
  if (!base) return '';
  return `${base}?auto=compress&cs=tinysrgb&w=1920&h=1080&fit=crop`;
}

export function registerPexelsHandlers() {
  ipcMain.handle('pexels:image', async (_event, category?: string) => {
    const key = getApiKey();
    if (!key) {
      console.warn('[Pexels] No API key configured (set PEXELS_API_KEY).');
      return null;
    }

    const pool =
      category && CATEGORY_QUERIES[category]
        ? CATEGORY_QUERIES[category]
        : FALLBACK_QUERIES;

    const query = pool[Math.floor(Math.random() * pool.length)];

    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(
          query
        )}&per_page=40&orientation=landscape`,
        { headers: { Authorization: key } }
      );
      if (!res.ok) {
        console.warn(`[Pexels] API responded ${res.status}`);
        return null;
      }
      const data = await res.json();
      const photos: any[] = data?.photos;
      if (!photos || photos.length === 0) return null;

      const photo = photos[Math.floor(Math.random() * photos.length)];
      const url = buildImageUrl(photo);
      if (!url) return null;

      return {
        url,
        photographer: photo.photographer ?? 'Unknown',
        link: photo.url ?? '',
        query,
      };
    } catch (err) {
      console.warn('[Pexels] Request failed:', err);
      return null;
    }
  });
}

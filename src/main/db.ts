/**
 * db.ts — Zyphora SQLite persistence layer
 *
 * Uses sql.js (SQLite compiled to WebAssembly).
 * Works inside Electron's main process on any Node version.
 * Data is persisted to disk via fs.readFileSync / fs.writeFileSync.
 */

import { createRequire } from 'module';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

// sql.js exports an async init factory
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs = require('sql.js') as (config?: object) => Promise<SqlJsStatic>;

// ── Minimal type shim for sql.js ─────────────────────────────────────────────

interface SqlJsStatic {
  Database: new (data?: ArrayLike<number> | null) => SqlDatabase;
}

interface SqlStatement {
  run(params?: BindParams): void;
  bind(params?: BindParams): void;
  get(params?: BindParams): unknown[] | undefined;
  getAsObject(params?: BindParams): Record<string, unknown>;
  step(): boolean;
  reset(): void;
  free(): void;
}

type BindParams = unknown[] | Record<string, unknown> | null;

interface QueryExecResult {
  columns: string[];
  values: unknown[][];
}

interface SqlDatabase {
  run(sql: string, params?: BindParams): SqlDatabase;
  prepare(sql: string): SqlStatement;
  exec(sql: string): QueryExecResult[];
  export(): Uint8Array;
  close(): void;
}

// ── Public types ─────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: number;
  url: string;
  title: string;
  favicon: string | null;
  visited_at: number;
}

export interface Bookmark {
  id: number;
  url: string;
  title: string;
  favicon: string | null;
  created_at: number;
}

// ── DB singleton ─────────────────────────────────────────────────────────────

let _db: SqlDatabase | null = null;
let _dbPath: string = '';

/** One-time initialisation — must be awaited before any db call. */
export async function initDb(): Promise<void> {
  if (_db) return;

  // Load the WASM binary bundled with sql.js
  const wasmPath = path.join(
    path.dirname(require.resolve('sql.js')),
    'sql-wasm.wasm'
  );
  const wasmBinary = fs.readFileSync(wasmPath);

  const SQL = await initSqlJs({ wasmBinary });

  _dbPath = path.join(app.getPath('userData'), 'zyphora.db');

  // Restore from disk if the file already exists
  let data: Buffer | null = null;
  if (fs.existsSync(_dbPath)) {
    data = fs.readFileSync(_dbPath);
  }

  _db = new SQL.Database(data ? new Uint8Array(data) : null);

  // Schema
  _db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      url        TEXT    NOT NULL,
      title      TEXT    NOT NULL DEFAULT '',
      favicon    TEXT,
      visited_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_visited_at ON history(visited_at);
    CREATE TABLE IF NOT EXISTS bookmarks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      url        TEXT    NOT NULL UNIQUE,
      title      TEXT    NOT NULL DEFAULT '',
      favicon    TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  persist();
}

/** Write the in-memory database to disk. Call after every write. */
function persist() {
  if (!_db || !_dbPath) return;
  const data = _db.export();
  fs.writeFileSync(_dbPath, Buffer.from(data));
}

function db(): SqlDatabase {
  if (!_db) throw new Error('DB not initialised — call initDb() first');
  return _db;
}

// ── Helpers: rows → typed objects ────────────────────────────────────────────

function rowsToHistory(results: QueryExecResult[]): HistoryEntry[] {
  if (!results.length) return [];
  const { columns, values } = results[0];
  return values.map((row) =>
    Object.fromEntries(columns.map((c, i) => [c, row[i]])) as unknown as HistoryEntry
  );
}

function rowsToBookmarks(results: QueryExecResult[]): Bookmark[] {
  if (!results.length) return [];
  const { columns, values } = results[0];
  return values.map((row) =>
    Object.fromEntries(columns.map((c, i) => [c, row[i]])) as unknown as Bookmark
  );
}

// ── History ───────────────────────────────────────────────────────────────────

export function addHistory(url: string, title: string, favicon?: string) {
  if (!url || url.startsWith('about:')) return;
  const now = Date.now();

  // De-dupe: skip if the same URL was recorded within the last 30 seconds
  const stmt = db().prepare(
    'SELECT id FROM history WHERE url = ? AND visited_at > ? LIMIT 1'
  );
  stmt.bind([url, now - 30_000]);
  const exists = stmt.step();
  stmt.free();
  if (exists) {
    // Still update the title/favicon on the existing row if we now have them
    if (title && title !== 'Loading...') {
      db().run(
        `UPDATE history SET title = ?, favicon = ? WHERE url = ? AND visited_at > ?`,
        [title, favicon ?? null, url, now - 30_000]
      );
      persist();
    }
    return;
  }

  db().run(
    'INSERT INTO history (url, title, favicon, visited_at) VALUES (?, ?, ?, ?)',
    [url, title || url, favicon ?? null, now]
  );
  persist();
}

export function getHistory(limit = 200): HistoryEntry[] {
  return rowsToHistory(
    db().exec(`SELECT * FROM history ORDER BY visited_at DESC LIMIT ${Number(limit)}`)
  );
}

export function searchHistory(query: string, limit = 100): HistoryEntry[] {
  const q = `%${query}%`;
  return rowsToHistory(
    db().exec(
      `SELECT * FROM history WHERE url LIKE '${q.replace(/'/g, "''")}' OR title LIKE '${q.replace(/'/g, "''")}' ORDER BY visited_at DESC LIMIT ${Number(limit)}`
    )
  );
}

export function deleteHistoryEntry(id: number) {
  db().run('DELETE FROM history WHERE id = ?', [id]);
  persist();
}

export function clearHistory() {
  db().run('DELETE FROM history');
  persist();
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export function addBookmark(url: string, title: string, favicon?: string): Bookmark {
  db().run(
    `INSERT INTO bookmarks (url, title, favicon, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET title = excluded.title, favicon = excluded.favicon`,
    [url, title || url, favicon ?? null, Date.now()]
  );
  persist();
  return rowsToBookmarks(
    db().exec(`SELECT * FROM bookmarks WHERE url = '${url.replace(/'/g, "''")}'`)
  )[0];
}

export function removeBookmark(url: string) {
  db().run('DELETE FROM bookmarks WHERE url = ?', [url]);
  persist();
}

export function isBookmarked(url: string): boolean {
  const stmt = db().prepare('SELECT id FROM bookmarks WHERE url = ? LIMIT 1');
  stmt.bind([url]);
  const found = stmt.step();
  stmt.free();
  return found;
}

export function getBookmarks(): Bookmark[] {
  return rowsToBookmarks(
    db().exec('SELECT * FROM bookmarks ORDER BY created_at DESC')
  );
}

export function searchBookmarks(query: string): Bookmark[] {
  const q = `%${query}%`;
  return rowsToBookmarks(
    db().exec(
      `SELECT * FROM bookmarks WHERE url LIKE '${q.replace(/'/g, "''")}' OR title LIKE '${q.replace(/'/g, "''")}' ORDER BY created_at DESC`
    )
  );
}

export function closeDb() {
  if (_db) {
    persist();
    _db.close();
    _db = null;
  }
}

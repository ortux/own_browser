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

  const createSchema = (database: SqlDatabase) => database.run(`
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
    CREATE TABLE IF NOT EXISTS passwords (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      origin     TEXT    NOT NULL,
      username   TEXT    NOT NULL,
      password   TEXT    NOT NULL,
      title      TEXT    NOT NULL DEFAULT '',
      favicon    TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(origin, username)
    );
  `);

  try {
    _db = new SQL.Database(data ? new Uint8Array(data) : null);
    createSchema(_db);
  } catch (error) {
    // A truncated/corrupt sql.js file should not prevent the browser shell from
    // opening. Preserve it for diagnosis and start with a clean database.
    console.error('[db] database restore failed; creating a fresh database:', error);
    try { _db?.close(); } catch { /* best effort */ }
    _db = null;
    if (fs.existsSync(_dbPath)) {
      const backupPath = `${_dbPath}.corrupt-${Date.now()}`;
      try { fs.renameSync(_dbPath, backupPath); } catch (renameError) {
        console.error('[db] could not preserve corrupt database:', renameError);
      }
    }
    _db = new SQL.Database(null);
    createSchema(_db);
  }

  persist();
}

/** Write the in-memory database to disk. Call after every write. */
function persist() {
  if (!_db || !_dbPath) return;
  const data = _db.export();
  const tempPath = `${_dbPath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tempPath, Buffer.from(data));
    fs.renameSync(tempPath, _dbPath);
  } catch (error) {
    try { fs.rmSync(tempPath, { force: true }); } catch { /* best effort */ }
    console.error('[db] could not persist local data; continuing in memory:', error);
  }
}

function db(): SqlDatabase {
  if (!_db) throw new Error('DB not initialised — call initDb() first');
  return _db;
}

// ── Helpers: rows → typed objects ────────────────────────────────────────────

function rowsToBookmarks(results: QueryExecResult[]): Bookmark[] {
  if (!results.length) return [];
  const { columns, values } = results[0];
  return values.map((row) =>
    Object.fromEntries(columns.map((c, i) => [c, row[i]])) as unknown as Bookmark
  );
}

function queryObjects(sql: string, params: BindParams = []): Record<string, unknown>[] {
  const statement = db().prepare(sql);
  statement.bind(params);
  const rows: Record<string, unknown>[] = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

function safeLimit(value: number, fallback: number, maximum: number): number {
  return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

function escapedLikePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
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

export function updateHistoryMetadata(url: string, title: string, favicon?: string): void {
  if (!url || !title || title === 'Loading...') return;
  db().run(
    `UPDATE history SET title = ?, favicon = ?
     WHERE id = (
       SELECT id FROM history WHERE url = ? ORDER BY visited_at DESC LIMIT 1
     )`,
    [title, favicon ?? null, url]
  );
  persist();
}

export function getHistory(limit = 200): HistoryEntry[] {
  const safe = safeLimit(limit, 200, 500);
  return queryObjects(
    'SELECT * FROM history ORDER BY visited_at DESC LIMIT ?',
    [safe]
  ) as unknown as HistoryEntry[];
}

export function searchHistory(query: string, limit = 100): HistoryEntry[] {
  const safe = safeLimit(limit, 100, 500);
  const pattern = escapedLikePattern(query);
  return queryObjects(
    `SELECT * FROM history
     WHERE url LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\'
     ORDER BY visited_at DESC LIMIT ?`,
    [pattern, pattern, safe]
  ) as unknown as HistoryEntry[];
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
  return queryObjects(
    'SELECT * FROM bookmarks WHERE url = ? LIMIT 1',
    [url]
  )[0] as unknown as Bookmark;
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
  const pattern = escapedLikePattern(query);
  return queryObjects(
    `SELECT * FROM bookmarks
     WHERE url LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\'
     ORDER BY created_at DESC LIMIT 500`,
    [pattern, pattern]
  ) as unknown as Bookmark[];
}

export function closeDb() {
  if (_db) {
    persist();
    _db.close();
    _db = null;
  }
}

// ── Passwords ─────────────────────────────────────────────────────────────────

export interface SavedPassword {
  id: number;
  origin: string;    // e.g. "https://github.com"
  username: string;
  password: string;
  title: string;
  favicon: string | null;
  created_at: number;
  updated_at: number;
}

export function savePassword(
  origin: string,
  username: string,
  password: string,
  title = '',
  favicon?: string
): SavedPassword {
  const now = Date.now();
  db().run(
    `INSERT INTO passwords (origin, username, password, title, favicon, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(origin, username) DO UPDATE SET
       password   = excluded.password,
       title      = excluded.title,
       favicon    = excluded.favicon,
       updated_at = excluded.updated_at`,
    [origin, username, password, title, favicon ?? null, now, now]
  );
  persist();
  return queryObjects(
    'SELECT * FROM passwords WHERE origin = ? AND username = ? LIMIT 1',
    [origin, username]
  )[0] as unknown as SavedPassword;
}

export function getPasswordsForOrigin(origin: string): SavedPassword[] {
  return queryObjects(
    'SELECT * FROM passwords WHERE origin = ? ORDER BY updated_at DESC',
    [origin]
  ) as unknown as SavedPassword[];
}

export function getAllPasswords(): SavedPassword[] {
  return queryObjects(
    'SELECT id, origin, username, title, favicon, created_at, updated_at FROM passwords ORDER BY updated_at DESC'
  ) as unknown as SavedPassword[];
}

export function getPasswordById(id: number): SavedPassword | null {
  const rows = queryObjects('SELECT * FROM passwords WHERE id = ? LIMIT 1', [id]);
  return rows.length ? (rows[0] as unknown as SavedPassword) : null;
}

export function searchPasswords(query: string): SavedPassword[] {
  const pattern = escapedLikePattern(query);
  return queryObjects(
    `SELECT id, origin, username, title, favicon, created_at, updated_at FROM passwords
     WHERE origin LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\'
     ORDER BY updated_at DESC LIMIT 500`,
    [pattern, pattern, pattern]
  ) as unknown as SavedPassword[];
}

export function deletePassword(id: number) {
  db().run('DELETE FROM passwords WHERE id = ?', [id]);
  persist();
}

export function clearPasswords() {
  db().run('DELETE FROM passwords');
  persist();
}

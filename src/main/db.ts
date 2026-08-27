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
import { encryptBuffer, decryptBuffer, isEncryptedFile } from './secureDb';
import { getOrCreateDbKey } from './secureDbKey';

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
let _encPath: string = '';
/** AES-256 key from the OS keychain, or null when unavailable (plaintext mode). */
let _key: Buffer | null = null;

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
  _encPath = `${_dbPath}.enc`;
  _key = getOrCreateDbKey();

  // Load precedence: encrypted store, then legacy plaintext.
  let data: Buffer | null = null;
  if (_key && fs.existsSync(_encPath)) {
    try {
      const raw = fs.readFileSync(_encPath);
      if (isEncryptedFile(raw)) {
        data = decryptBuffer(_key, raw);
      } else {
        // Not our format — treat as corrupt rather than feeding garbage to sql.js.
        throw new Error('encrypted store has an unexpected format');
      }
    } catch (error) {
      // A keychain change or tampered file makes the store unreadable.
      // Preserve it for diagnosis and continue with a clean database.
      console.error('[db] encrypted database could not be opened; starting fresh:', error);
      try { fs.renameSync(_encPath, `${_encPath}.corrupt-${Date.now()}`); } catch { /* best effort */ }
      data = null;
    }
  }
  if (!data && fs.existsSync(_dbPath)) {
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
    CREATE TABLE IF NOT EXISTS downloads (
      id            TEXT PRIMARY KEY,
      filename      TEXT    NOT NULL,
      url           TEXT    NOT NULL,
      state         TEXT    NOT NULL,
      receivedBytes INTEGER NOT NULL DEFAULT 0,
      totalBytes    INTEGER NOT NULL DEFAULT 0,
      percent       REAL    NOT NULL DEFAULT 0,
      path          TEXT    NOT NULL,
      startTime     INTEGER NOT NULL,
      endTime       INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_downloads_startTime ON downloads(startTime);
    CREATE TABLE IF NOT EXISTS session_tabs (
      position INTEGER PRIMARY KEY,
      tabId    TEXT    NOT NULL,
      url      TEXT    NOT NULL,
      title    TEXT    NOT NULL,
      pinned   INTEGER NOT NULL DEFAULT 0,
      muted    INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings_kv (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
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

  schedulePersist();
}

/** Write the in-memory database to disk atomically (temp file + rename).
 * With an OS-keychain key available the store is AES-256-GCM encrypted;
 * otherwise it falls back to the legacy plaintext file. */
function persist() {
  if (!_db || !_dbPath) return;
  const data = Buffer.from(_db.export());
  if (_key) {
    const tempPath = `${_encPath}.tmp-${process.pid}`;
    try {
      fs.writeFileSync(tempPath, encryptBuffer(_key, data));
      fs.renameSync(tempPath, _encPath);
      // First successful encrypted write completes the migration: keep the
      // old plaintext file around (clearly renamed) instead of destroying it.
      if (fs.existsSync(_dbPath)) {
        try { fs.renameSync(_dbPath, `${_dbPath}.legacy-plaintext`); } catch { /* best effort */ }
      }
    } catch (error) {
      try { fs.rmSync(tempPath, { force: true }); } catch { /* best effort */ }
      console.error('[db] could not persist encrypted local data; continuing in memory:', error);
    }
    return;
  }
  const tempPath = `${_dbPath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tempPath, data);
    fs.renameSync(tempPath, _dbPath);
  } catch (error) {
    try { fs.rmSync(tempPath, { force: true }); } catch { /* best effort */ }
    console.error('[db] could not persist local data; continuing in memory:', error);
  }
}

// Exporting the whole sql.js database on EVERY write is O(db size); as the
// database grows that stalls the main process. Writes are therefore coalesced
// into one debounced flush, plus a synchronous flush on quit.
const PERSIST_DEBOUNCE_MS = 600;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Schedule a debounced write. Call after every mutation. */
function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persist();
  }, PERSIST_DEBOUNCE_MS);
}

/** Flush any pending debounced write immediately (used on quit). */
export function flushPersist() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  schedulePersist();
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
      schedulePersist();
    }
    return;
  }

  db().run(
    'INSERT INTO history (url, title, favicon, visited_at) VALUES (?, ?, ?, ?)',
    [url, title || url, favicon ?? null, now]
  );
  schedulePersist();
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
  schedulePersist();
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
  schedulePersist();
}

/** Delete history entries newer than `since` (unix ms). Used by Clear-data. */
export function deleteHistorySince(since: number): number {
  db().run('DELETE FROM history WHERE visited_at >= ?', [since]);
  schedulePersist();
  return db().exec('SELECT changes()')[0]?.values[0]?.[0] as number ?? 0;
}

export function clearHistory() {
  db().run('DELETE FROM history');
  schedulePersist();
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export function addBookmark(
  url: string,
  title: string,
  favicon?: string,
  createdAt?: number,
): Bookmark {
  db().run(
    `INSERT INTO bookmarks (url, title, favicon, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET title = excluded.title, favicon = excluded.favicon`,
    [url, title || url, favicon ?? null, createdAt ?? Date.now()]
  );
  schedulePersist();
  return queryObjects(
    'SELECT * FROM bookmarks WHERE url = ? LIMIT 1',
    [url]
  )[0] as unknown as Bookmark;
}

export function removeBookmark(url: string) {
  db().run('DELETE FROM bookmarks WHERE url = ?', [url]);
  schedulePersist();
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
    flushPersist();
    _db.close();
    _db = null;
  }
}

// ── Download history persistence ─────────────────────────────────────────────

interface DownloadRow {
  id: string;
  filename: string;
  url: string;
  state: string;
  receivedBytes: number;
  totalBytes: number;
  percent: number;
  path: string;
  startTime: number;
  endTime: number | null;
}

function isTerminalDownloadState(state: unknown): boolean {
  return state === 'completed' || state === 'canceled' || state === 'interrupted';
}

/** Upsert a terminal download record (in-flight state stays in memory). */
export function saveDownloadRecord(record: DownloadRow): void {
  if (!isTerminalDownloadState(record.state)) return;
  db().run(
    `INSERT INTO downloads (id, filename, url, state, receivedBytes, totalBytes, percent, path, startTime, endTime)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       state = excluded.state,
       receivedBytes = excluded.receivedBytes,
       totalBytes = excluded.totalBytes,
       percent = excluded.percent,
       endTime = excluded.endTime`,
    [
      record.id, record.filename, record.url, record.state,
      Math.max(0, Math.floor(record.receivedBytes)), Math.max(0, Math.floor(record.totalBytes)),
      record.percent, record.path, Math.floor(record.startTime),
      record.endTime === null ? null : Math.floor(record.endTime),
    ]
  );
  schedulePersist();
}

/** Load persisted terminal download records (newest first). */
export function loadDownloadRecords(): DownloadRow[] {
  return queryObjects(
    'SELECT * FROM downloads ORDER BY startTime DESC LIMIT 500'
  ) as unknown as DownloadRow[];
}

/** Remove persisted download records older than `days` days (0 = all). */
export function pruneDownloadRecords(days: number): void {
  if (days <= 0) {
    db().run('DELETE FROM downloads');
  } else {
    db().run('DELETE FROM downloads WHERE startTime < ?', [Date.now() - days * 86_400_000]);
  }
  schedulePersist();
}

export function clearDownloadRecords(): void {
  db().run('DELETE FROM downloads');
  schedulePersist();
}

// ── Session restore ──────────────────────────────────────────────────────────

export interface SessionTabRow {
  tabId: string;
  url: string;
  title: string;
  pinned: boolean;
  muted: boolean;
}

/** Persist the open (non-private) tabs for "continue where you left off". */
export function saveSessionTabs(
  tabs: SessionTabRow[],
  activeTabId: string
): void {
  db().run('DELETE FROM session_tabs');
  tabs.forEach((tab, index) => {
    db().run(
      'INSERT INTO session_tabs (position, tabId, url, title, pinned, muted) VALUES (?, ?, ?, ?, ?, ?)',
      [index, tab.tabId, tab.url, tab.title, tab.pinned ? 1 : 0, tab.muted ? 1 : 0]
    );
  });
  setSetting('sessionActiveTab', activeTabId);
  schedulePersist();
}

export function loadSessionTabs(): { tabs: SessionTabRow[]; activeTabId: string | null } {
  const rows = queryObjects('SELECT * FROM session_tabs ORDER BY position ASC') as unknown as {
    tabId: string; url: string; title: string; pinned: number; muted: number;
  }[];
  return {
    tabs: rows.map((row) => ({
      tabId: row.tabId,
      url: row.url,
      title: row.title,
      pinned: row.pinned === 1,
      muted: row.muted === 1,
    })),
    activeTabId: getSetting('sessionActiveTab'),
  };
}

export function clearSessionTabs(): void {
  db().run('DELETE FROM session_tabs');
  schedulePersist();
}

// ── Key/value settings (main-process side) ───────────────────────────────────

export function getSetting(key: string): string | null {
  const rows = queryObjects('SELECT value FROM settings_kv WHERE key = ?', [key]);
  const value = rows[0]?.value;
  return typeof value === 'string' ? value : null;
}

export function setSetting(key: string, value: string): void {
  db().run(
    `INSERT INTO settings_kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
  schedulePersist();
}

// ── Diagnostics ──────────────────────────────────────────────────────────────

export function getDbDiagnostics(): { sizeBytes: number; path: string; encrypted: boolean } {
  let sizeBytes = 0;
  const target = _key ? _encPath : _dbPath;
  try {
    sizeBytes = fs.statSync(target).size;
  } catch { /* not persisted yet */ }
  return { sizeBytes, path: target, encrypted: _key !== null };
}

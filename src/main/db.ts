/**
 * db.ts — Zyphora SQLite persistence layer
 *
 * Uses sql.js (SQLite compiled to WebAssembly).
 * Works inside Electron's main process on any Node version.
 * Data is persisted to disk via fs.readFileSync / fs.writeFileSync.
 */

import { createRequire } from 'module';
import { app, safeStorage } from 'electron';
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
  const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
  const wasmBinary = fs.readFileSync(wasmPath);

  const SQL = await initSqlJs({ wasmBinary });

  _dbPath = path.join(app.getPath('userData'), 'zyphora.db');

  // Restore from disk if the file already exists
  let data: Buffer | null = null;
  if (fs.existsSync(_dbPath)) {
    data = fs.readFileSync(_dbPath);
  }

  const createSchema = (database: SqlDatabase) =>
    database.run(`
    CREATE TABLE IF NOT EXISTS history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      url        TEXT    NOT NULL,
      title      TEXT    NOT NULL DEFAULT '',
      favicon    TEXT,
      visited_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_visited_at ON history(visited_at);
    CREATE INDEX IF NOT EXISTS idx_history_url_visited ON history(url, visited_at);
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

    -- ── Application / Notification Engine tables ─────────────────────────────

    CREATE TABLE IF NOT EXISTS engine_accounts (
      id           TEXT    PRIMARY KEY,
      provider     TEXT    NOT NULL,
      display_name TEXT    NOT NULL DEFAULT '',
      email        TEXT,
      avatar       TEXT,
      created_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS engine_integration_states (
      provider      TEXT    NOT NULL,
      account_id    TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'disconnected',
      connected_at  INTEGER,
      last_event_at INTEGER,
      last_error    TEXT,        -- JSON: IntegrationError | null
      updated_at    INTEGER NOT NULL,
      PRIMARY KEY (provider, account_id)
    );

    CREATE TABLE IF NOT EXISTS engine_processed_events (
      event_id     TEXT    PRIMARY KEY,
      provider     TEXT    NOT NULL,
      processed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS engine_notifications (
      id           TEXT    PRIMARY KEY,
      provider     TEXT    NOT NULL,
      account_id   TEXT,
      event_type   TEXT    NOT NULL,
      title        TEXT,
      body         TEXT,
      icon         TEXT,
      action_url   TEXT,
      payload      TEXT,        -- JSON blob
      priority     TEXT    NOT NULL DEFAULT 'normal',
      created_at   INTEGER NOT NULL,
      read_at      INTEGER,
      dismissed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_engine_notifications_created
      ON engine_notifications(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_engine_notifications_provider
      ON engine_notifications(provider);
  `);

  try {
    _db = new SQL.Database(data ? new Uint8Array(data) : null);
    createSchema(_db);
  } catch (error) {
    // A truncated/corrupt sql.js file should not prevent the browser shell from
    // opening. Preserve it for diagnosis and start with a clean database.
    console.error('[db] database restore failed; creating a fresh database:', error);
    try {
      _db?.close();
    } catch {
      /* best effort */
    }
    _db = null;
    if (fs.existsSync(_dbPath)) {
      const backupPath = `${_dbPath}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(_dbPath, backupPath);
      } catch (renameError) {
        console.error('[db] could not preserve corrupt database:', renameError);
      }
    }
    _db = new SQL.Database(null);
    createSchema(_db);
  }

  persist();
}

/**
 * How long writes are coalesced before hitting the disk.
 *
 * sql.js has no incremental write path: persisting means serialising the whole
 * database and rewriting the file. Doing that synchronously on every single
 * row — addHistory fires on every page load — rewrites megabytes per
 * navigation and stalls the main process. Batching turns a burst of writes
 * into one file rewrite; `flushDb()` covers the shutdown case so nothing is
 * lost.
 */
const PERSIST_DEBOUNCE_MS = 1_000;

let persistTimer: NodeJS.Timeout | null = null;
let persistPending = false;

/** Serialise and atomically replace the database file. */
function persistNow() {
  if (!_db || !_dbPath) return;
  persistPending = false;
  const data = _db.export();
  const tempPath = `${_dbPath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tempPath, Buffer.from(data));
    fs.renameSync(tempPath, _dbPath);
  } catch (error) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      /* best effort */
    }
    console.error('[db] could not persist local data; continuing in memory:', error);
  }
}

/** Queue a debounced write. Call after every mutation. */
function persist() {
  if (!_db || !_dbPath) return;
  persistPending = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistNow();
  }, PERSIST_DEBOUNCE_MS);
  // Never hold the event loop open just to flush the database.
  persistTimer.unref?.();
}

/**
 * Write any pending changes immediately. Must be called before quitting, and
 * any time losing the last second of writes would be unacceptable.
 */
export function flushDb() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (persistPending) persistNow();
}

function db(): SqlDatabase {
  if (!_db) throw new Error('DB not initialised — call initDb() first');
  return _db;
}

// ── Helpers: rows → typed objects ────────────────────────────────────────────

function rowsToBookmarks(results: QueryExecResult[]): Bookmark[] {
  if (!results.length) return [];
  const { columns, values } = results[0];
  return values.map(
    (row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])) as unknown as Bookmark
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
  const stmt = db().prepare('SELECT id FROM history WHERE url = ? AND visited_at > ? LIMIT 1');
  stmt.bind([url, now - 30_000]);
  const exists = stmt.step();
  stmt.free();
  if (exists) {
    // Still update the title/favicon on the existing row if we now have them.
    // Target the single most recent visit by id: the old query updated *every*
    // row for this URL inside the window, rewriting unrelated history entries
    // (SQLite has no UPDATE ... LIMIT without the optional compile flag).
    if (title && title !== 'Loading...') {
      db().run(
        `UPDATE history SET title = ?, favicon = ?
         WHERE id = (
           SELECT id FROM history WHERE url = ? ORDER BY visited_at DESC LIMIT 1
         )`,
        [title, favicon ?? null, url]
      );
      persist();
    }
    return;
  }

  db().run('INSERT INTO history (url, title, favicon, visited_at) VALUES (?, ?, ?, ?)', [
    url,
    title || url,
    favicon ?? null,
    now,
  ]);
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
  // Default stays at 200 for the History page; sync passes 500 explicitly.
  const safe = safeLimit(limit, 200, 500);
  return queryObjects('SELECT * FROM history ORDER BY visited_at DESC LIMIT ?', [
    safe,
  ]) as unknown as HistoryEntry[];
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

/**
 * Trim history to a retention window and a hard row cap.
 *
 * This is not only about disk space. sql.js re-serialises and rewrites the
 * whole database on every write, so an unbounded history table makes every
 * single page visit progressively slower. Pruning on startup keeps that cost
 * flat.
 *
 * `maxAgeDays` of 0 means keep forever. Returns the number of rows removed.
 */
export function pruneHistory(maxAgeDays: number, maxRows = 50_000): number {
  const before = countHistory();

  if (maxAgeDays > 0) {
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    db().run('DELETE FROM history WHERE visited_at < ?', [cutoff]);
  }

  if (maxRows > 0) {
    // Keep the newest `maxRows` entries; delete anything older than that.
    db().run(
      `DELETE FROM history WHERE id NOT IN (
         SELECT id FROM history ORDER BY visited_at DESC LIMIT ?
       )`,
      [maxRows]
    );
  }

  const removed = before - countHistory();
  if (removed > 0) persist();
  return removed;
}

/**
 * Testing seam: history rows are always stamped with "now", so exercising the
 * retention window requires backdating a row directly.
 */
export function backdateHistoryForTests(id: number, visitedAt: number): void {
  db().run('UPDATE history SET visited_at = ? WHERE id = ?', [visitedAt, id]);
}

export function countHistory(): number {
  const rows = queryObjects('SELECT COUNT(*) AS n FROM history');
  return rows.length ? Number(rows[0].n ?? 0) : 0;
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export function addBookmark(url: string, title: string, favicon?: string): Bookmark {
  db().run(
    `INSERT INTO bookmarks (url, title, favicon, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET title = excluded.title, favicon = excluded.favicon`,
    [url, title || url, favicon ?? null, Date.now()]
  );
  persist();
  return queryObjects('SELECT * FROM bookmarks WHERE url = ? LIMIT 1', [
    url,
  ])[0] as unknown as Bookmark;
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
  return rowsToBookmarks(db().exec('SELECT * FROM bookmarks ORDER BY created_at DESC'));
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
    flushDb();
    _db.close();
    _db = null;
  }
}

// ── Passwords ─────────────────────────────────────────────────────────────────

export interface SavedPassword {
  id: number;
  origin: string; // e.g. "https://github.com"
  username: string;
  password?: string; // present only in single-entry lookups
  title: string;
  favicon: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Secrets are encrypted at rest with the OS keychain (Electron safeStorage)
 * whenever it is available. Rows are tagged with a prefix so a database written
 * before encryption was available (or on a machine without a keychain) still
 * reads back correctly.
 */
const ENCRYPTED_PREFIX = 'v1:';

/** Raised when a credential cannot be encrypted; callers surface this to the UI. */
export class PasswordEncryptionUnavailableError extends Error {
  constructor() {
    super(
      'Passwords cannot be saved because no OS keychain is available to encrypt them. ' +
        'Install a keyring (for example gnome-keyring or kwallet) and try again.'
    );
    this.name = 'PasswordEncryptionUnavailableError';
  }
}

/**
 * SECURITY: refuse to store a secret we cannot encrypt.
 *
 * This used to fall back to writing the password to zyphora.db in plaintext
 * while the Settings UI still told the user their logins were "encrypted with
 * your operating system keychain" — the exact opposite of the promise, and the
 * default path on a Linux box with no keyring.
 */
function encryptSecret(plain: string): string {
  let available = false;
  try {
    available = safeStorage.isEncryptionAvailable();
  } catch (error) {
    console.error('[db] could not query OS keychain availability:', error);
  }
  if (!available) throw new PasswordEncryptionUnavailableError();

  try {
    return ENCRYPTED_PREFIX + safeStorage.encryptString(plain).toString('base64');
  } catch (error) {
    console.error('[db] password encryption failed:', error);
    throw new PasswordEncryptionUnavailableError();
  }
}

function decryptSecret(stored: string): string {
  if (!stored.startsWith(ENCRYPTED_PREFIX)) return stored;
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64'));
  } catch (error) {
    console.error('[db] could not decrypt stored password:', error);
    return '';
  }
}

/** Credentials are keyed by origin, so "https://a.com/login?x=1" → "https://a.com". */
export function normalizeOrigin(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    try {
      return new URL(`https://${trimmed}`).origin;
    } catch {
      return trimmed;
    }
  }
}

function toSavedPassword(row: Record<string, unknown>, withSecret: boolean): SavedPassword {
  const entry: SavedPassword = {
    id: Number(row.id),
    origin: String(row.origin ?? ''),
    username: String(row.username ?? ''),
    title: String(row.title ?? ''),
    favicon: row.favicon == null ? null : String(row.favicon),
    created_at: Number(row.created_at ?? 0),
    updated_at: Number(row.updated_at ?? 0),
  };
  if (withSecret) entry.password = decryptSecret(String(row.password ?? ''));
  return entry;
}

const LIST_COLUMNS = 'id, origin, username, title, favicon, created_at, updated_at';

export function savePassword(
  origin: string,
  username: string,
  password: string,
  title = '',
  favicon?: string
): SavedPassword {
  const normalizedOrigin = normalizeOrigin(origin);
  const trimmedUsername = username.trim();
  if (!normalizedOrigin || !trimmedUsername || !password) {
    throw new Error('origin, username and password are all required');
  }
  const now = Date.now();
  db().run(
    `INSERT INTO passwords (origin, username, password, title, favicon, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(origin, username) DO UPDATE SET
       password   = excluded.password,
       title      = excluded.title,
       favicon    = COALESCE(excluded.favicon, passwords.favicon),
       updated_at = excluded.updated_at`,
    [normalizedOrigin, trimmedUsername, encryptSecret(password), title, favicon ?? null, now, now]
  );
  persist();
  const row = queryObjects('SELECT * FROM passwords WHERE origin = ? AND username = ? LIMIT 1', [
    normalizedOrigin,
    trimmedUsername,
  ])[0];
  return toSavedPassword(row, true);
}

/** Entries for a site, without secrets — used to decide whether to prompt. */
export function getPasswordsForOrigin(origin: string): SavedPassword[] {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return [];
  return queryObjects(
    `SELECT ${LIST_COLUMNS} FROM passwords WHERE origin = ? ORDER BY updated_at DESC`,
    [normalizedOrigin]
  ).map((row) => toSavedPassword(row, false));
}

/** True when this exact credential pair is already stored (no prompt needed). */
export function hasPassword(origin: string, username: string, password: string): boolean {
  const normalizedOrigin = normalizeOrigin(origin);
  const rows = queryObjects(
    'SELECT password FROM passwords WHERE origin = ? AND username = ? LIMIT 1',
    [normalizedOrigin, username.trim()]
  );
  if (!rows.length) return false;
  return decryptSecret(String(rows[0].password ?? '')) === password;
}

export function getAllPasswords(): SavedPassword[] {
  return queryObjects(`SELECT ${LIST_COLUMNS} FROM passwords ORDER BY updated_at DESC`).map((row) =>
    toSavedPassword(row, false)
  );
}

export function getPasswordById(id: number): SavedPassword | null {
  const rows = queryObjects('SELECT * FROM passwords WHERE id = ? LIMIT 1', [id]);
  return rows.length ? toSavedPassword(rows[0], true) : null;
}

export function searchPasswords(query: string): SavedPassword[] {
  const pattern = escapedLikePattern(query);
  return queryObjects(
    `SELECT ${LIST_COLUMNS} FROM passwords
     WHERE origin LIKE ? ESCAPE '\\' OR username LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\'
     ORDER BY updated_at DESC LIMIT 500`,
    [pattern, pattern, pattern]
  ).map((row) => toSavedPassword(row, false));
}

export function deletePassword(id: number) {
  db().run('DELETE FROM passwords WHERE id = ?', [id]);
  persist();
}

export function clearPasswords() {
  db().run('DELETE FROM passwords');
  persist();
}

// ── Engine: Accounts ──────────────────────────────────────────────────────────

export interface EngineAccount {
  id: string;
  provider: string;
  display_name: string;
  email: string | null;
  avatar: string | null;
  created_at: number;
}

export function saveEngineAccount(account: Omit<EngineAccount, 'created_at'>): EngineAccount {
  const now = Date.now();
  db().run(
    `INSERT INTO engine_accounts (id, provider, display_name, email, avatar, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name = excluded.display_name,
       email        = excluded.email,
       avatar       = excluded.avatar`,
    [account.id, account.provider, account.display_name, account.email ?? null, account.avatar ?? null, now]
  );
  persist();
  return queryObjects('SELECT * FROM engine_accounts WHERE id = ? LIMIT 1', [account.id])[0] as unknown as EngineAccount;
}

export function getEngineAccounts(provider?: string): EngineAccount[] {
  if (provider) {
    return queryObjects('SELECT * FROM engine_accounts WHERE provider = ? ORDER BY created_at', [provider]) as unknown as EngineAccount[];
  }
  return queryObjects('SELECT * FROM engine_accounts ORDER BY provider, created_at') as unknown as EngineAccount[];
}

export function deleteEngineAccount(id: string): void {
  db().run('DELETE FROM engine_accounts WHERE id = ?', [id]);
  db().run('DELETE FROM engine_integration_states WHERE account_id = ?', [id]);
  persist();
}

// ── Engine: Integration States ────────────────────────────────────────────────

export interface EngineIntegrationState {
  provider: string;
  account_id: string;
  status: string;
  connected_at: number | null;
  last_event_at: number | null;
  last_error: string | null;
  updated_at: number;
}

export function saveIntegrationState(state: Omit<EngineIntegrationState, 'updated_at'>): void {
  db().run(
    `INSERT INTO engine_integration_states
       (provider, account_id, status, connected_at, last_event_at, last_error, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, account_id) DO UPDATE SET
       status        = excluded.status,
       connected_at  = excluded.connected_at,
       last_event_at = excluded.last_event_at,
       last_error    = excluded.last_error,
       updated_at    = excluded.updated_at`,
    [state.provider, state.account_id, state.status,
     state.connected_at ?? null, state.last_event_at ?? null,
     state.last_error ?? null, Date.now()]
  );
  persist();
}

export function getAllIntegrationStates(): EngineIntegrationState[] {
  return queryObjects('SELECT * FROM engine_integration_states') as unknown as EngineIntegrationState[];
}

// ── Engine: Processed Events (deduplication) ──────────────────────────────────

export function markEventProcessed(eventId: string, provider: string): void {
  db().run(
    `INSERT OR IGNORE INTO engine_processed_events (event_id, provider, processed_at)
     VALUES (?, ?, ?)`,
    [eventId, provider, Date.now()]
  );
  // Trim old entries (keep last 10k) to prevent unbounded growth
  db().run(
    `DELETE FROM engine_processed_events
     WHERE event_id NOT IN (
       SELECT event_id FROM engine_processed_events
       ORDER BY processed_at DESC LIMIT 10000
     )`
  );
  persist();
}

export function isEventProcessed(eventId: string): boolean {
  const stmt = db().prepare('SELECT event_id FROM engine_processed_events WHERE event_id = ? LIMIT 1');
  stmt.bind([eventId]);
  const found = stmt.step();
  stmt.free();
  return found;
}

// ── Engine: Notifications ─────────────────────────────────────────────────────

export interface EngineNotification {
  id: string;
  provider: string;
  account_id: string | null;
  event_type: string;
  title: string | null;
  body: string | null;
  icon: string | null;
  action_url: string | null;
  payload: string | null;  // JSON
  priority: string;
  created_at: number;
  read_at: number | null;
  dismissed_at: number | null;
}

export function saveNotification(n: Omit<EngineNotification, 'read_at' | 'dismissed_at'>): EngineNotification {
  db().run(
    `INSERT OR IGNORE INTO engine_notifications
       (id, provider, account_id, event_type, title, body, icon, action_url, payload, priority, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [n.id, n.provider, n.account_id ?? null, n.event_type,
     n.title ?? null, n.body ?? null, n.icon ?? null,
     n.action_url ?? null, n.payload ?? null, n.priority, n.created_at]
  );
  persist();
  return queryObjects('SELECT * FROM engine_notifications WHERE id = ? LIMIT 1', [n.id])[0] as unknown as EngineNotification;
}

export function getNotifications(opts: {
  provider?: string;
  unreadOnly?: boolean;
  limit?: number;
} = {}): EngineNotification[] {
  const { provider, unreadOnly, limit = 100 } = opts;
  const safe = safeLimit(limit, 100, 500);
  let sql = 'SELECT * FROM engine_notifications WHERE dismissed_at IS NULL';
  const params: unknown[] = [];
  if (provider) { sql += ' AND provider = ?'; params.push(provider); }
  if (unreadOnly) sql += ' AND read_at IS NULL';
  sql += ` ORDER BY created_at DESC LIMIT ${safe}`;
  return queryObjects(sql, params) as unknown as EngineNotification[];
}

export function markNotificationRead(id: string): void {
  db().run('UPDATE engine_notifications SET read_at = ? WHERE id = ? AND read_at IS NULL',
    [Date.now(), id]);
  persist();
}

export function markAllNotificationsRead(provider?: string): void {
  if (provider) {
    db().run('UPDATE engine_notifications SET read_at = ? WHERE provider = ? AND read_at IS NULL',
      [Date.now(), provider]);
  } else {
    db().run('UPDATE engine_notifications SET read_at = ? WHERE read_at IS NULL', [Date.now()]);
  }
  persist();
}

export function dismissNotification(id: string): void {
  db().run('UPDATE engine_notifications SET dismissed_at = ? WHERE id = ?', [Date.now(), id]);
  persist();
}

export function getUnreadCount(provider?: string): number {
  let sql = 'SELECT COUNT(*) as cnt FROM engine_notifications WHERE read_at IS NULL AND dismissed_at IS NULL';
  const params: unknown[] = [];
  if (provider) { sql += ' AND provider = ?'; params.push(provider); }
  const rows = queryObjects(sql, params);
  return Number((rows[0] as Record<string, unknown>)?.cnt ?? 0);
}

export function clearEngineNotifications(): void {
  db().run('DELETE FROM engine_notifications');
  db().run('DELETE FROM engine_processed_events');
  persist();
}

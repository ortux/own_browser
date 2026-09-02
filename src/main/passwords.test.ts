import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initDb,
  savePassword,
  getAllPasswords,
  getPasswordById,
  getPasswordsForOrigin,
  hasPassword,
  searchPasswords,
  deletePassword,
  clearPasswords,
  normalizeOrigin,
} from './db';

await initDb();

test.beforeEach(() => { clearPasswords(); });

test('origins are normalised so one site keeps one credential set', () => {
  assert.equal(normalizeOrigin('https://github.com/login?next=/a'), 'https://github.com');
  assert.equal(normalizeOrigin('github.com'), 'https://github.com');
  assert.equal(normalizeOrigin('http://localhost:3000/x'), 'http://localhost:3000');
  assert.equal(normalizeOrigin('   '), '');
});

test('a saved credential round-trips through encryption', () => {
  const saved = savePassword('https://github.com/login', ' alice ', 'hunter2', 'GitHub', 'https://f.ico');
  assert.equal(saved.origin, 'https://github.com');
  assert.equal(saved.username, 'alice', 'whitespace is trimmed');
  assert.equal(saved.password, 'hunter2');
  assert.equal(getPasswordById(saved.id)?.password, 'hunter2');
});

test('list views never expose secrets', () => {
  savePassword('https://github.com', 'alice', 'hunter2', 'GitHub');
  assert.equal(getAllPasswords()[0].password, undefined);
  assert.equal(searchPasswords('git')[0].password, undefined);
  assert.equal(getPasswordsForOrigin('https://github.com/anything')[0].password, undefined);
});

test('hasPassword recognises an already-stored pair', () => {
  savePassword('https://github.com', 'alice', 'hunter2', 'GitHub');
  assert.equal(hasPassword('https://github.com/login', 'alice', 'hunter2'), true);
  assert.equal(hasPassword('https://github.com', 'alice', 'different'), false);
  assert.equal(hasPassword('https://gitlab.com', 'alice', 'hunter2'), false);
});

test('re-saving the same login updates in place and keeps the favicon', () => {
  const first = savePassword('https://github.com', 'alice', 'hunter2', 'GitHub', 'https://f.ico');
  const second = savePassword('https://github.com', 'alice', 'newpass', 'GitHub');
  assert.equal(second.id, first.id);
  assert.equal(second.password, 'newpass');
  assert.equal(second.favicon, 'https://f.ico');
  assert.equal(getAllPasswords().length, 1);
});

test('incomplete credentials are rejected', () => {
  assert.throws(() => savePassword('https://x.com', '', 'pw'), /required/);
  assert.throws(() => savePassword('https://x.com', 'user', ''), /required/);
  assert.throws(() => savePassword('', 'user', 'pw'), /required/);
});

test('search treats LIKE wildcards as literal text', () => {
  savePassword('https://ex.com', '100%user', 'pw', 'Ex');
  assert.equal(searchPasswords('100%u').length, 1);
  assert.equal(searchPasswords('%').length, 1, 'a bare % must not match everything');
  assert.equal(searchPasswords('nothing').length, 0);
});

test('entries can be removed individually and in bulk', () => {
  const a = savePassword('https://a.com', 'u', 'p', 'A');
  savePassword('https://b.com', 'u', 'p', 'B');
  deletePassword(a.id);
  assert.equal(getAllPasswords().length, 1);
  clearPasswords();
  assert.equal(getAllPasswords().length, 0);
});

test('unknown ids resolve to null rather than throwing', () => {
  assert.equal(getPasswordById(999_999), null);
  assert.deepEqual(getPasswordsForOrigin(''), []);
});

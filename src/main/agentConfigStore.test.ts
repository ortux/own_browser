import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAgentConfig,
  updateAgentConfig,
  resetAgentConfig,
  addMemory,
  deleteMemory,
  clearMemories,
  logActivity,
  clearActivity,
  dropSessionMemories,
} from './agentConfigStore';

test('a change is readable straight back', () => {
  resetAgentConfig();
  updateAgentConfig({ autonomy: 'ask' });
  assert.equal(getAgentConfig().autonomy, 'ask');
});

test('the purchase floor survives a direct write', () => {
  resetAgentConfig();
  // Even bypassing the UI, the store must not persist an auto-allow purchase.
  updateAgentConfig({
    actions: { ...getAgentConfig().actions, purchase: 'allow' },
  });
  assert.notEqual(getAgentConfig().actions.purchase, 'allow');
});

test('unavailable tools cannot be switched on', () => {
  resetAgentConfig();
  updateAgentConfig({ tools: { ...getAgentConfig().tools, terminal: true } });
  assert.equal(getAgentConfig().tools.terminal, false);
});

test('numeric limits are clamped into range', () => {
  resetAgentConfig();
  updateAgentConfig({
    security: { ...getAgentConfig().security, maxTabs: 9_999, maxRuntimeMinutes: -5 },
  });
  const security = getAgentConfig().security;
  assert.ok(security.maxTabs <= 50, 'maxTabs should be capped');
  assert.ok(security.maxRuntimeMinutes >= 1, 'runtime should have a floor');
});

test('a garbage numeric value falls back to the default', () => {
  resetAgentConfig();
  updateAgentConfig({
    security: { ...getAgentConfig().security, maxTabs: Number.NaN },
  });
  assert.equal(getAgentConfig().security.maxTabs, 5);
});

// ─── Memory ──────────────────────────────────────────────────────────────────

test('memories can be added, listed, and deleted', () => {
  resetAgentConfig();
  const entry = addMemory('User prefers dark mode.');
  assert.ok(entry);
  assert.equal(getAgentConfig().memory.entries.length, 1);
  assert.equal(getAgentConfig().memory.entries[0].content, 'User prefers dark mode.');

  deleteMemory(entry.id);
  assert.equal(getAgentConfig().memory.entries.length, 0);
});

test('memory is not recorded when it is switched off', () => {
  resetAgentConfig();
  updateAgentConfig({ memory: { mode: 'disabled', entries: [] } });
  assert.equal(addMemory('should not stick'), null);
  assert.equal(getAgentConfig().memory.entries.length, 0);
});

test('switching memory off does not delete what is already saved', () => {
  // The settings screen promises this explicitly, so it is worth pinning.
  resetAgentConfig();
  addMemory('Remember me.');
  updateAgentConfig({ memory: { ...getAgentConfig().memory, mode: 'disabled' } });
  assert.equal(getAgentConfig().memory.entries.length, 1);

  clearMemories();
  assert.equal(getAgentConfig().memory.entries.length, 0);
});

test('session memories are dropped on quit but ordinary ones survive', () => {
  resetAgentConfig();
  addMemory('Persistent note.');
  updateAgentConfig({ memory: { ...getAgentConfig().memory, mode: 'session' } });
  addMemory('Temporary note.');
  assert.equal(getAgentConfig().memory.entries.length, 2);

  dropSessionMemories();
  const remaining = getAgentConfig().memory.entries;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].content, 'Persistent note.');
});

test('empty memories are rejected', () => {
  resetAgentConfig();
  assert.equal(addMemory('   '), null);
});

// ─── Activity ────────────────────────────────────────────────────────────────

test('activity is recorded newest first and can be cleared', () => {
  resetAgentConfig();
  logActivity({ domain: 'a.com', action: 'Opened a.com', result: 'ok', permission: 'allow' });
  logActivity({ domain: 'b.com', action: 'Opened b.com', result: 'ok', permission: 'allow' });

  const entries = getAgentConfig().activity;
  assert.equal(entries.length, 2);
  assert.equal(entries[0].domain, 'b.com', 'newest entry should be first');

  clearActivity();
  assert.equal(getAgentConfig().activity.length, 0);
});

test('the activity log does not grow without bound', () => {
  resetAgentConfig();
  for (let i = 0; i < 600; i++) {
    logActivity({ domain: 'x.com', action: `Action ${i}`, result: 'ok', permission: 'allow' });
  }
  assert.ok(getAgentConfig().activity.length <= 500, 'log should be capped');
});

// ─── Reset ───────────────────────────────────────────────────────────────────

test('reset restores the shipped defaults', () => {
  updateAgentConfig({ autonomy: 'autonomous' });
  addMemory('something');
  logActivity({ domain: 'x.com', action: 'did a thing', result: 'ok', permission: 'allow' });

  resetAgentConfig();
  const config = getAgentConfig();
  assert.equal(config.autonomy, 'balanced');
  assert.equal(config.memory.entries.length, 0);
  assert.equal(config.activity.length, 0);
  assert.equal(config.actions.purchase, 'never');
});

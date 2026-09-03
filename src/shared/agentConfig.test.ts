import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultAgentConfig,
  resolvePermission,
  clampPermission,
  domainMatches,
  findDomainRule,
  validateDomainPattern,
  validateProfileName,
  sensitiveCategoryFor,
  nextRunAfter,
  isToolEnabled,
  DEFAULT_ACTIONS,
  type AgentConfig,
} from './agentConfig';

function config(patch: (c: AgentConfig) => void = () => {}): AgentConfig {
  const c = defaultAgentConfig();
  patch(c);
  return c;
}

// ─── Safety defaults (§18) ───────────────────────────────────────────────────

test('new installs ship with the documented safe defaults', () => {
  assert.equal(DEFAULT_ACTIONS.read_content, 'allow');
  assert.equal(DEFAULT_ACTIONS.navigate, 'allow');
  assert.equal(DEFAULT_ACTIONS.click, 'allow');
  assert.equal(DEFAULT_ACTIONS.scroll, 'allow');
  assert.equal(DEFAULT_ACTIONS.open_tab, 'allow');
  assert.equal(DEFAULT_ACTIONS.download, 'ask');
  assert.equal(DEFAULT_ACTIONS.upload, 'ask');
  assert.equal(DEFAULT_ACTIONS.submit_form, 'ask');
  assert.equal(DEFAULT_ACTIONS.send_message, 'ask');
  assert.equal(DEFAULT_ACTIONS.delete_content, 'ask');
  assert.equal(DEFAULT_ACTIONS.change_settings, 'ask');
  assert.equal(DEFAULT_ACTIONS.purchase, 'never');

  const c = defaultAgentConfig();
  assert.equal(c.security.promptInjectionProtection, true);
  // Dangerous tools are off until the user opts in.
  assert.equal(c.tools.javascript, false);
  assert.equal(c.tools.terminal, false);
  assert.equal(c.tools.file_read, false);
  assert.equal(c.tools.clipboard, false);
  assert.equal(c.files.mode, 'none');
});

// ─── The purchase floor ──────────────────────────────────────────────────────

test('purchases can never be set to automatic', () => {
  // Enforced in the setter, not just the UI, because the config file on disk
  // is user-editable and must not be able to grant silent spending power.
  assert.equal(clampPermission('purchase', 'allow'), 'ask');
  assert.equal(clampPermission('purchase', 'ask'), 'ask');
  assert.equal(clampPermission('purchase', 'never'), 'never');
  // Other actions are unaffected.
  assert.equal(clampPermission('download', 'allow'), 'allow');
});

test('a tampered config cannot auto-allow a purchase', () => {
  const c = config((x) => {
    // Simulate a hand-edited or corrupted file.
    x.actions.purchase = 'allow';
    x.autonomy = 'autonomous';
    x.domains = [{ pattern: 'shop.com', state: 'allow' }];
  });
  const decision = resolvePermission(c, { action: 'purchase', url: 'https://shop.com/checkout' });
  assert.notEqual(decision.state, 'allow', 'a purchase must never resolve to automatic');
});

test('fully autonomous still stops for purchases', () => {
  const c = config((x) => {
    x.autonomy = 'autonomous';
  });
  const decision = resolvePermission(c, { action: 'purchase', url: 'https://shop.com' });
  assert.notEqual(decision.state, 'allow');
});

// ─── Autonomy ────────────────────────────────────────────────────────────────

test('a stopped agent is denied everything, including reading', () => {
  const c = config((x) => {
    x.autonomy = 'stopped';
  });
  for (const action of ['read_content', 'scroll', 'click', 'navigate'] as const) {
    assert.equal(resolvePermission(c, { action, url: 'https://example.com' }).state, 'never');
  }
});

test('ask mode gates actions but not reading or scrolling', () => {
  const c = config((x) => {
    x.autonomy = 'ask';
  });
  assert.equal(resolvePermission(c, { action: 'click', url: 'https://example.com' }).state, 'ask');
  assert.equal(resolvePermission(c, { action: 'navigate', url: 'https://example.com' }).state, 'ask');
  // Interrupting for these would make the mode unusable.
  assert.equal(resolvePermission(c, { action: 'read_content', url: 'https://example.com' }).state, 'allow');
  assert.equal(resolvePermission(c, { action: 'scroll', url: 'https://example.com' }).state, 'allow');
});

test('autonomy can only tighten, never loosen', () => {
  const c = config((x) => {
    x.autonomy = 'autonomous';
    x.actions.download = 'ask';
  });
  // Full autonomy must not override an action the user explicitly set to ask.
  assert.equal(resolvePermission(c, { action: 'download', url: 'https://example.com' }).state, 'ask');
});

// ─── Domain rules ────────────────────────────────────────────────────────────

test('wildcards match subdomains and the bare domain', () => {
  // Matching subdomains but not the apex would be a trap for the user.
  assert.ok(domainMatches('*.example.com', 'example.com'));
  assert.ok(domainMatches('*.example.com', 'mail.example.com'));
  assert.ok(domainMatches('*.example.com', 'a.b.example.com'));
  assert.ok(!domainMatches('*.example.com', 'notexample.com'));
  assert.ok(!domainMatches('*.example.com', 'example.com.evil.com'));
});

test('exact rules do not match subdomains', () => {
  assert.ok(domainMatches('example.com', 'example.com'));
  assert.ok(!domainMatches('example.com', 'mail.example.com'));
});

test('the most specific rule wins', () => {
  const rules = [
    { pattern: '*.google.com', state: 'allow' as const },
    { pattern: 'mail.google.com', state: 'never' as const },
  ];
  assert.equal(findDomainRule(rules, 'mail.google.com')?.state, 'never');
  assert.equal(findDomainRule(rules, 'docs.google.com')?.state, 'allow');
});

test('a blocked domain overrides a permissive action setting', () => {
  const c = config((x) => {
    x.actions.read_content = 'allow';
    x.domains = [{ pattern: '*.bank.com', state: 'never' }];
  });
  assert.equal(resolvePermission(c, { action: 'read_content', url: 'https://bank.com' }).state, 'never');
});

test('a trusted domain cannot unblock a disabled action', () => {
  const c = config((x) => {
    x.actions.delete_content = 'never';
    x.domains = [{ pattern: 'example.com', state: 'allow' }];
  });
  assert.equal(
    resolvePermission(c, { action: 'delete_content', url: 'https://example.com' }).state,
    'never'
  );
});

test('a domain set to ask tightens an allowed action', () => {
  const c = config((x) => {
    x.domains = [{ pattern: 'example.com', state: 'ask' }];
  });
  assert.equal(resolvePermission(c, { action: 'click', url: 'https://example.com' }).state, 'ask');
});

// ─── Sensitive sites ─────────────────────────────────────────────────────────

test('known sensitive sites are classified', () => {
  assert.equal(sensitiveCategoryFor('chase.com')?.id, 'banking');
  assert.equal(sensitiveCategoryFor('mail.google.com')?.id, 'email');
  assert.equal(sensitiveCategoryFor('vault.bitwarden.com')?.id, 'password_managers');
  assert.equal(sensitiveCategoryFor('incometax.gov.in')?.id, 'government');
  assert.equal(sensitiveCategoryFor('example.com'), null);
});

test('sensitive sites force a prompt even for allowed actions', () => {
  const c = defaultAgentConfig();
  const decision = resolvePermission(c, { action: 'click', url: 'https://chase.com/transfer' });
  assert.equal(decision.state, 'ask');
  assert.equal(decision.sensitiveCategory, 'banking');
});

test('turning off a sensitive category stops it forcing a prompt', () => {
  const c = config((x) => {
    x.sessions.sensitiveCategories.banking = false;
  });
  assert.equal(resolvePermission(c, { action: 'click', url: 'https://chase.com' }).state, 'allow');
});

// ─── Validation ──────────────────────────────────────────────────────────────

test('domain validation accepts real inputs and explains rejections', () => {
  assert.deepEqual(validateDomainPattern('example.com'), { ok: true, value: 'example.com' });
  assert.deepEqual(validateDomainPattern('  Example.COM '), { ok: true, value: 'example.com' });
  assert.deepEqual(validateDomainPattern('*.example.com'), { ok: true, value: '*.example.com' });

  for (const bad of ['', '   ', 'localhost', 'https://example.com', 'example.com/path', 'ex ample.com', 'ex*mple.com', '.com', 'example..com']) {
    const result = validateDomainPattern(bad);
    assert.equal(result.ok, false, `expected "${bad}" to be rejected`);
    assert.ok(result.error && result.error.length > 0, 'a rejection must explain itself');
  }
});

test('profile names must be unique and non-empty', () => {
  const profiles = defaultAgentConfig().profiles;
  assert.equal(validateProfileName('', profiles).ok, false);
  assert.equal(validateProfileName('Developer', profiles).ok, false);
  assert.equal(validateProfileName('developer', profiles).ok, false, 'comparison is case-insensitive');
  assert.equal(validateProfileName('My Profile', profiles).ok, true);
  // Renaming a profile to its own name is allowed.
  assert.equal(validateProfileName('Developer', profiles, 'developer').ok, true);
});

// ─── Tools ───────────────────────────────────────────────────────────────────

test('an unavailable tool stays off even if the config says otherwise', () => {
  const c = config((x) => {
    x.tools.terminal = true;
  });
  // Terminal is not implemented in this build; enabling it must not pretend.
  assert.equal(isToolEnabled(c, 'terminal'), false);
  assert.equal(isToolEnabled(c, 'web_browsing'), true);
});

// ─── Scheduling ──────────────────────────────────────────────────────────────

test('weekday schedules skip the weekend', () => {
  // Friday 2026-01-02T09:00 local.
  const friday = new Date(2026, 0, 2, 9, 0, 0).getTime();
  const next = new Date(nextRunAfter('weekdays', friday));
  assert.ok(next.getDay() !== 0 && next.getDay() !== 6, 'must not land on a weekend');
  assert.equal(next.getDay(), 1, 'Friday + 1 day should roll to Monday');
});

test('built-in profiles never allow purchases', () => {
  // Every shipped profile must respect the payment floor.
  for (const profile of defaultAgentConfig().profiles) {
    assert.notEqual(profile.actions.purchase, 'allow', `${profile.name} must not auto-allow purchases`);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAgentAction,
  describeAction,
  isSensitiveElement,
  IRREVERSIBLE_KINDS,
} from './agent';
import type { AgentElement } from './agent';

function el(partial: Partial<AgentElement>): AgentElement {
  return {
    ref: 1,
    tag: 'button',
    name: '',
    rect: { x: 0, y: 0, width: 40, height: 20 },
    offscreen: false,
    ...partial,
  };
}

// parseAgentAction is the trust boundary between LLM output and real input
// events, so it gets the most scrutiny of anything in the agent.

test('accepts well-formed actions', () => {
  assert.deepEqual(parseAgentAction({ kind: 'click', ref: 3 }), { kind: 'click', ref: 3 });
  assert.deepEqual(parseAgentAction({ kind: 'key', key: 'Enter' }), { kind: 'key', key: 'Enter' });
  assert.deepEqual(parseAgentAction({ kind: 'navigate', url: 'https://example.com' }), {
    kind: 'navigate',
    url: 'https://example.com',
  });
});

test('rejects unknown or malformed actions', () => {
  assert.equal(parseAgentAction(null), null);
  assert.equal(parseAgentAction('click'), null);
  assert.equal(parseAgentAction({}), null);
  // An action kind we do not implement must never be coerced into one we do.
  assert.equal(parseAgentAction({ kind: 'eval', code: 'alert(1)' }), null);
  assert.equal(parseAgentAction({ kind: 'executeJavaScript', script: 'x' }), null);
  // Missing or wrong-typed required fields.
  assert.equal(parseAgentAction({ kind: 'click' }), null);
  assert.equal(parseAgentAction({ kind: 'click', ref: 'three' }), null);
  assert.equal(parseAgentAction({ kind: 'key', key: 'F12' }), null);
  assert.equal(parseAgentAction({ kind: 'scroll', direction: 'sideways' }), null);
});

test('extra properties are dropped rather than passed through', () => {
  const parsed = parseAgentAction({ kind: 'click', ref: 1, script: 'alert(1)' });
  assert.deepEqual(parsed, { kind: 'click', ref: 1 });
  assert.equal((parsed as Record<string, unknown>).script, undefined);
});

test('numeric inputs are clamped to sane bounds', () => {
  assert.deepEqual(parseAgentAction({ kind: 'wait', ms: 999_999 }), { kind: 'wait', ms: 10_000 });
  assert.deepEqual(parseAgentAction({ kind: 'wait', ms: -5 }), { kind: 'wait', ms: 0 });
  const scroll = parseAgentAction({ kind: 'scroll', direction: 'down', amount: 1e9 });
  assert.deepEqual(scroll, { kind: 'scroll', direction: 'down', amount: 5_000 });
});

test('over-long strings are rejected, not truncated', () => {
  assert.equal(parseAgentAction({ kind: 'navigate', url: 'h'.repeat(9_000) }), null);
  assert.equal(parseAgentAction({ kind: 'type', ref: 1, text: 'x'.repeat(20_000) }), null);
});

test('click and Enter are treated as irreversible', () => {
  // These are the actions that can submit a form or spend money.
  assert.ok(IRREVERSIBLE_KINDS.has('click'));
  assert.ok(IRREVERSIBLE_KINDS.has('key'));
  assert.ok(!IRREVERSIBLE_KINDS.has('scroll'));
  assert.ok(!IRREVERSIBLE_KINDS.has('type'));
});

test('secret typing is never described in plain text', () => {
  const elements = [
    {
      ref: 1,
      tag: 'input',
      name: 'Card number',
      rect: { x: 0, y: 0, width: 10, height: 10 },
      offscreen: false,
    },
  ];
  const described = describeAction(
    { kind: 'type', ref: 1, text: '4111111111111111', secret: true },
    elements
  );
  assert.ok(!described.includes('4111'), 'secret value must not appear in the activity log');
  assert.match(described, /saved value/);
});

// The confirm gate is the only thing standing between the agent and an
// irreversible action, so its failure modes matter more than its successes.

test('structural signals fire regardless of language', () => {
  // No recognisable words at all — only the DOM structure says "submit".
  assert.ok(isSensitiveElement(el({ name: 'ᚠᚢᚦᚨᚱᚲ', submits: true })));
  assert.ok(isSensitiveElement(el({ name: '', type: 'submit' })));
  // A button inside a form that collects a password or card number.
  assert.ok(isSensitiveElement(el({ name: 'xyzzy', formSensitive: true })));
});

test('non-English action labels are caught', () => {
  // This is the regression that mattered: on a non-English site the gate used
  // to never fire, and the agent would submit without asking.
  for (const name of [
    'Bezahlen',
    'Comprar ahora',
    'Confirmer la commande',
    'Оплатить',
    '購入する',
    '立即支付',
    '결제하기',
    'إرسال',
    'भुगतान करें',
    'Thanh toán',
    'Satın al',
  ]) {
    assert.ok(isSensitiveElement(el({ name })), `expected "${name}" to be treated as sensitive`);
  }
});

test('ordinary navigation is not gated', () => {
  // Over-gating would make the agent useless, so check the negatives too.
  assert.ok(!isSensitiveElement(el({ tag: 'a', name: 'About us' })));
  assert.ok(!isSensitiveElement(el({ tag: 'a', name: 'Next page' })));
  assert.ok(!isSensitiveElement(el({ name: 'Show more' })));
  assert.ok(!isSensitiveElement(el({ tag: 'input', type: 'text', name: 'Search' })));
});

test('cheap toggles are not gated even with a loaded label', () => {
  assert.ok(
    !isSensitiveElement(el({ tag: 'input', type: 'checkbox', name: 'I agree to the terms' }))
  );
  assert.ok(!isSensitiveElement(el({ tag: 'input', type: 'radio', name: 'Pay by card' })));
});

test('an unlabelled element is not gated on lexical grounds alone', () => {
  assert.ok(!isSensitiveElement(el({ name: '   ' })));
  assert.equal(isSensitiveElement(undefined), false);
});

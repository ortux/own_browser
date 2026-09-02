/**
 * passwordCapture.js — webview preload for password capture
 *
 * Runs in the guest page context with contextIsolation=yes.
 * Credentials are sent to the host <webview> element with
 * ipcRenderer.sendToHost; the renderer forwards them to the main process,
 * which asks the user before anything is written to disk.
 *
 * Two capture paths are needed in practice:
 *   1. classic `submit` on a <form>
 *   2. SPA logins that never submit a form — detected from clicks/Enter on a
 *      submit-looking control, and as a fallback when the page navigates away
 *      while a filled password field is on screen.
 */
const { ipcRenderer } = require('electron');

const CHANNEL = '__zyphora_pm_submit__';

/** Remember the last pair we reported so one login is not sent repeatedly. */
let lastSent = '';

function isVisible(el) {
  if (!el || el.disabled) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/** Find the username input associated with a password field. */
function findUsernameField(pwdField) {
  const scope = pwdField.form || document;

  // Explicit hints first — these are the most reliable.
  const hinted = scope.querySelector(
    'input[autocomplete="username"],input[autocomplete="email"],' +
    'input[type="email"],input[name*="user" i],input[name*="email" i],' +
    'input[name*="login" i],input[id*="user" i],input[id*="email" i]'
  );
  if (isVisible(hinted)) return hinted;

  // Otherwise: the last visible text input that appears before the password.
  const candidates = Array.prototype.filter.call(
    scope.querySelectorAll('input[type="text"],input[type="email"],input[type="tel"],input:not([type])'),
    isVisible
  );
  let best = null;
  for (const candidate of candidates) {
    if (candidate.compareDocumentPosition(pwdField) & Node.DOCUMENT_POSITION_FOLLOWING) {
      best = candidate;
    }
  }
  return best || candidates[0] || null;
}

function faviconHref() {
  const link = document.querySelector(
    'link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]'
  );
  if (!link || !link.getAttribute('href')) return '';
  try {
    return new URL(link.getAttribute('href'), document.baseURI).toString();
  } catch {
    return '';
  }
}

function report(pwdField) {
  if (!pwdField || !pwdField.value) return;
  // A brand-new-password field means a sign-up/change form; still worth saving,
  // but a confirmation field on its own is not.
  const userField = findUsernameField(pwdField);
  const username = userField && typeof userField.value === 'string' ? userField.value.trim() : '';
  if (!username) return;

  const key = `${location.origin}\u0000${username}\u0000${pwdField.value}`;
  if (key === lastSent) return;
  lastSent = key;

  try {
    ipcRenderer.sendToHost(
      CHANNEL,
      location.origin,
      username,
      pwdField.value,
      document.title || location.hostname,
      faviconHref()
    );
  } catch {
    /* host went away — nothing to do */
  }
}

/** The filled, visible password field the user most likely just used. */
function activePasswordField(root) {
  const scope = root && root.querySelectorAll ? root : document;
  const fields = Array.prototype.filter.call(
    scope.querySelectorAll('input[type="password"]'),
    (el) => isVisible(el) && el.value
  );
  return fields[0] || null;
}

// ── 1. Classic form submit ───────────────────────────────────────────────────
document.addEventListener(
  'submit',
  (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    report(activePasswordField(form));
  },
  true
);

// ── 2. SPA logins: click / Enter on a submit-looking control ─────────────────
function looksLikeSubmit(el) {
  if (!el) return false;
  const node = el.closest ? el.closest('button,input[type="submit"],input[type="button"],[role="button"]') : null;
  if (!node) return false;
  if (node.tagName === 'BUTTON' && node.type === 'reset') return false;
  return true;
}

document.addEventListener(
  'click',
  (event) => {
    if (!looksLikeSubmit(event.target)) return;
    const pwd = activePasswordField(document);
    if (pwd) setTimeout(() => report(pwd), 0);
  },
  true
);

document.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== 'Enter') return;
    const pwd = activePasswordField(document);
    if (pwd) setTimeout(() => report(pwd), 0);
  },
  true
);

// ── 3. Fallback: page is being unloaded with a filled password on screen ─────
window.addEventListener('pagehide', () => {
  report(activePasswordField(document));
});

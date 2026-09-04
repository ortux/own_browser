/**
 * webviewPreload.js — Combined webview preload for password capture and link handling
 *
 * Runs in the guest page context with contextIsolation=yes.
 * Features:
 *   1. Password capture: Detects login forms and sends credentials to host
 *   2. Link handling: Intercepts middle-click/Ctrl+click to open links in new tabs
 *
 * Credentials and link URLs are sent to the host <webview> element with
 * ipcRenderer.sendToHost; the renderer forwards them to the main process.
 */
const { ipcRenderer } = require('electron');

// ── Link Hover Preview ────────────────────────────────────────────────────────
const HOVER_CHANNEL = '__zyphora_link_hover__';

let hoverTimeout = null;

function findLinkElement(target) {
  let el = target;
  for (let i = 0; i < 5 && el; i++) {
    if (el.tagName === 'A') return el;
    el = el.parentElement;
  }
  return null;
}

document.addEventListener(
  'mouseover',
  (event) => {
    const link = findLinkElement(event.target);
    if (link && link.href) {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        try {
          ipcRenderer.sendToHost(HOVER_CHANNEL, link.href);
        } catch {
          /* host went away */
        }
      }, 150); // Small delay to avoid flicker
    }
  },
  true
);

document.addEventListener(
  'mouseout',
  (event) => {
    const link = findLinkElement(event.target);
    if (link) {
      clearTimeout(hoverTimeout);
      try {
        ipcRenderer.sendToHost(HOVER_CHANNEL, null);
      } catch {
        /* host went away */
      }
    }
  },
  true
);

// ── Link Click Handler ────────────────────────────────────────────────────────
const LINK_CHANNEL = '__zyphora_link_new_tab__';

function findLinkHref(event) {
  let el = event.target;
  for (let i = 0; i < 5 && el; i++) {
    if (el.tagName === 'A' && el.href) return el.href;
    el = el.parentElement;
  }
  return null;
}

function isSafeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Middle-click (auxclick with button 1)
document.addEventListener(
  'auxclick',
  (event) => {
    if (event.button !== 1) return;
    const href = findLinkHref(event);
    if (!href || !isSafeUrl(href)) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    try {
      ipcRenderer.sendToHost(LINK_CHANNEL, href);
    } catch {
      /* host went away */
    }
  },
  true
);

// Ctrl/Cmd + click
document.addEventListener(
  'click',
  (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const href = findLinkHref(event);
    if (!href || !isSafeUrl(href)) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    try {
      ipcRenderer.sendToHost(LINK_CHANNEL, href);
    } catch {
      /* host went away */
    }
  },
  true
);

// ── Password Capture ──────────────────────────────────────────────────────────
const PM_CHANNEL = '__zyphora_pm_submit__';

let lastSent = '';

function isVisible(el) {
  if (!el || el.disabled) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findUsernameField(pwdField) {
  const scope = pwdField.form || document;

  const hinted = scope.querySelector(
    'input[autocomplete="username"],input[autocomplete="email"],' +
    'input[type="email"],input[name*="user" i],input[name*="email" i],' +
    'input[name*="login" i],input[id*="user" i],input[id*="email" i]'
  );
  if (isVisible(hinted)) return hinted;

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
  const userField = findUsernameField(pwdField);
  const username = userField && typeof userField.value === 'string' ? userField.value.trim() : '';
  if (!username) return;

  const key = `${location.origin}\u0000${username}\u0000${pwdField.value}`;
  if (key === lastSent) return;
  lastSent = key;

  try {
    ipcRenderer.sendToHost(
      PM_CHANNEL,
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

function activePasswordField(root) {
  const scope = root && root.querySelectorAll ? root : document;
  const fields = Array.prototype.filter.call(
    scope.querySelectorAll('input[type="password"]'),
    (el) => isVisible(el) && el.value
  );
  return fields[0] || null;
}

// Classic form submit
document.addEventListener(
  'submit',
  (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    report(activePasswordField(form));
  },
  true
);

// SPA logins: click / Enter on a submit-looking control
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

// Fallback: page is being unloaded with a filled password on screen
window.addEventListener('pagehide', () => {
  report(activePasswordField(document));
});

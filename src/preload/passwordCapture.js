/**
 * passwordCapture.js — webview preload for password capture
 * Runs in the guest page context with contextIsolation=yes.
 * Uses ipcRenderer.sendToHost to send captured credentials
 * back to the <webview> element in the renderer.
 */
const { ipcRenderer } = require('electron');

document.addEventListener('submit', function (e) {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;

  const pwdField = form.querySelector('input[type="password"]');
  if (!pwdField || !pwdField.value) return;

  const usernameField =
    form.querySelector('input[type="email"]') ||
    form.querySelector('input[type="text"]') ||
    form.querySelector('input[autocomplete*="username"]') ||
    form.querySelector('input[name*="user"]') ||
    form.querySelector('input[name*="email"]') ||
    form.querySelector('input[name*="login"]');

  const username = usernameField ? usernameField.value.trim() : '';
  if (!username || !pwdField.value) return;

  ipcRenderer.sendToHost('__zyphora_pm_submit__',
    window.location.origin,
    username,
    pwdField.value,
    document.title,
    ''
  );
}, true);

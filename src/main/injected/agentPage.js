// agentPage.js — page inspection + DOM-level fallback actions for the agent.
//
// Injected into a guest page by the main process via executeJavaScript. This
// file is bundled at build time and is never assembled from model output.
//
// Two responsibilities:
//   1. snapshot()  — describe the interactive elements the agent may address.
//   2. act()       — the DOM fallback used when real input cannot reach an
//                    element (offscreen, inside a scroll container, etc).
//
// Elements are addressed by a numeric `ref` recorded on the node itself, so a
// ref stays valid across re-renders that keep the same node.

(() => {
  const REF_ATTR = 'data-zyphora-ref';
  const state = (window.__zyphoraAgent = window.__zyphoraAgent || { nextRef: 1 });

  const SELECTOR = [
    'a[href]',
    'button',
    'input:not([type=hidden])',
    'select',
    'textarea',
    '[role=button]',
    '[role=link]',
    '[role=checkbox]',
    '[role=radio]',
    '[role=tab]',
    '[role=combobox]',
    '[contenteditable=""]',
    '[contenteditable=true]',
    '[onclick]',
  ].join(',');

  function refFor(el) {
    let ref = el.getAttribute(REF_ATTR);
    if (ref) return Number(ref);
    ref = String(state.nextRef++);
    el.setAttribute(REF_ATTR, ref);
    return Number(ref);
  }

  function byRef(ref) {
    return document.querySelector(`[${REF_ATTR}="${CSS.escape(String(ref))}"]`);
  }

  function visible(el) {
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // The accessible name, in roughly the order a screen reader would resolve it.
  function accessibleName(el) {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ')
        .trim();
      if (parts) return parts;
    }

    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label?.textContent) return label.textContent.trim();
    }

    const wrapping = el.closest('label');
    if (wrapping?.textContent) return wrapping.textContent.trim();

    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder.trim();

    const title = el.getAttribute('title');
    if (title) return title.trim();

    const text = (el.innerText || el.textContent || '').trim();
    if (text) return text.slice(0, 200);

    const name = el.getAttribute('name');
    return name ? name.trim() : '';
  }

  // Autocomplete tokens are a W3C-standard vocabulary and are identical on a
  // Japanese or Arabic site, which is why they are a better sensitivity signal
  // than any list of English button labels.
  const SENSITIVE_AUTOCOMPLETE = /cc-|new-password|current-password|one-time-code/;

  /**
   * Would activating this element submit a form?
   *
   * Structural, so it does not care what language the button is labelled in.
   */
  function submitsForm(el) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'submit' || type === 'image') return true;
    // A <button> inside a form defaults to type=submit.
    if (el.tagName === 'BUTTON' && !type && el.closest('form')) return true;
    return false;
  }

  /** Does the surrounding form handle credentials, payment, or one-time codes? */
  function formIsSensitive(el) {
    const form = el.closest('form');
    if (!form) return false;
    const inputs = form.querySelectorAll('input');
    for (const input of inputs) {
      if ((input.getAttribute('type') || '').toLowerCase() === 'password') return true;
      const autocomplete = (input.getAttribute('autocomplete') || '').toLowerCase();
      if (autocomplete && SENSITIVE_AUTOCOMPLETE.test(autocomplete)) return true;
      // Payment fields are commonly typed as tel/number with a telltale name.
      const name = `${input.getAttribute('name') || ''} ${input.id || ''}`.toLowerCase();
      if (/card|cvc|cvv|iban|account.?number|routing/.test(name)) return true;
    }
    return false;
  }

  function snapshot(limit) {
    const max = typeof limit === 'number' ? limit : 150;
    const out = [];
    const nodes = document.querySelectorAll(SELECTOR);

    for (const el of nodes) {
      if (out.length >= max) break;
      if (!visible(el)) continue;

      const rect = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute('type') || undefined;

      // Never expose the contents of a password field to the model.
      const isPassword = type === 'password';
      const raw = 'value' in el ? String(el.value ?? '') : '';

      out.push({
        ref: refFor(el),
        tag,
        type,
        name: accessibleName(el).slice(0, 200),
        value: isPassword ? (raw ? '••••••' : '') : raw.slice(0, 200),
        placeholder: el.getAttribute('placeholder') || undefined,
        required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
        checked: 'checked' in el ? Boolean(el.checked) : undefined,
        disabled: 'disabled' in el ? Boolean(el.disabled) : undefined,
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        offscreen:
          rect.bottom < 0 ||
          rect.top > window.innerHeight ||
          rect.right < 0 ||
          rect.left > window.innerWidth,
        submits: submitsForm(el),
        formSensitive: formIsSensitive(el),
        options:
          tag === 'select'
            ? Array.from(el.options || [])
                .slice(0, 100)
                .map((o) => o.value || o.text)
            : undefined,
      });
    }

    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();

    return {
      url: location.href,
      title: document.title,
      text: bodyText.slice(0, 6_000),
      elements: out,
      scroll: {
        y: Math.round(window.scrollY),
        height: Math.round(document.body?.scrollHeight || 0),
        viewport: Math.round(window.innerHeight),
      },
    };
  }

  function scrollIntoView(ref) {
    const el = byRef(ref);
    if (!el) return { ok: false, reason: 'no-element' };
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const rect = el.getBoundingClientRect();
    return {
      ok: true,
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }

  // React and other frameworks track input state internally, so assigning to
  // .value directly is not observed. Setting through the native setter and
  // then dispatching input/change is what actually updates a controlled field.
  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc?.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function act(action) {
    const el = action.ref != null ? byRef(action.ref) : null;
    if (action.ref != null && !el) return { ok: false, reason: 'no-element' };

    switch (action.kind) {
      case 'click':
        el.focus?.();
        el.click();
        return { ok: true };

      case 'type':
        el.focus?.();
        if (el.isContentEditable) {
          el.textContent = action.text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          setNativeValue(el, action.text);
        }
        return { ok: true };

      case 'select': {
        const options = Array.from(el.options || []);
        const match =
          options.find((o) => o.value === action.value) ||
          options.find((o) => o.text.trim() === action.value.trim()) ||
          options.find((o) => o.text.toLowerCase().includes(action.value.toLowerCase()));
        if (!match) return { ok: false, reason: 'no-option' };
        setNativeValue(el, match.value);
        return { ok: true };
      }

      case 'scroll': {
        const amount = action.amount || Math.round(window.innerHeight * 0.8);
        window.scrollBy({ top: action.direction === 'up' ? -amount : amount, behavior: 'smooth' });
        return { ok: true };
      }

      default:
        return { ok: false, reason: 'unsupported' };
    }
  }

  window.__zyphoraAgentSnapshot = snapshot;
  window.__zyphoraAgentAct = act;
  window.__zyphoraAgentScrollTo = scrollIntoView;
  return true;
})();

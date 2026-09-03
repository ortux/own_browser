// Reading mode — pure DOM article extraction, no library dependency.
// Injected into the active webview via executeJavaScript as a string.
// Toggles between a clean typographic view and the original page.

(() => {
  const FLAG = '__zyphoraReaderActive';
  const SNAP = '__zyphoraReaderSnapshot';

  // Teardown. Reader mode is an overlay, so exiting is just removing the
  // overlay and un-hiding the page. The previous implementation restored a
  // serialized documentElement.innerHTML snapshot, which destroyed every
  // event listener, running script and SPA state on the page — leaving a dead
  // page that only a reload could fix.
  if (window[FLAG]) {
    const snap = window[SNAP];
    const overlay = document.getElementById('zr-overlay');
    if (overlay) overlay.remove();
    const style = document.getElementById('zr-style');
    if (style) style.remove();
    if (snap) {
      document.documentElement.style.overflow = snap.htmlOverflow || '';
      document.body.style.overflow = snap.bodyOverflow || '';
      if (snap.scrollY != null) window.scrollTo(0, snap.scrollY);
    }
    delete window[SNAP];
    delete window[FLAG];
    return false;
  }

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'VIDEO',
    'AUDIO', 'PICTURE', 'SOURCE', 'TRACK', 'FORM', 'INPUT', 'BUTTON',
    'SELECT', 'OPTION', 'TEXTAREA',
  ]);
  const TAG_WEIGHT = {
    ARTICLE: 2.5, MAIN: 2.5, P: 0.5, BLOCKQUOTE: 0.6, PRE: 0.6,
    NAV: -2, FOOTER: -2, ASIDE: -2, HEADER: -2,
  };

  function getText(node) {
    return (node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function density(node, text) {
    if (!text) return 0;
    const words = Math.max(1, text.split(/\s+/).length);
    let weight = 1;
    const tag = node.tagName;
    if (TAG_WEIGHT[tag] != null) weight += TAG_WEIGHT[tag];
    if (/^H[1-6]$/.test(tag)) weight += 1.2;
    const linkLen = Array.from(node.querySelectorAll('a'))
      .reduce((s, a) => s + (a.textContent || '').length, 0);
    const linkRatio = linkLen / text.length;
    if (linkRatio > 0.5) weight -= 1.5;
    return words * weight * (1 - linkRatio * 0.5);
  }

  function findRoot() {
    if (!document.body) return null;
    const all = Array.from(document.body.querySelectorAll('*'));
    let best = null;
    let bestScore = 0;
    for (const el of all) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      if (el.children.length === 0) continue;
      const text = getText(el);
      if (text.length < 250) continue;
      const score = density(el, text);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (!best) {
      best = document.querySelector('article') || document.querySelector('main') || document.body;
    }
    return best;
  }

  function cleanClone(root) {
    const clone = root.cloneNode(true);
    const all = Array.from(clone.querySelectorAll('*'));
    for (const el of all) {
      if (SKIP_TAGS.has(el.tagName)) { el.remove(); continue; }
      if (el.tagName === 'A' && !el.textContent.trim()) { el.remove(); continue; }
      for (const attr of Array.from(el.attributes)) {
        const n = attr.name.toLowerCase();
        if (n === 'style' || n.startsWith('on') || n === 'class') {
          el.removeAttribute(attr.name);
        }
      }
    }
    return clone;
  }

  function findTitle() {
    const og = document.querySelector('meta[property="og:title"]') ||
               document.querySelector('meta[name="twitter:title"]');
    if (og && og.content) return og.content.trim();
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    return document.title || '';
  }

  function findImage() {
    const og = document.querySelector('meta[property="og:image"]') ||
               document.querySelector('meta[name="twitter:image"]');
    if (og && og.content) return og.content;
    const firstFig = document.querySelector('figure img');
    return firstFig ? firstFig.src : null;
  }

  function esc(s) {
    return String(s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  }

  const root = findRoot();
  if (!root) return false;

  const article = cleanClone(root);
  const title = findTitle();
  const hero = findImage();

  window[SNAP] = {
    htmlOverflow: document.documentElement.style.overflow,
    bodyOverflow: document.body.style.overflow,
    scrollY: window.scrollY,
  };
  window[FLAG] = true;

  // Append a scoped stylesheet rather than replacing document.head, so the
  // underlying page keeps its own styles and scripts intact.
  const styleEl = document.createElement('style');
  styleEl.id = 'zr-style';
  styleEl.textContent = `
      :root { color-scheme: light dark; }
      html, body { margin: 0; padding: 0; background: #fbfaf7; color: #1a1a1a;
        font-family: 'Iowan Old Style', 'Apple Garamond', 'Baskerville', Georgia, 'Times New Roman', serif;
        font-size: 19px; line-height: 1.65; }
      @media (prefers-color-scheme: dark) {
        html, body { background: #15151a; color: #ececec; }
        a { color: #8ab4ff; }
      }
      .zr-wrap { max-width: 680px; margin: 0 auto; padding: 56px 24px 96px; }
      .zr-title { font-size: 2.2em; line-height: 1.15; margin: 0 0 .35em;
        font-weight: 700; letter-spacing: -0.01em; }
      .zr-byline { color: #6b6b6b; font-size: 0.85em; margin: 0 0 1.6em;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      .zr-hero { width: 100%; height: auto; border-radius: 6px; margin: 0 0 1.6em; }
      .zr-body p { margin: 0 0 1.1em; }
      .zr-body h1, .zr-body h2, .zr-body h3 { line-height: 1.25; margin: 1.6em 0 0.4em; }
      .zr-body blockquote { border-left: 3px solid currentColor; padding: 0 1em;
        margin: 1em 0; color: #555; font-style: italic; }
      @media (prefers-color-scheme: dark) { .zr-body blockquote { color: #aaa; } }
      .zr-body pre, .zr-body code { font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace;
        font-size: 0.85em; background: rgba(127,127,127,.12); padding: 0.1em 0.35em; border-radius: 4px; }
      .zr-body pre { padding: 1em; overflow-x: auto; }
      .zr-body img { max-width: 100%; height: auto; }
      .zr-toolbar { position: fixed; top: 14px; right: 14px; display: flex; gap: 6px;
        background: rgba(255,255,255,.92); border: 1px solid #e2e2e2; border-radius: 999px;
        padding: 6px 10px; backdrop-filter: blur(8px);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.08); z-index: 9999; }
      @media (prefers-color-scheme: dark) {
        .zr-toolbar { background: rgba(30,30,34,.85); border-color: #333; color: #ddd; }
      }
      .zr-toolbar button { background: none; border: 0; cursor: pointer; padding: 4px 8px;
        border-radius: 999px; color: inherit; font-size: 12px; }
      .zr-toolbar button:hover { background: rgba(127,127,127,.18); }
      #zr-overlay { position: fixed; inset: 0; z-index: 2147483646; overflow-y: auto;
        background: #fbfaf7; color: #1a1a1a;
        font-family: 'Iowan Old Style', 'Apple Garamond', 'Baskerville', Georgia, 'Times New Roman', serif;
        font-size: 19px; line-height: 1.65; }
      @media (prefers-color-scheme: dark) {
        #zr-overlay { background: #15151a; color: #ececec; }
      }
  `;
  document.head.appendChild(styleEl);

  // Lock background scrolling while the overlay is up.
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  const overlay = document.createElement('div');
  overlay.id = 'zr-overlay';
  overlay.innerHTML = `
    <div class="zr-wrap">
      <div class="zr-toolbar">
        <span style="opacity:.6;padding:4px 4px 4px 6px;">Reader</span>
        <button data-zr-size="-">A−</button>
        <button data-zr-size="+">A+</button>
        <button data-zr-close>Close</button>
      </div>
      <h1 class="zr-title">${esc(title)}</h1>
      <p class="zr-byline">${esc(location.host)}</p>
      ${hero ? `<img class="zr-hero" src="${esc(hero)}" alt="">` : ''}
      <div class="zr-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.zr-body').appendChild(article);

  let scale = 1;
  const wrap = overlay.querySelector('.zr-wrap');
  function applyScale() { wrap.style.fontSize = (19 * scale) + 'px'; }
  overlay.querySelector('[data-zr-size="+"]').onclick = () => { scale = Math.min(1.8, scale + 0.1); applyScale(); };
  overlay.querySelector('[data-zr-size="-"]').onclick = () => { scale = Math.max(0.7, scale - 0.1); applyScale(); };
  overlay.querySelector('[data-zr-close]').onclick = () => {
    const snap = window[SNAP];
    overlay.remove();
    const style = document.getElementById('zr-style');
    if (style) style.remove();
    if (snap) {
      document.documentElement.style.overflow = snap.htmlOverflow || '';
      document.body.style.overflow = snap.bodyOverflow || '';
      if (snap.scrollY != null) window.scrollTo(0, snap.scrollY);
    }
    delete window[SNAP];
    delete window[FLAG];
    // Tell the shell its toolbar state is now stale.
    try {
      window.dispatchEvent(new CustomEvent('zyphora:reader-closed'));
    } catch (_) { /* ignore */ }
  };

  overlay.scrollTop = 0;
  return true;
})();

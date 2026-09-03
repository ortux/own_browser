/**
 * caretBrowsing.ts — the script injected into a guest page when caret browsing
 * is enabled in Accessibility settings.
 *
 * Chromium exposes no caret-browsing switch to embedders, so this implements
 * it the way the accessibility feature actually behaves: a visible text cursor
 * placed in the document, moved with the arrow keys, extended with Shift, and
 * removed again when the setting is turned off.
 *
 * Injected as a string via `webview.executeJavaScript`, so it must be
 * self-contained and safe to run more than once on the same page.
 */

const FLAG = '__zyphoraCaretBrowsing';

export function caretBrowsingScript(enabled: boolean): string {
  return `(() => {
  const FLAG = ${JSON.stringify(FLAG)};
  const state = window[FLAG];

  if (!${JSON.stringify(enabled)}) {
    if (state) {
      document.removeEventListener('keydown', state.onKeyDown, true);
      const style = document.getElementById('zyphora-caret-style');
      if (style) style.remove();
      try { document.body.removeAttribute('contenteditable'); } catch (e) {}
      delete window[FLAG];
    }
    return;
  }

  if (state) return;

  const style = document.createElement('style');
  style.id = 'zyphora-caret-style';
  style.textContent = '::selection { background: Highlight; color: HighlightText; }';
  document.documentElement.appendChild(style);

  // Place the caret at the start of the document so the first arrow key has
  // somewhere to move from.
  const selection = window.getSelection();
  if (selection && selection.rangeCount === 0 && document.body) {
    const range = document.createRange();
    range.setStart(document.body, 0);
    range.collapse(true);
    selection.addRange(range);
  }

  const onKeyDown = (event) => {
    const target = event.target;
    // Never hijack typing in a form field or an editable region.
    if (
      target &&
      (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT')
    ) {
      return;
    }
    const sel = window.getSelection();
    if (!sel) return;

    const alter = event.shiftKey ? 'extend' : 'move';
    let direction = null;
    let granularity = 'character';

    switch (event.key) {
      case 'ArrowLeft': direction = 'left'; break;
      case 'ArrowRight': direction = 'right'; break;
      case 'ArrowUp': direction = 'backward'; granularity = 'line'; break;
      case 'ArrowDown': direction = 'forward'; granularity = 'line'; break;
      case 'Home': direction = 'backward'; granularity = 'lineboundary'; break;
      case 'End': direction = 'forward'; granularity = 'lineboundary'; break;
      default: return;
    }

    if (event.ctrlKey && granularity === 'character') granularity = 'word';

    event.preventDefault();
    sel.modify(alter, direction, granularity);

    // Keep the caret on screen as it moves past the fold.
    const focusNode = sel.focusNode;
    const element = focusNode && (focusNode.nodeType === 1 ? focusNode : focusNode.parentElement);
    if (element && element.scrollIntoView) {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  document.addEventListener('keydown', onKeyDown, true);
  window[FLAG] = { onKeyDown: onKeyDown };
})();`;
}

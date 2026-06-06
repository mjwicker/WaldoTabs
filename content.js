// content.js — Readability-powered content extraction for WaldoTabs
(function () {
  'use strict';

  window._waldoTabsExtract = async function (options = {}) {
    const { maxLength = 6000 } = options;
    if (typeof window.Readability !== 'undefined') {
      try {
        const article = new window.Readability(document.body.cloneNode(true)).parse();
        if (article?.textContent) {
          return {
            title: article.title || document.title,
            byline: article.byline || null,
            content: article.textContent.substring(0, maxLength),
            excerpt: article.excerpt || '',
            length: article.length || 0,
            source: 'readability'
          };
        }
      } catch (e) { console.warn('[WaldoTabs] Readability failed:', e); }
    }
    // Fallback: innerText
    const raw = document.body?.innerText || '';
    const lines = raw.split('\n').filter(l => l.trim().length > 20);
    return {
      title: document.title,
      byline: null,
      content: lines.join('\n').substring(0, maxLength),
      excerpt: lines.join('\n').substring(0, 200) + '...',
      length: lines.join('\n').length,
      source: 'innerText'
    };
  };

  // ── Agentic action primitives ────────────────────────────────────────────────
  // Called by background.js via executeScript after user approves each action.
  // All return a plain observation string so the model can reason about the result.

  window._waldoTabsAction = function (tool, args) {
    if (tool === 'list_interactive') {
      // Index every visible interactive element; stamp data-waldo-idx for stable addressing
      const SELECTORS = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [role="button"]';
      const elements = Array.from(document.querySelectorAll(SELECTORS))
        .filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0; // visible only
        })
        .slice(0, 50); // cap at 50 to avoid overwhelming context

      elements.forEach((el, i) => { el.dataset.waldoIdx = String(i); });

      const items = elements.map((el, i) => {
        const tag  = el.tagName.toLowerCase();
        const type = el.getAttribute('type') || '';
        const text = (el.textContent || el.value || el.placeholder || el.getAttribute('aria-label') || '').trim().substring(0, 60);
        return `[${i}] ${tag}${type ? ':' + type : ''} — ${text || '(no label)'}`;
      });

      return { ok: true, observation: items.length
        ? `Interactive elements (use index to act):\n${items.join('\n')}`
        : 'No interactive elements found on this page.' };
    }

    if (tool === 'click') {
      const el = document.querySelector(`[data-waldo-idx="${args.index}"]`);
      if (!el) return { ok: false, observation: `Element [${args.index}] not found. Call list_interactive first.` };
      el.click();
      return { ok: true, observation: `Clicked [${args.index}]: ${(el.textContent || '').trim().substring(0, 40)}` };
    }

    if (tool === 'fill') {
      const el = document.querySelector(`[data-waldo-idx="${args.index}"]`);
      if (!el) return { ok: false, observation: `Element [${args.index}] not found. Call list_interactive first.` };
      if (el.tagName === 'SELECT') {
        el.value = args.value;
      } else {
        el.focus();
        el.value = String(args.value ?? '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return { ok: true, observation: `Filled [${args.index}] with value (${String(args.value ?? '').length} chars)` };
    }

    if (tool === 'scroll') {
      if (args.index !== undefined) {
        const el = document.querySelector(`[data-waldo-idx="${args.index}"]`);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return { ok: true, observation: `Scrolled to [${args.index}]` }; }
        return { ok: false, observation: `Element [${args.index}] not found.` };
      }
      const dir = args.direction || 'down';
      const delta = args.pixels || 400;
      window.scrollBy(0, dir === 'up' ? -delta : delta);
      return { ok: true, observation: `Scrolled ${dir} by ${delta}px` };
    }

    return { ok: false, observation: `Unknown tool: ${tool}. Available: list_interactive, click, fill, scroll` };
  };

  window._waldoTabsQuickExtract = function (maxLength = 4000) {
    if (typeof window.Readability !== 'undefined') {
      try {
        const article = new window.Readability(document.body.cloneNode(true)).parse();
        if (article?.textContent) return article.textContent.substring(0, maxLength);
      } catch (_) {}
    }
    return (document.body?.innerText || '').substring(0, maxLength);
  };
})();
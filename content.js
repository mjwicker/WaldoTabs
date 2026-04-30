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
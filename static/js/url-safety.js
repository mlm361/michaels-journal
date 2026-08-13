(function (root) {
  'use strict';

  function publicHttpUrl(value) {
    try {
      var parsed = new URL(String(value || '').trim());
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
      if (!parsed.hostname || parsed.username || parsed.password) return '';
      return parsed.href;
    } catch (_error) {
      return '';
    }
  }

  Object.defineProperty(root, 'MichaelUrlSafety', {
    value: Object.freeze({ publicHttpUrl: publicHttpUrl }),
    writable: false,
    configurable: false,
  });
})(typeof window !== 'undefined' ? window : globalThis);

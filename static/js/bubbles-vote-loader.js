(function () {
  'use strict';

  var SCRIPT_URL = 'https://bubbles.town/vote-v1.js';
  var SCRIPT_SRI = 'sha384-iPZ+izwo1AOEa00AnHP7pK0fffeEeeP05nk7pfPCHkmDnyYpi7/hzWJoMUtsJNvl';
  var scriptPromise = null;

  function loadOfficialWidget() {
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-bubbles-official]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      var script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.integrity = SCRIPT_SRI;
      script.crossOrigin = 'anonymous';
      script.dataset.bubblesOfficial = 'true';
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.appendChild(script);
    });

    return scriptPromise;
  }

  function makeAccessible(slot) {
    var link = slot.querySelector('a.bubbles-vote-btn');
    if (!link) return false;

    var countNode = link.querySelector('.bubbles-vote-num');
    var count = countNode ? parseInt(countNode.textContent.trim(), 10) : 0;
    var label;
    if (count === 1) {
      label = '1 vote on Bubbles, opens in a new tab';
    } else if (count > 1) {
      label = count + ' votes on Bubbles, opens in a new tab';
    } else {
      label = 'Vote on Bubbles, opens in a new tab';
    }

    link.classList.add('post-action', 'post-action-bubbles');
    link.setAttribute('aria-label', label);
    link.setAttribute('rel', 'noopener noreferrer external');
    slot.setAttribute('aria-busy', 'false');
    slot.classList.remove('is-loading', 'is-empty');
    slot.classList.add('is-ready');
    return true;
  }

  function markUnavailable(slot) {
    if (slot.classList.contains('is-ready')) return;
    slot.setAttribute('aria-busy', 'false');
    slot.classList.remove('is-loading');
    slot.classList.add('is-empty');
  }

  function mount(slot) {
    if (slot.dataset.bubblesMounted === 'true') return;
    slot.dataset.bubblesMounted = 'true';
    slot.setAttribute('aria-busy', 'true');
    slot.classList.add('is-loading');

    var widget = document.createElement('span');
    widget.className = 'bubbles-vote';
    widget.dataset.url = slot.dataset.bubblesUrl;
    widget.dataset.format = 'full';

    var mutationObserver = new MutationObserver(function () {
      if (makeAccessible(slot)) mutationObserver.disconnect();
    });
    mutationObserver.observe(widget, { childList: true, subtree: true });
    slot.appendChild(widget);

    loadOfficialWidget()
      .then(function () {
        window.setTimeout(function () {
          if (!makeAccessible(slot)) markUnavailable(slot);
          mutationObserver.disconnect();
        }, 8000);
      })
      .catch(function () {
        mutationObserver.disconnect();
        markUnavailable(slot);
      });
  }

  function start() {
    var slots = document.querySelectorAll('[data-bubbles-slot]');
    if (!slots.length) return;

    if (!('IntersectionObserver' in window)) {
      slots.forEach(mount);
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        mount(entry.target);
      });
    }, { rootMargin: '320px 0px' });

    slots.forEach(function (slot) { observer.observe(slot); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

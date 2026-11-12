/**
 * Sentinel runtime — progressive enhancement that works on every page
 * without requiring markup changes.
 *
 * 1. Marks the document as JS-capable so CSS can opt in.
 * 2. Hardens external links (`rel="noopener noreferrer"`).
 * 3. Defers offscreen image decoding so first paint stays cheap.
 * 4. Offsets in-page anchor jumps when a sticky header is present.
 */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  function hardenLinks() {
    var links = document.querySelectorAll('a[target="_blank"]');

    for (var i = 0; i < links.length; i += 1) {
      var link = links[i];
      var rel = (link.getAttribute('rel') || '').split(/\s+/);

      if (rel.indexOf('noopener') === -1) rel.push('noopener');
      if (rel.indexOf('noreferrer') === -1) rel.push('noreferrer');

      link.setAttribute('rel', rel.join(' ').trim());
    }
  }

  function tagImages() {
    var images = document.querySelectorAll('img');

    for (var i = 0; i < images.length; i += 1) {
      var img = images[i];

      // Never demote a hero image that is already eager/priority.
      if (img.getAttribute('loading') === null && !img.hasAttribute('data-eager')) {
        img.setAttribute('loading', 'lazy');
      }

      if (img.getAttribute('decoding') === null) {
        img.setAttribute('decoding', 'async');
      }
    }
  }

  function offsetAnchors() {
    var header = document.querySelector('[data-sticky-header], header.sticky, header.fixed');

    if (!header) return;

    document.addEventListener('click', function (event) {
      var target = event.target.closest ? event.target.closest('a[href^="#"]') : null;

      if (!target) return;

      var hash = target.getAttribute('href');
      var destination = hash && hash.length > 1 ? document.getElementById(hash.slice(1)) : null;

      if (!destination) return;

      event.preventDefault();
      window.scrollTo({
        top: destination.getBoundingClientRect().top + window.pageYOffset - header.offsetHeight - 16,
        behavior: 'smooth',
      });
      history.pushState(null, '', hash);
    });
  }

  function init() {
    hardenLinks();
    tagImages();
    offsetAnchors();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

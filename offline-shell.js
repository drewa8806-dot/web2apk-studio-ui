(() => {
  'use strict';

  const startedAt = performance.now();
  const minimumSplashMs = 2000;

  function updateNetworkState() {
    const online = navigator.onLine;
    const badge = document.getElementById('networkStatus');
    if (badge) {
      badge.classList.toggle('offline', !online);
      const label = badge.querySelector('b');
      if (label) label.textContent = online ? 'متصل' : 'بدون إنترنت';
      badge.title = online
        ? 'الواجهة تعمل محلياً، والبناء السحابي متاح'
        : 'الواجهة والمعاينة تعملان محلياً؛ سيتم حفظ طلب البناء وإرساله عند عودة الإنترنت';
    }
    window.dispatchEvent(new CustomEvent('web2apk:network', { detail: { online } }));
  }

  function revealApplication() {
    const elapsed = performance.now() - startedAt;
    setTimeout(() => {
      document.documentElement.classList.remove('app-booting');
      const splash = document.getElementById('appBootSplash');
      if (splash) {
        splash.classList.add('done');
        setTimeout(() => splash.remove(), 500);
      }
      document.dispatchEvent(new CustomEvent('web2apk:app-ready'));
    }, Math.max(0, minimumSplashMs - elapsed));
  }

  window.addEventListener('online', updateNetworkState);
  window.addEventListener('offline', updateNetworkState);
  updateNetworkState();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      console.warn('Offline service worker registration failed:', error);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', revealApplication, { once: true });
  } else {
    revealApplication();
  }
})();

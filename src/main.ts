import { init } from './app';

init();

// Offline support (table play with no signal). Skipped in dev, where the
// service worker file isn't served and caching would fight hot reload.
const isLocalhost = ['localhost', '127.0.0.1'].includes(
  window.location.hostname
);
if ('serviceWorker' in navigator && !isLocalhost) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline support is best-effort.
    });
  });
}

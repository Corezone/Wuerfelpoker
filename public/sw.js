// Minimaler Service Worker – nötig, damit Android die App installierbar anbietet.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());
self.addEventListener('fetch', () => {});

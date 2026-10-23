const CACHE_NAME = 'kemiterp-v1';
const ASSETS = [
  '/',
  '/?source=pwa',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('Pre-cache warning during install:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests from the same origin to avoid caching third-party or chrome-extensions
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(event.request.url);

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // If we found a direct match, use it
      if (cachedResponse) {
        // Fetch a fresh version in the background (stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {
          // ignore background fetch errors (e.g. offline)
        });
        return cachedResponse;
      }

      // If it has search params (like ?source=pwa), try matching the clean pathname (e.g. /)
      if (url.search) {
        return caches.match(url.pathname).then((pathCachedResponse) => {
          if (pathCachedResponse) {
            return pathCachedResponse;
          }
          return fetchAndCache();
        });
      }

      return fetchAndCache();

      function fetchAndCache() {
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Fallback for offline web pages
          if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
            return caches.match('/index.html') || caches.match('/');
          }
        });
      }
    })
  );
});

// Background Sync Event
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-kemit-data') {
    event.waitUntil(
      Promise.resolve(console.log('Background Sync triggered: Syncing KEMIT ERP data in background'))
    );
  }
});

// Periodic Background Sync Event
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'periodic-kemit-check') {
    event.waitUntil(
      Promise.resolve(console.log('Periodic Background Sync triggered: Checking KEMIT ERP status'))
    );
  }
});

// Push Notification Event
self.addEventListener('push', (event) => {
  let data = { title: 'KEMIT ERP Update', body: 'New enterprise reconciliation request.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'KEMIT ERP Update', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

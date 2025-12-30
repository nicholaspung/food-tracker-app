// Cleanup service worker - unregisters itself and clears all caches
// This is a temporary service worker to clean up the old PWA caches

self.addEventListener('install', () => {
  // Force this service worker to become active immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Delete all caches
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('All caches cleared, unregistering service worker');
      // Unregister this service worker
      return self.registration.unregister();
    }).then(() => {
      // Get all clients (browser tabs/windows)
      return self.clients.matchAll({ type: 'window' });
    }).then((clients) => {
      // Reload all clients to get fresh content
      clients.forEach((client) => {
        if (client.url && 'navigate' in client) {
          client.navigate(client.url);
        }
      });
    })
  );
});

// No fetch handler needed - this allows requests to pass through to network
// without triggering the "no-op fetch handler" warning

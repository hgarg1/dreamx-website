/**
 * Dream X Service Worker
 * Provides offline functionality and caching for PWA
 */

const CACHE_VERSION = 'dreamx-v1.5.3';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;
const CACHE_IMAGES = `${CACHE_VERSION}-images`;

// Files to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/css/style.css',
  '/css/polish.css',
  '/css/feed.css',
  '/css/post-card.css',
  '/css/mobile.css',
  '/css/notifications.css',
  '/css/enhanced-animations.css',
  '/js/notification-system.js',
  '/js/main.js',
  '/manifest.json',
  '/img/logo.svg'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing service worker...', event);
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((err) => {
        console.error('[Service Worker] Pre-caching failed:', err);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating service worker...', event);
  event.waitUntil(
    caches.keys()
      .then((keyList) => {
        return Promise.all(keyList.map((key) => {
          if (key !== CACHE_STATIC && key !== CACHE_DYNAMIC && key !== CACHE_IMAGES) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        }));
      })
  );
  return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip OAuth and authentication routes
  if (url.pathname.startsWith('/auth/') ||
      url.pathname === '/login' ||
      url.pathname === '/register' ||
      url.pathname === '/logout') {
    return;
  }

  // Skip authenticated pages that require session data
  // DO NOT CACHE these pages as they contain user-specific content
  if (url.pathname === '/' ||
      url.pathname === '/feed' ||
      url.pathname === '/map' ||
      url.pathname === '/profile' ||
      url.pathname.startsWith('/profile/') ||
      url.pathname === '/messages' ||
      url.pathname === '/settings' ||
      url.pathname === '/onboarding' ||
      url.pathname === '/onboarding-empty-state' ||
      url.pathname === '/verify-email' ||
      url.pathname === '/welcome' ||
      url.pathname === '/services' ||
      url.pathname.startsWith('/services/') ||
      url.pathname === '/create-service' ||
      url.pathname.startsWith('/edit-service/') ||
      url.pathname === '/billing' ||
      url.pathname === '/pricing' ||
      url.pathname === '/help' ||
      url.pathname === '/help-center' ||
      url.pathname === '/hr' ||
      url.pathname.startsWith('/post/') ||
      url.pathname.startsWith('/admin') ||
      url.pathname === '/search' ||
      url.pathname === '/notifications' ||
      url.pathname === '/refund-request' ||
      url.pathname === '/account-status' ||
      url.pathname === '/account-appeal' ||
      url.pathname === '/content-appeal') {
    return; // Skip service worker, always fetch from network
  }
  
  // Allow caching of static marketing/info pages (these are public and don't change often)
  const allowCachePaths = [
      '/terms',
      '/privacy',
      '/community-guidelines',
      '/about',
      '/contact',
      '/careers',
      '/team',
      '/features'
  ];
  
  // If it's not in the allow list, skip caching for safety
  if (!allowCachePaths.includes(url.pathname)) {
    // For CSS, JS, and images, we can cache
    if (!url.pathname.startsWith('/css/') && 
        !url.pathname.startsWith('/js/') && 
        !url.pathname.startsWith('/img/') &&
        !url.pathname.startsWith('/uploads/') &&
        !url.pathname.startsWith('/fonts/') &&
        request.destination !== 'image' &&
        request.destination !== 'style' &&
        request.destination !== 'script') {
      return; // Skip caching for unknown authenticated routes
    }
  }

  // Skip socket.io and API requests
  if (url.pathname.includes('/socket.io') || 
      url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/webauthn/') ||
      url.pathname.startsWith('/admin/') ||
      url.pathname.startsWith('/hr')) {
    return;
  }

  // Handle different types of requests
  if (request.destination === 'image') {
    event.respondWith(handleImageRequest(request));
  } else if (STATIC_ASSETS.some(asset => url.pathname.includes(asset))) {
    event.respondWith(handleStaticRequest(request));
  } else {
    event.respondWith(handleDynamicRequest(request));
  }
});

// Handle static asset requests (cache-first)
async function handleStaticRequest(request) {
  const url = new URL(request.url);
  
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return fetch(request);
  }
  
  const cache = await caches.open(CACHE_STATIC);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    // Only cache successful same-origin responses
    if (networkResponse.ok && url.origin === self.location.origin) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Static fetch failed:', error);
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Handle dynamic content requests (network-first, fallback to cache)
async function handleDynamicRequest(request) {
  const url = new URL(request.url);
  
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return fetch(request);
  }
  
  const cache = await caches.open(CACHE_DYNAMIC);
  
  try {
    const networkResponse = await fetch(request);
    // Only cache successful same-origin responses
    if (networkResponse.ok && url.origin === self.location.origin) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page
    return new Response('<h1>Offline</h1><p>You are currently offline. Please check your internet connection.</p>', {
      headers: { 'Content-Type': 'text/html' },
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Handle image requests (cache-first with network fallback)
async function handleImageRequest(request) {
  const url = new URL(request.url);
  
  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return fetch(request);
  }
  
  const cache = await caches.open(CACHE_IMAGES);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    // Only cache successful same-origin responses
    if (networkResponse.status === 200 && url.origin === self.location.origin) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Return placeholder image for offline
    return new Response('', {
      status: 404,
      statusText: 'Image Not Available Offline'
    });
  }
}

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);
  
  let data = {
    title: 'Dream X',
    body: 'You have a new notification',
    icon: '/img/icon-192x192.png',
    badge: '/img/badge-72x72.png'
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/img/icon-192x192.png',
    badge: data.badge || '/img/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now()
    },
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/img/icon-view.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/img/icon-close.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then((clientList) => {
      // Check if there's already a window open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if none found
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Background sync:', event);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  } else if (event.tag === 'sync-posts') {
    event.waitUntil(syncPosts());
  }
});

async function syncMessages() {
  console.log('[Service Worker] Syncing offline messages');
  // Implement message sync logic
}

async function syncPosts() {
  console.log('[Service Worker] Syncing offline posts');
  // Implement post sync logic
}

// Message handling from main thread
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((keyList) => {
        return Promise.all(keyList.map((key) => caches.delete(key)));
      })
    );
  }
});

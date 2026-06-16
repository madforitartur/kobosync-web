// KoboSync Service Worker
const CACHE_NAME = 'kobosync-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

// Install: pré-cache dos assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: Network-first para API, Cache-first para assets estáticos
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignora requests não-GET e extensões de browser
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // API calls: Network only (não queremos cachear dados dinâmicos)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // Supabase e Google Drive: Network only
  if (url.hostname.includes('supabase') || url.hostname.includes('googleapis')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Assets estáticos: Cache-first com fallback para network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Só faz cache de respostas válidas
        if (response.ok && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

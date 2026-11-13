// KoboSync Service Worker (v3)
// - Páginas: rede primeiro; offline usa a última versão guardada.
// - Capas: cache primeiro (o URL leva ?v=, por isso são imutáveis).
// - Biblioteca (/api/books, facetas): rede primeiro com cópia local para abrir sem ligação.
// - Livros "guardados para offline": /api/books/<id>[/content] e a página /read/<id> ficam na cache "kobosync-offline".
const STATIC = 'kobosync-static-v3';
const COVERS = 'kobosync-covers-v3';
const API = 'kobosync-api-v3';
const OFFLINE = 'kobosync-offline'; // não é apagada nas atualizações
const KEEP = [STATIC, COVERS, API, OFFLINE];
const MAX_COVERS = 800;
const MAX_API = 60;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(['/', '/manifest.json'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function networkFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      if (max) trim(cacheName, max);
    }
    return response;
  } catch (err) {
    const cached = (await cache.match(request)) || (await caches.match(request));
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Sem ligação à internet.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Livros guardados: só atualiza o que já foi guardado de propósito (não enche a cache sozinho)
async function offlineBook(request) {
  const cache = await caches.open(OFFLINE);
  try {
    const response = await fetch(request);
    if (response.ok && (await cache.match(request))) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Sem ligação. Guarda o livro para ler offline quando tiveres internet.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return; // Google Drive etc.: não mexe
  if (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/userdata')) return;

  // Capas: cache primeiro
  if (/^\/api\/books\/[^/]+\/cover$/.test(url.pathname)) {
    event.respondWith(
      caches.open(COVERS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          cache.put(req, res.clone());
          trim(COVERS, MAX_COVERS);
        }
        return res;
      })
    );
    return;
  }

  // Dados de um livro (detalhes/conteúdo): usa a cópia offline se não houver rede
  if (/^\/api\/books\/[^/]+(\/content)?$/.test(url.pathname)) {
    event.respondWith(offlineBook(req));
    return;
  }

  // Biblioteca e facetas: rede primeiro, com cópia local
  if (url.pathname === '/api/books' || url.pathname === '/api/library/facets') {
    event.respondWith(networkFirst(req, API, MAX_API));
    return;
  }

  // Resto da API: só rede
  if (url.pathname.startsWith('/api/')) return;

  // Navegação: rede primeiro; offline → cópia da página (ex.: leitor guardado) ou biblioteca
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const offlinePage = await (await caches.open(OFFLINE)).match(url.pathname);
        return offlinePage || (await caches.match('/')) || new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  // Ficheiros estáticos (JS/CSS/fontes/imagens): cache primeiro
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && res.type !== 'opaque') {
          const copy = res.clone();
          caches.open(STATIC).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});

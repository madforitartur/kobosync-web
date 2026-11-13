/**
 * Livros guardados para ler sem ligação (Cache API, no dispositivo).
 * Guarda: dados do livro, conteúdo (capítulos) e a página do leitor com os seus ficheiros JS/CSS.
 */
const CACHE = "kobosync-offline";
export const OFFLINE_EVENT = "kobosync:offline-changed";

const urls = (id: string) => [`/api/books/${id}`, `/api/books/${id}/content`];

export const offlineSupported = () => typeof caches !== "undefined";

export async function listOffline(): Promise<Set<string>> {
  if (!offlineSupported()) return new Set();
  const cache = await caches.open(CACHE);
  const ids = new Set<string>();
  for (const req of await cache.keys()) {
    const m = new URL(req.url).pathname.match(/^\/api\/books\/([^/]+)\/content$/);
    if (m) ids.add(m[1]);
  }
  return ids;
}

export async function saveOffline(id: string): Promise<void> {
  const cache = await caches.open(CACHE);
  for (const u of urls(id)) {
    const res = await fetch(u);
    if (!res.ok) throw new Error(`Não foi possível guardar (${res.status}).`);
    await cache.put(u, res);
  }
  // Página do leitor + ficheiros necessários (para abrir sem ligação)
  try {
    const page = await fetch(`/read/${id}`, { headers: { Accept: "text/html" } });
    if (page.ok) {
      const html = await page.clone().text();
      await cache.put(`/read/${id}`, page);
      const assets = new Set(html.match(/\/_next\/static\/[^"'\\)\s]+/g) ?? []);
      await Promise.all([...assets].map((a) => fetch(a).catch(() => null))); // o service worker guarda-os
    }
  } catch {
    /* melhor esforço */
  }
  window.dispatchEvent(new Event(OFFLINE_EVENT));
}

export async function removeOffline(id: string): Promise<void> {
  const cache = await caches.open(CACHE);
  await Promise.all([...urls(id), `/read/${id}`].map((u) => cache.delete(u)));
  window.dispatchEvent(new Event(OFFLINE_EVENT));
}

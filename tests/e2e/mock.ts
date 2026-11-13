import type { Page } from "@playwright/test";

export const BOOKS = Array.from({ length: 12 }, (_, i) => ({
  id: `b${i}`, drive_file_id: `b${i}`, title: `Livro ${i}`, author: i % 2 ? "Ana Silva" : "Rui Costa",
  series: i < 4 ? "Saga" : null, series_index: i < 4 ? i + 1 : null, language: "pt", publisher: null, isbn: null,
  description: "Uma sinopse.", cover_url: null, epub_url: null, filesize: 1_000_000, modified_at: null, created_at: null, updated_at: null,
}));

/** Simula a API para testar a interface sem Firebase/Drive. */
export async function mockApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (p === "/api/auth/status") return json({ protected: false });
    if (p === "/api/userdata") return json({ state: {} });
    if (p === "/api/library/facets")
      return json({
        authors: [{ name: "Ana Silva", count: 6, covers: [] }, { name: "Rui Costa", count: 6, covers: [] }],
        series: [{ name: "Saga", count: 4, covers: [] }],
        languages: [{ name: "pt", count: 12, covers: [] }],
      });
    if (p === "/api/books") {
      let list = BOOKS;
      const body = route.request().method() === "POST" ? route.request().postDataJSON() : {};
      const author = url.searchParams.get("author") ?? body.author;
      const q = (url.searchParams.get("q") ?? body.q ?? "").toLowerCase();
      if (author) list = list.filter((b) => b.author === author);
      if (q) list = list.filter((b) => b.title.toLowerCase().includes(q));
      if (body.ids) list = list.filter((b) => body.ids.includes(b.id));
      return json({ books: list, total: list.length, page: 1, totalPages: 1, ids: list.map((b) => b.id) });
    }
    if (p === "/api/books/selected") return json({ books: BOOKS.filter((b) => route.request().postDataJSON().ids.includes(b.id)) });
    if (p.endsWith("/cover")) return route.fulfill({ status: 404 });
    return json({});
  });
}

import { expect, test } from "@playwright/test";
import { bestOf, findDuplicateGroups, isPending } from "../../src/lib/duplicates";
import type { Book } from "../../src/types/library";

const mk = (id: string, title: string, author: string | null, size = 1000, extra: Partial<Book> = {}): Book => ({
  id, drive_file_id: id, title, author, series: null, series_index: null, language: null, publisher: null, isbn: null,
  description: null, cover_url: null, epub_url: null, filesize: size, modified_at: null, created_at: `2026-01-0${id.length}`, updated_at: null, ...extra,
});

test("deteta repetidos por título/autor sem contar acentos, parênteses ou maiúsculas", () => {
  const all = [
    mk("a", "A Sombra do Vento", "Carlos Ruiz Zafón"),
    mk("bb", "a sombra do vento (1)", "Carlos Ruiz Zafon", 2000),
    mk("ccc", "Dom Casmurro", "Machado de Assis"),
    mk("d", "Origem", "Dan Brown"),
    mk("ee", "Origem", "Charles Darwin"), // mesmo título, autores diferentes: não é repetido
  ];
  const g = findDuplicateGroups(all);
  expect(g).toHaveLength(1);
  expect(g[0].books.map((b) => b.id).sort()).toEqual(["a", "bb"]);
  expect(bestOf(g[0].books).id).toBe("bb");
});

test("grupos decididos deixam de estar pendentes", () => {
  const g = (hidden: boolean, ok: boolean) => ({ key: "k", books: [mk("a", "X", null, 1, { dup_ok: ok }), mk("bb", "X", null, 1, { hidden, dup_ok: ok })] });
  expect(isPending(g(false, false))).toBe(true);
  expect(isPending(g(true, false))).toBe(false); // um escondido: sobra uma cópia visível
  expect(isPending(g(false, true))).toBe(false); // mantidos
});

test("página de repetidos: esconder, repor e manter", async ({ page }) => {
  const book = (id: string, extra = {}) => ({ id, title: "Dom Casmurro", author: "Machado de Assis", filesize: 3_000_000, created_at: "2026-01-01", cover_url: null, hidden: false, dup_ok: false, folder: id === "1" ? "Pasta principal" : "Livros do Zé", ...extra });
  let state = { groups: [{ key: "k", books: [book("1"), book("2")] }], hidden: [] as unknown[], total: 2 };
  const calls: unknown[] = [];
  await page.route("**/api/duplicates", async (r) => {
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      calls.push(b);
      if (b.action === "hide") state = { groups: [], hidden: [book("2", { hidden: true })], total: 2 };
      if (b.action === "unhide") state = { groups: [], hidden: [], total: 2 };
      return r.fulfill({ json: { changed: 1 } });
    }
    return r.fulfill({ json: state });
  });
  await page.goto("/definicoes/duplicados");
  await expect(page.getByText("1 grupo por decidir")).toBeVisible();
  await expect(page.getByText(/Livros do Zé/)).toBeVisible();
  await page.getByRole("button", { name: "Esconder" }).nth(1).click();
  await expect(page.getByText("Escondidos da app (1)")).toBeVisible();
  expect(calls[0]).toEqual({ action: "hide", ids: ["2"] });
  await page.getByRole("button", { name: "Repor" }).click();
  await expect(page.getByText("Não há livros repetidos por decidir")).toBeVisible();
});

test("definições: dar nome a uma pasta do Drive", async ({ page }) => {
  let folders: { id: string; name: string; label?: string }[] = [{ id: "1EeDs8G-5nPLLmznJJ9Tlz0mTdK2PGMTn", name: "Pasta sem graça" }];
  await page.route("**/api/auth/status", (r) => r.fulfill({ json: { protected: true, user: { id: "admin", name: "Artur", role: "admin" } } }));
  await page.route("**/api/users", (r) => r.fulfill({ json: { users: [{ id: "admin", name: "Artur", role: "admin" }] } }));
  await page.route("**/api/drive-folders**", async (r) => {
    if (r.request().method() === "PATCH") {
      folders = [{ ...folders[0], label: r.request().postDataJSON().label }];
      return r.fulfill({ json: { folders } });
    }
    return r.fulfill({ json: { folders, envFolders: [], serviceEmail: "d@p.iam.gserviceaccount.com" } });
  });
  await page.goto("/definicoes");
  await page.getByRole("button", { name: /Dar nome a/ }).click();
  await page.getByLabel("Nome da pasta").fill("Livros do Zé");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("link", { name: "Livros do Zé" })).toBeVisible();
  await expect(page.getByText(/Drive: Pasta sem graça/)).toBeVisible();
});

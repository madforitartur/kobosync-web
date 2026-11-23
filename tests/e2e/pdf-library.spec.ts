import { expect, test, type Browser, type Page } from "@playwright/test";
import JSZip from "jszip";
import { mockApi } from "./mock";

const lorem = "A conversão de documentos é uma tarefa que exige cuidado com as palavras e com a ordem do texto. ";
async function makePdf(browser: Browser): Promise<Buffer> {
  const page = await browser.newPage();
  await page.setContent(`<html lang="pt"><body>${[1, 2].map((n) => `<h1 style="page-break-before:always">Capítulo ${n}</h1>` + Array.from({ length: 8 }, () => `<p>${lorem.repeat(5)}</p>`).join("")).join("")}</body></html>`);
  const pdf = await page.pdf({ format: "A5" });
  await page.close();
  return pdf;
}

const mk = (id: string, title: string, author: string | null) => ({
  id, drive_file_id: id, title, author, series: null, series_index: null, language: null, publisher: null, isbn: null,
  description: null, cover_url: null, epub_url: null, filesize: 2_000_000, modified_at: null, created_at: null, updated_at: null,
});
const PDFS = [mk("p1", "Dom Casmurro", "Machado de Assis"), mk("p2", "Mensagem", "Fernando Pessoa")];

/** A mesma API da biblioteca, mas a responder com PDFs quando se pede format=pdf. */
async function mockPdfApi(page: Page, seen: string[] = []) {
  await mockApi(page);
  await page.route("**/api/books**", async (r) => {
    const url = new URL(r.request().url());
    const body = r.request().method() === "POST" ? r.request().postDataJSON() : {};
    const fmt = url.searchParams.get("format") ?? body.format;
    if (fmt !== "pdf") return r.fallback();
    seen.push(url.pathname);
    let list = PDFS;
    if (body.ids) list = list.filter((b) => body.ids.includes(b.id));
    const q = (url.searchParams.get("q") ?? body.q ?? "").toLowerCase();
    if (q) list = list.filter((b) => b.title.toLowerCase().includes(q));
    return r.fulfill({ json: { books: list, total: list.length, page: 1, totalPages: 1, ids: list.map((b) => b.id) } });
  });
  await page.route("**/api/library/facets?format=pdf", (r) => r.fulfill({ json: { authors: [], series: [], languages: [] } }));
  await page.route("**/api/covers/status**", (r) => r.fulfill({ json: { pending: 0 } }));
}

test("escolhe entre a vista EPUB e PDF e lista os PDFs como a biblioteca", async ({ page }) => {
  await mockPdfApi(page);
  await page.goto("/");
  await expect(page.getByText("Livro 0").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Biblioteca", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "PDF" }).click();
  await expect(page.getByRole("heading", { name: "Biblioteca PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Opções de Dom Casmurro/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Opções de Mensagem/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Opções de Livro 0/ })).toHaveCount(0);

  await page.getByRole("tab", { name: "EPUB" }).click();
  await expect(page.getByRole("button", { name: /Opções de Livro 0/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Opções de Dom Casmurro/ })).toHaveCount(0);
});

test("PDF: menu do livro converte para EPUB e guarda no sistema", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const pdf = await makePdf(browser);
  await mockPdfApi(page);
  await page.route("**/api/pdfs/p1/file", (r) => r.fulfill({ body: pdf, contentType: "application/pdf" }));
  await page.goto("/?formato=pdf");
  await expect(page.getByRole("heading", { name: "Biblioteca PDF" })).toBeVisible();

  await page.getByRole("button", { name: /Opções de Dom Casmurro/ }).click();
  await expect(page.getByRole("link", { name: /Abrir PDF/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ler agora/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Converter para EPUB" }).click();
  await page.getByRole("button", { name: /Converter 1 livro/ }).click();
  await expect(page.getByText(/Convertido/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("button", { name: /Enviar para o Kobo/ })).toBeVisible();

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Guardar no meu sistema/ }).click()]);
  expect(dl.suggestedFilename()).toBe("Dom Casmurro - Machado de Assis.epub");
  const zip = await JSZip.loadAsync(await (await import("node:fs/promises")).readFile(await dl.path()));
  expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");
});

test("PDF: a seleção tem a ação 'Converter para EPUB' e é separada da dos EPUBs", async ({ page }) => {
  await mockPdfApi(page);
  await page.goto("/?formato=pdf");
  await page.getByRole("button", { name: /Opções de Mensagem/ }).click();
  await page.getByRole("button", { name: "Adicionar à seleção" }).click();
  await expect(page.getByText("1 selecionado")).toBeVisible();
  const bar = page.getByRole("toolbar", { name: "Ações da seleção" });
  await expect(bar.getByRole("button", { name: /Converter para EPUB/ })).toBeVisible();
  await expect(bar.getByRole("button", { name: /Partilhar/ })).toHaveCount(0);

  await page.getByRole("tab", { name: "EPUB" }).click();
  await expect(page.getByText("1 selecionado")).toHaveCount(0); // a seleção de EPUBs está vazia
});

test("/pdf encaminha para a vista PDF da biblioteca", async ({ page }) => {
  await mockPdfApi(page);
  await page.goto("/pdf");
  await expect(page).toHaveURL(/formato=pdf/);
  await expect(page.getByRole("heading", { name: "Biblioteca PDF" })).toBeVisible();
});

test("a biblioteca pede a verificação automática das pastas ao abrir", async ({ page }) => {
  await mockApi(page);
  let calls = 0;
  await page.route("**/api/sync/auto", (r) => { calls++; return r.fulfill({ json: { ran: true, newBooks: 2, found: 14 } }); });
  await page.goto("/");
  await expect(page.getByText(/2 livros novos encontrados no Drive/)).toBeVisible();
  expect(calls).toBe(1);
});

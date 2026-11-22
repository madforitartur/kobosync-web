import { expect, test, type Browser } from "@playwright/test";
import JSZip from "jszip";

const lorem = "A conversão de documentos é uma tarefa que exige cuidado com as palavras e com a ordem do texto. ";
async function makePdf(browser: Browser): Promise<Buffer> {
  const page = await browser.newPage();
  await page.setContent(`<html lang="pt"><body>${[1, 2].map((n) => `<h1 style="page-break-before:always">Capítulo ${n}</h1>` + Array.from({ length: 8 }, () => `<p>${lorem.repeat(5)}</p>`).join("")).join("")}</body></html>`);
  const pdf = await page.pdf({ format: "A5" });
  await page.close();
  return pdf;
}

const PDFS = [
  { id: "p1", title: "Dom Casmurro", author: "Machado de Assis", size: 2_000_000, modified: null, folder: "f1", folderName: "Clássicos", hasThumb: false },
  { id: "p2", title: "Mensagem", author: "Fernando Pessoa", size: 1_000_000, modified: null, folder: "f2", folderName: "Poesia", hasThumb: false },
];

test("lista PDFs separadamente, filtra e converte para EPUB", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const pdf = await makePdf(browser);
  await page.route("**/api/auth/status", (r) => r.fulfill({ json: { protected: true, user: { id: "u", name: "Ana", role: "user" } } }));
  await page.route("**/api/pdfs", (r) => r.fulfill({ json: { pdfs: PDFS } }));
  await page.route("**/api/pdfs/p1/file", (r) => r.fulfill({ body: pdf, contentType: "application/pdf" }));
  await page.goto("/pdf");
  await expect(page.getByRole("heading", { name: "Livros em PDF" })).toBeVisible();
  await expect(page.getByText("Dom Casmurro")).toBeVisible();
  await expect(page.getByText("Mensagem")).toBeVisible();

  await page.getByRole("button", { name: "Poesia" }).click();
  await expect(page.getByText("Dom Casmurro")).toBeHidden();
  await page.getByRole("button", { name: "Todas" }).click();
  await page.getByLabel("Pesquisar PDFs").fill("casmurro");
  await expect(page.getByText("Mensagem")).toBeHidden();

  await page.getByLabel(/Selecionar Dom Casmurro/).click();
  await expect(page.getByText("1 selecionado")).toBeVisible();
  await page.getByRole("button", { name: "Converter para EPUB" }).last().click();
  await page.getByRole("button", { name: /Converter 1 livro/ }).click();
  await expect(page.getByText(/Convertido/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("button", { name: /Enviar para o Kobo/ })).toBeVisible();

  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Guardar no meu sistema/ }).click()]);
  expect(dl.suggestedFilename()).toBe("Dom Casmurro - Machado de Assis.epub");
  const zip = await JSZip.loadAsync(await (await import("node:fs/promises")).readFile(await dl.path()));
  expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");
});

test("sem PDFs mostra a indicação", async ({ page }) => {
  await page.route("**/api/auth/status", (r) => r.fulfill({ json: { protected: false } }));
  await page.route("**/api/pdfs", (r) => r.fulfill({ json: { pdfs: [] } }));
  await page.goto("/pdf");
  await expect(page.getByText(/aparecem aqui automaticamente/)).toBeVisible();
});

test("ordena os PDFs por autor", async ({ page }) => {
  await page.route("**/api/auth/status", (r) => r.fulfill({ json: { protected: false } }));
  await page.route("**/api/pdfs", (r) => r.fulfill({ json: { pdfs: PDFS } }));
  await page.goto("/pdf");
  await page.getByLabel("Ordenar PDFs").selectOption("author");
  const titles = await page.locator("li p.line-clamp-2").allTextContents();
  expect(titles).toEqual(["Mensagem", "Dom Casmurro"]); // Fernando Pessoa antes de Machado de Assis
});

test("a biblioteca pede a verificação automática das pastas ao abrir", async ({ page }) => {
  const { mockApi } = await import("./mock");
  await mockApi(page);
  let calls = 0;
  await page.route("**/api/sync/auto", (r) => { calls++; return r.fulfill({ json: { ran: true, newBooks: 2, found: 14 } }); });
  await page.goto("/");
  await expect(page.getByText(/2 livros novos encontrados no Drive/)).toBeVisible();
  expect(calls).toBe(1);
});

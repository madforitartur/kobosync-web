import { expect, test, type Browser } from "@playwright/test";
import JSZip from "jszip";

const lorem = "A conversão de documentos é uma tarefa que exige cuidado com as palavras, com os parágrafos e com a ordem do texto. ";
const chapter = (n: number, name: string) =>
  `<h1>Capítulo ${n}: ${name}</h1>` + Array.from({ length: 9 }, (_, i) => `<p>Parágrafo ${n}.${i + 1}. ${lorem.repeat(5)}</p>`).join("");

async function makePdf(browser: Browser): Promise<Buffer> {
  const page = await browser.newPage();
  await page.setContent(`<html lang="pt"><head><title>Livro de Teste</title><style>
    body { font: 12pt/1.5 "Times New Roman", serif; } h1 { font-size: 26pt; page-break-before: always; margin-top: 0; }
    h1:first-of-type { page-break-before: auto; } p { margin: 0 0 0.9em; text-align: justify; }
  </style></head><body>${chapter(1, "O começo")}${chapter(2, "O meio")}${chapter(3, "O fim")}</body></html>`);
  const pdf = await page.pdf({
    format: "A5", margin: { top: "25mm", bottom: "25mm", left: "18mm", right: "18mm" }, displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:8px;width:100%;text-align:center">O LIVRO DE TESTE</div>`,
    footerTemplate: `<div style="font-size:9px;width:100%;text-align:center"><span class="pageNumber"></span></div>`,
  });
  await page.close();
  return pdf;
}

test("converte um PDF em EPUB válido: capítulos, sem cabeçalhos nem números de página", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const pdf = await makePdf(browser);
  await page.route("**/api/auth/status", (r) => r.fulfill({ json: { protected: true, user: { id: "admin", name: "Artur", role: "admin" } } }));
  await page.goto("/converter");
  await page.getByLabel("Escolher PDFs").setInputFiles({ name: "livro_de_teste.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByText(/páginas/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel(/^Autor de/).fill("Ana Autora");
  await page.getByRole("button", { name: /Converter 1 PDF/ }).click();
  const link = page.getByRole("link", { name: /Descarregar EPUB/ });
  await expect(link).toBeVisible({ timeout: 90_000 });
  const [dl] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(dl.suggestedFilename()).toBe("Livro de Teste - Ana Autora.epub");
  const path = await dl.path();
  const zip = await JSZip.loadAsync(await (await import("node:fs/promises")).readFile(path));

  expect(Object.keys(zip.files)[0]).toBe("mimetype");
  expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");
  const opf = await zip.file("OEBPS/content.opf")!.async("string");
  expect(opf).toContain("<dc:title>Livro de Teste</dc:title>");
  expect(opf).toContain("<dc:creator>Ana Autora</dc:creator>");
  expect(zip.file("OEBPS/cover.jpg")).toBeTruthy();

  const chapters = Object.keys(zip.files).filter((f) => /OEBPS\/ch\d+\.xhtml$/.test(f)).sort();
  expect(chapters.length).toBeGreaterThanOrEqual(3);
  const html = await Promise.all(chapters.map((f) => zip.file(f)!.async("string")));
  const all = html.join("\n");
  expect(all).toContain("Capítulo 1: O começo");
  expect(all).toContain("Capítulo 3: O fim");
  expect(all).not.toContain("O LIVRO DE TESTE"); // cabeçalho repetido removido
  expect(all).not.toMatch(/<p>\d{1,2}<\/p>/); // números de página removidos
  // cada parágrafo ficou inteiro (não partido linha a linha)
  const paras = all.match(/<p>Parágrafo \d\.\d\. [^<]+<\/p>/g) ?? [];
  expect(paras.length).toBeGreaterThanOrEqual(25);
  for (const p of paras) expect(p.length).toBeGreaterThan(300);
  const nav = await zip.file("OEBPS/nav.xhtml")!.async("string");
  expect(nav).toContain("Capítulo 2: O meio");
});

test("PDF sem texto dá um aviso claro", async ({ page, browser }) => {
  const p = await browser.newPage();
  await p.setContent(`<html><body><div style="width:200px;height:200px;background:#333"></div></body></html>`);
  const pdf = await p.pdf({ format: "A5" });
  await p.close();
  await page.route("**/api/auth/status", (r) => r.fulfill({ json: { protected: true, user: { id: "admin", name: "Artur", role: "admin" } } }));
  await page.goto("/converter");
  await page.getByLabel("Escolher PDFs").setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByText(/parece um PDF digitalizado/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Converter 1 PDF/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "digitalizado" })).toBeVisible({ timeout: 30_000 });
});

test("qualquer utilizador converte e guarda o EPUB na biblioteca offline, e consegue lê-lo", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const pdf = await makePdf(browser);
  await page.route("**/api/auth/status", (r) => r.fulfill({ json: { protected: true, user: { id: "u1", name: "Ana", role: "user" } } }));
  await page.goto("/converter");
  await expect(page.getByText(/Guardar em:/)).toBeVisible();
  await page.getByLabel("Escolher PDFs").setInputFiles({ name: "livro_de_teste.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByText(/páginas/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Converter 1 PDF/ }).click();
  await page.getByRole("button", { name: "Guardar na biblioteca offline" }).click({ timeout: 90_000 });
  await expect(page.getByText("Guardado na biblioteca offline")).toBeVisible();

  await page.goto("/offline");
  await expect(page.getByRole("link", { name: /Ler Livro de Teste/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: /Ler Livro de Teste/ }).click();
  await expect(page.getByText(/Capítulo 1: O começo/).first()).toBeVisible({ timeout: 20_000 });
});

test("/definicoes/converter reencaminha para /converter", async ({ page }) => {
  await page.route("**/api/auth/status", (r) => r.fulfill({ json: { protected: false } }));
  await page.goto("/definicoes/converter");
  await expect(page).toHaveURL(/\/converter$/);
});

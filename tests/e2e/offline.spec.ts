import { expect, test } from "@playwright/test";
import JSZip from "jszip";
import { mockApi } from "./mock";

async function makeEpub(title: string, author: string, text: string): Promise<Buffer> {
  const z = new JSZip();
  z.file("mimetype", "application/epub+zip", { compression: "STORE" });
  z.file("META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
  z.file("OEBPS/content.opf", `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">x</dc:identifier><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator><dc:language>pt</dc:language></metadata><manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`);
  z.file("OEBPS/c1.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Capítulo Único</h1><p>${text}</p><p onclick="alert(1)">Segura</p></body></html>`);
  return z.generateAsync({ type: "nodebuffer" });
}

test("importar, listar, ler e apagar livros offline (armazenamento da app)", async ({ page }) => {
  await mockApi(page);
  await page.goto("/offline");
  await expect(page.getByText("Biblioteca offline", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Ainda não há livros/)).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("Importar EPUBs").setInputFiles([
    { name: "um.epub", mimeType: "application/epub+zip", buffer: await makeEpub("Livro Offline Um", "Ana Autora", "Texto do primeiro livro offline.") },
    { name: "dois.epub", mimeType: "application/epub+zip", buffer: await makeEpub("Outro Livro", "Rui Autor", "Segundo livro.") },
  ]);
  await expect(page.getByText("2 livros guardados.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ler Livro Offline Um" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Ler Outro Livro" })).toBeVisible();

  await page.getByLabel("Pesquisar nos livros offline").fill("rui");
  await expect(page.getByRole("link", { name: "Ler Livro Offline Um" })).toHaveCount(0);
  await page.getByLabel("Pesquisar nos livros offline").fill("");

  await page.getByRole("link", { name: "Ler Livro Offline Um" }).click();
  await expect(page.getByText("Texto do primeiro livro offline.")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("[onclick]")).toHaveCount(0); // HTML limpo de handlers inline

  await page.goto("/offline");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Apagar Outro Livro" }).click();
  await expect(page.getByRole("link", { name: "Ler Outro Livro" })).toHaveCount(0, { timeout: 10_000 });
});

test("menu hambúrguer tem a biblioteca offline e o conversor para todos", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: /menu/i }).first().click();
  await expect(page.getByRole("link", { name: "Biblioteca offline" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Converter PDF em EPUB" })).toBeVisible();
});

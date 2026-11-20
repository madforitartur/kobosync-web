import { expect, test } from "@playwright/test";
import { mockApi } from "./mock";

test.use({ viewport: { width: 1440, height: 900 } });

async function selectTwo(page: import("@playwright/test").Page) {
  await mockApi(page);
  await page.route("**/api/books/*/download", (r) => r.fulfill({ status: 200, contentType: "application/epub+zip", body: Buffer.alloc(500, 1) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Opções de Livro 0", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar à seleção" }).click();
  await page.getByRole("button", { name: "Opções de Livro 1", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar à seleção" }).click();
}

test("partilha os livros selecionados com a partilha do sistema", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __shared: unknown }).__shared = null;
    navigator.canShare = () => true;
    navigator.share = async (d?: ShareData) => { (window as unknown as { __shared: unknown }).__shared = (d?.files ?? []).map((f) => ({ n: f.name, t: f.type, s: f.size })); };
  });
  await selectTwo(page);
  await page.getByRole("button", { name: /Partilhar \(WhatsApp/ }).first().click();
  await expect(page.getByText(/2 livros prontos/)).toBeVisible();
  await page.getByRole("button", { name: /Partilhar \(WhatsApp, outras apps\)/ }).last().click();
  const shared = await page.evaluate(() => (window as unknown as { __shared: { n: string; t: string; s: number }[] }).__shared);
  expect(shared).toHaveLength(2);
  expect(shared[0].n).toMatch(/\.epub$/);
  expect(shared[0].t).toBe("application/epub+zip");
});

test("sem suporte de partilha de ficheiros mostra aviso e ZIP", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); });
  await selectTwo(page);
  await page.getByRole("button", { name: /Partilhar \(WhatsApp/ }).first().click();
  await expect(page.getByText(/não permite partilhar ficheiros/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Descarregar em ZIP/ })).toBeVisible();
});

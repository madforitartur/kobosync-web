import { expect, test } from "@playwright/test";
import { renderReceiverPage } from "../../src/lib/receiver-page";
import { BOOKS, mockApi } from "./mock";

test("Kobo: mostra o código e lista os livros enviados", async ({ page }) => {
  const html = renderReceiverPage({ host: "app.exemplo.pt", code: "K7P2", secret: "segredo", qr: "<svg></svg>" });
  await page.route("**/receber", (r) => r.fulfill({ contentType: "text/html", body: html }));
  let calls = 0;
  await page.route("**/api/receber/poll**", (r) => {
    calls++;
    const files = calls < 2 ? [] : [{ title: "Dom Casmurro", filename: "Dom Casmurro.epub", url: "/api/receber/dl?code=K7P2&secret=segredo&i=0" }];
    return r.fulfill({ json: { expired: false, files } });
  });
  await page.goto("/receber");
  await expect(page.locator("#code")).toHaveText("K7P2");
  await expect(page.getByText("À espera dos livros…")).toBeVisible();
  await expect(page.getByRole("link", { name: /Dom Casmurro/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("1 livro pronto")).toBeVisible();
  await expect(page.getByRole("link", { name: /Dom Casmurro/ })).toHaveAttribute("href", /\/api\/receber\/dl\?code=K7P2/);
});

test("App: envia a seleção para o código do Kobo", async ({ page }) => {
  await mockApi(page);
  await page.addInitScript((ids) => localStorage.setItem("kobosync:selection", JSON.stringify(ids)), ["b0", "b1"]);
  let sent: { code: string; ids: string[] } | null = null;
  await page.route("**/api/books/selected", (r) => r.fulfill({ json: { books: BOOKS.slice(0, 2), total: 2 } }));
  await page.route("**/api/receber/send", async (r) => {
    sent = r.request().postDataJSON();
    return r.fulfill({ json: { added: 2, total: 2, sentIds: ["b0", "b1"] } });
  });
  await page.goto("/kobo?code=k7p2");
  await expect(page.getByLabel("Código do Kobo")).toHaveValue("K7P2");
  await expect(page.getByText("Livro 0").first()).toBeVisible();
  await page.getByRole("button", { name: /Enviar 2 para o Kobo/ }).click();
  await expect(page.getByText(/2 livros enviados/)).toBeVisible();
  expect(sent).toEqual({ code: "K7P2", ids: ["b0", "b1"] });
  await expect(page.getByLabel("Já enviado")).toHaveCount(2);
});

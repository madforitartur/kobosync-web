import { expect, test } from "@playwright/test";
import { BOOKS } from "./mock";

const para = (t: string) => `<p>${t} ${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(40)}</p>`;
const CHAPTERS = [
  { id: "c1", title: "Princípio", html: para("Era uma vez um coração valente.") },
  { id: "c2", title: "Meio", html: para("A viagem continuou pela montanha.") },
  { id: "c3", title: "Fim", html: para("Tudo acabou em paz.") },
];

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/books/b0") return route.fulfill({ json: { book: BOOKS[0] } });
    if (p === "/api/books/b0/content") return route.fulfill({ json: { title: "Livro 0", chapters: CHAPTERS } });
    if (p === "/api/userdata") return route.fulfill({ json: { state: {} } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/read/b0");
  await expect(page.getByText("Era uma vez um coração valente.")).toBeVisible();
});

test("índice salta para o capítulo e mostra tempo restante", async ({ page }) => {
  await expect(page.getByText(/faltam .* · \d+%/)).toBeVisible();
  await page.keyboard.press("t");
  await page.getByRole("button", { name: /Fim/ }).click();
  await expect(page.getByText("Tudo acabou em paz.")).toBeInViewport();
});

test("marcador guardado e listado", async ({ page }) => {
  await page.keyboard.press("b");
  await page.getByLabel("Abrir painel de leitura").click();
  await page.getByRole("tab", { name: "Marcadores" }).click();
  await expect(page.getByRole("dialog").getByText("Princípio")).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem("kobosync:bookmarks"));
  expect(stored).toContain("Princípio");
});

test("destacar texto e persistir", async ({ page }) => {
  await page.evaluate(() => {
    const p = document.querySelector(".prose-book p")!;
    const r = document.createRange();
    r.setStart(p.firstChild!, 0);
    r.setEnd(p.firstChild!, 10);
    const s = window.getSelection()!;
    s.removeAllRanges();
    s.addRange(r);
  });
  await page.getByRole("toolbar", { name: "Destacar texto" }).getByLabel("Amarelo").click();
  await expect(page.locator("mark.kb-hl")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("mark.kb-hl")).toHaveCount(1);
});

test("pesquisa no livro encontra resultados sem acentos", async ({ page }) => {
  await page.keyboard.press("/");
  await page.getByLabel("Pesquisar no livro").fill("coracao");
  await expect(page.getByText(/1 resultados?/)).toBeVisible();
});

test("opções de aspeto ficam guardadas", async ({ page }) => {
  await page.getByLabel("Abrir painel de leitura").click();
  await page.getByRole("button", { name: "Sem serifa" }).click();
  await page.getByRole("button", { name: "XL", exact: true }).click();
  const s = JSON.parse((await page.evaluate(() => localStorage.getItem("kobosync:reader-settings")))!);
  expect(s.fontFamily).toBe("sans");
  expect(s.fontSize).toBe("xl");
});

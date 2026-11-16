import { expect, test, type Page } from "@playwright/test";
import { BOOKS } from "./mock";

const CH = [{ id: "c", title: "U", html: Array.from({ length: 30 }, (_, i) => `<p>Frase ${i + 1}. ${"Lorem ipsum dolor sit amet. ".repeat(12)}</p>`).join("") }];

async function open(page: Page, settings: object) {
  await page.addInitScript((s) => localStorage.setItem("kobosync:reader-settings", JSON.stringify(s)), settings);
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/books/b0") return route.fulfill({ json: { book: BOOKS[0] } });
    if (p === "/api/books/b0/content") return route.fulfill({ json: { title: "L", chapters: CH } });
    return route.fulfill({ json: { state: {} } });
  });
  await page.goto("/read/b0");
  await expect(page.getByText("Frase 1.").first()).toBeVisible();
}

test.use({ viewport: { width: 1280, height: 800 } });

test("no PC o livro não abre sozinho em ecrã completo, mesmo com a preferência guardada", async ({ page }) => {
  await open(page, { autoFullscreen: true, pageAnim: "fade" });
  await page.mouse.click(640, 400);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

test("botão de ecrã completo ao lado do menu", async ({ page }) => {
  await open(page, { pageAnim: "fade" });
  const fs = page.getByRole("button", { name: "Ecrã completo" });
  await expect(fs).toBeVisible();
  const menu = page.getByRole("button", { name: "Abrir painel de leitura" });
  const a = (await fs.boundingBox())!, b = (await menu.boundingBox())!;
  expect(a.x).toBeLessThan(b.x);
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
});

test("fundos do livro: escolher madeira/mármore/escuro/feltro", async ({ page }) => {
  await open(page, { pageAnim: "book", bookBg: "wood" });
  const bg = () => page.evaluate(() => getComputedStyle(document.querySelector(".rdr")!.parentElement!.parentElement!).backgroundImage);
  const wood = await bg();
  expect(wood).toContain("svg");
  await page.keyboard.press("a");
  for (const name of ["Mármore", "Escuro", "Feltro"]) {
    await page.getByRole("button", { name }).click();
    await expect.poll(bg).not.toBe(wood);
  }
  await page.getByRole("button", { name: "Tema" }).click();
  await expect.poll(bg).toBe("none");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("kobosync:reader-settings")!).bookBg);
  expect(saved).toBe("theme");
});

test("biblioteca: botão Instalar aplicação no PC", async ({ page }) => {
  await page.route("**/api/**", (r) => r.fulfill({ json: {} }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Instalar aplicação/ })).toBeVisible();
});

test("manifesto e ícones da PWA estão acessíveis", async ({ request }) => {
  const m = await (await request.get("/manifest.json")).json();
  expect(m.display).toBe("standalone");
  for (const i of m.icons) expect((await request.get(i.src)).ok()).toBe(true);
});

import { expect, test, type Page } from "@playwright/test";
import { BOOKS } from "./mock";

const html = Array.from({ length: 5 }, (_, c) =>
  `<h2>Capítulo ${c + 1}</h2>` + Array.from({ length: 24 }, (_, i) => `<p>Frase ${c + 1}.${i + 1}. ${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(6)}</p>`).join(""),
);
const CHAPTERS = html.map((h, i) => ({ id: `c${i}`, title: `Capítulo ${i + 1}`, html: h }));

async function open(page: Page, anim = "book") {
  await page.addInitScript((a) => localStorage.setItem("kobosync:reader-settings", JSON.stringify({ pageAnim: a, fontFamily: "lora" })), anim);
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/books/b0") return route.fulfill({ json: { book: BOOKS[0] } });
    if (p === "/api/books/b0/content") return route.fulfill({ json: { title: "L", chapters: CHAPTERS } });
    return route.fulfill({ json: { state: {} } });
  });
  await page.goto("/read/b0");
  await expect(page.getByText("Frase 1.1.").first()).toBeVisible();
}
const left = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>(".rdr")!.scrollLeft);
const width = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>(".rdr")!.clientWidth);

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("mostra duas páginas e vira por duplas com animação", async ({ page }) => {
    await open(page);
    await expect(page.locator(".rdr.kb-book")).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".kb-text")!).columnCount)).toBe("2");
    const W = await width(page);
    expect(await left(page)).toBe(0);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("[data-kb-flip='next']")).toHaveCount(1);
    await expect(page.locator("[data-kb-flip]")).toHaveCount(0, { timeout: 4000 });
    expect(await left(page)).toBe(W);
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("[data-kb-flip='prev']")).toHaveCount(1);
    await expect(page.locator("[data-kb-flip]")).toHaveCount(0, { timeout: 4000 });
    expect(await left(page)).toBe(0);
  });

  test("última dupla é alcançável e não passa do fim", async ({ page }) => {
    await open(page);
    await page.keyboard.press("End");
    const W = await width(page);
    const x = await left(page);
    expect(x).toBeGreaterThan(0);
    expect(x % W).toBe(0);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    expect(await left(page)).toBe(x);
    await expect(page.getByText("100%")).toBeVisible({ timeout: 15_000 });
  });

  test("a posição mantém-se depois de recarregar e de mudar o tamanho da janela", async ({ page }) => {
    await open(page);
    for (let i = 0; i < 3; i++) { await page.keyboard.press("ArrowRight"); await expect(page.locator("[data-kb-flip]")).toHaveCount(0, { timeout: 4000 }); }
    await page.waitForTimeout(900);
    const probe = () => page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".rdr")!;
      const r = el.getBoundingClientRect();
      const e = document.elementFromPoint(r.left + 80, r.top + 120);
      return e?.textContent?.slice(0, 14) ?? "";
    });
    const before = await probe();
    await page.reload();
    await expect(page.locator(".rdr.kb-book")).toBeVisible();
    await expect.poll(() => probe()).toBe(before);
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => { const el = document.querySelector<HTMLElement>(".rdr")!; return el.scrollLeft % el.clientWidth; })).toBe(0);
  });

  test("capítulo do índice abre na dupla certa", async ({ page }) => {
    await open(page);
    await page.keyboard.press("t");
    await page.getByRole("button", { name: /Capítulo 3/ }).click();
    await expect(page.getByText("Frase 3.1.").first()).toBeInViewport();
  });

  test("clicar na margem do livro vira a página", async ({ page }) => {
    await open(page);
    const box = (await page.locator(".rdr").boundingBox())!;
    await page.mouse.click(box.x + box.width - 30, box.y + box.height / 2);
    await expect(page.locator("[data-kb-flip]")).toHaveCount(0, { timeout: 4000 });
    expect(await left(page)).toBe(box.width);
  });
});

test.describe("telemóvel", () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  test("cai para a folha e não mostra duas páginas", async ({ page }) => {
    await open(page);
    await expect(page.locator(".rdr.kb-book")).toHaveCount(0);
  });
});

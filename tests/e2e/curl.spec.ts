import { expect, test } from "@playwright/test";
import { BOOKS } from "./mock";

const html = Array.from({ length: 60 }, (_, i) => `<p>Frase ${i + 1}. ${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(8)}</p>`).join("");

test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("kobosync:reader-settings", JSON.stringify({ pageAnim: "curl", fontFamily: "lora" })));
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/books/b0") return route.fulfill({ json: { book: BOOKS[0] } });
    if (p === "/api/books/b0/content") return route.fulfill({ json: { title: "L", chapters: [{ id: "c", title: "U", html }] } });
    return route.fulfill({ json: { state: {} } });
  });
  await page.goto("/read/b0");
  await expect(page.getByText("Frase 1.").first()).toBeVisible();
});

async function swipe(page: import("@playwright/test").Page, x0: number, x1: number) {
  const cdp = await page.context().newCDPSession(page);
  const tp = (type: "touchStart" | "touchMove" | "touchEnd", x?: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: x === undefined ? [] : [{ x, y: 700 }] });
  await tp("touchStart", x0);
  for (let i = 1; i <= 12; i++) { await tp("touchMove", x0 + ((x1 - x0) * i) / 12); await page.waitForTimeout(16); }
  await tp("touchEnd");
}
const top = (page: import("@playwright/test").Page) => page.evaluate(() => document.querySelector(".rdr")!.scrollTop);

test("arrastar a folha da direita para a esquerda avança e da esquerda para a direita recua", async ({ page }) => {
  expect(await top(page)).toBe(0);
  await swipe(page, 370, 60);
  await expect.poll(() => top(page)).toBeGreaterThan(300);
  await expect(page.locator("[aria-hidden='true'][style*='z-index: 30']")).toHaveCount(0);
  const t1 = await top(page);
  await swipe(page, 60, 340);
  await expect.poll(() => top(page)).toBeLessThan(t1 - 300);
});

test("arrasto curto cancela e fica na mesma página", async ({ page }) => {
  await swipe(page, 370, 340);
  await page.waitForTimeout(900);
  expect(await top(page)).toBe(0);
});

import { expect, test } from "@playwright/test";
import { BOOKS } from "./mock";

test("o leitor pede o bloqueio de ecrã (ecrã sempre ligado)", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __wl: { req: number; rel: number } };
    w.__wl = { req: 0, rel: 0 };
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: async () => { w.__wl.req++; return { release: async () => { w.__wl.rel++; }, addEventListener() {} }; } },
    });
  });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/books/b0") return route.fulfill({ json: { book: BOOKS[0] } });
    if (p === "/api/books/b0/content") return route.fulfill({ json: { title: "L", chapters: [{ id: "c", title: "U", html: "<p>Texto de teste.</p>" }] } });
    return route.fulfill({ json: { state: {} } });
  });
  await page.goto("/read/b0");
  await expect(page.getByText("Texto de teste.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __wl: { req: number } }).__wl.req)).toBeGreaterThan(0);
});

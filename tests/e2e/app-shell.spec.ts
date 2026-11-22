import { expect, test } from "@playwright/test";
import { mockApi } from "./mock";

test.describe("telemóvel", () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

  test("botão de fechar a app pede confirmação", async ({ page }) => {
    await page.addInitScript(() => { (window as unknown as { __closed: number }).__closed = 0; window.close = () => { (window as unknown as { __closed: number }).__closed++; }; });
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Fechar a aplicação" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __closed: number }).__closed)).toBe(0);
    await page.getByRole("button", { name: "Fechar a aplicação" }).click();
    await page.getByRole("button", { name: "Fechar aplicação" }).click();
    expect(await page.evaluate(() => (window as unknown as { __closed: number }).__closed)).toBe(1);
    await expect(page.getByRole("status").filter({ hasText: "não deixou fechar" })).toBeVisible(); // a janela não fechou
  });

  test("ao reabrir, o ecrã completo volta ao primeiro toque", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("kobosync:reader-settings", JSON.stringify({ autoFullscreen: true }));
      (window as unknown as { __fs: number }).__fs = 0;
      Element.prototype.requestFullscreen = async () => { (window as unknown as { __fs: number }).__fs++; };
    });
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Biblioteca" }).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __fs: number }).__fs)).toBe(0); // sem gesto, não entra
    await page.touchscreen.tap(200, 300);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __fs: number }).__fs)).toBe(1);
  });

  test("o tema escuro guardado aplica-se logo ao abrir", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("kobosync:dark", "true"));
    await mockApi(page);
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => m.content))).toEqual(["#0d0f10", "#0d0f10"]);
    const html = await (await page.request.get("/")).text();
    expect(html).toContain("kb-boot");
  });
});

test("manifesto da app instalada abre em ecrã completo", async ({ request }) => {
  const m = await (await request.get("/manifest.json")).json();
  expect(m.display).toBe("fullscreen");
  expect(m.display_override).toEqual(["fullscreen", "standalone"]);
});

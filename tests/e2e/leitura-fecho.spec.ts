import { expect, test } from "@playwright/test";
import { mockApi } from "./mock";

const entry = (id: string, title: string, updatedAt: number, extra: object = {}) => ({ id, title, author: null, cover_url: null, ratio: 0.3, updatedAt, finished: false, ...extra });

test.describe("lista Leitura entre aparelhos", () => {
  test("a nuvem com data mais recente não apaga leituras feitas neste aparelho", async ({ page }) => {
    await mockApi(page);
    const puts: { domain: string; data: unknown }[] = [];
    await page.route("**/api/userdata", async (r) => {
      if (r.request().method() === "PUT") { puts.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); }
      return r.fulfill({ json: { state: { readingList: { data: [entry("b1", "Livro do outro aparelho", 1500)], updatedAt: 9_000_000_000_000 } } } });
    });
    await page.addInitScript(() => {
      if (localStorage.getItem("seeded")) return;
      localStorage.setItem("seeded", "1");
      localStorage.setItem("kobosync:reading-list", JSON.stringify([{ id: "b0", title: "Livro deste aparelho", author: null, cover_url: null, ratio: 0.2, updatedAt: 2000, finished: false }]));
      localStorage.setItem("kobosync:ts:readingList", "1000"); // relógio "atrasado" em relação à nuvem
    });
    await page.goto("/");
    await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem("kobosync:reading-list") ?? "[]"))).map((e: { id: string }) => e.id).sort()).toEqual(["b0", "b1"]);
    await expect.poll(() => puts.filter((p) => p.domain === "readingList").length).toBeGreaterThan(0); // devolve à nuvem o que ela não tinha
  });

  test("remover da lista propaga-se e não volta com a fusão", async ({ page }) => {
    await mockApi(page);
    await page.route("**/api/userdata", (r) => r.request().method() === "PUT"
      ? r.fulfill({ json: { ok: true } })
      : r.fulfill({ json: { state: { readingList: { data: [entry("b0", "Livro 0", 1000)], updatedAt: 1000 } } } }));
    await page.addInitScript(() => {
      if (localStorage.getItem("seeded")) return;
      localStorage.setItem("seeded", "1");
      localStorage.setItem("kobosync:reading-list", JSON.stringify([{ id: "b0", title: "Livro 0", author: null, cover_url: null, ratio: 0.3, updatedAt: 5000, finished: false, removed: true }]));
      localStorage.setItem("kobosync:ts:readingList", "5000");
    });
    await page.goto("/?v=reading");
    await page.waitForTimeout(800);
    const list = await page.evaluate(() => JSON.parse(localStorage.getItem("kobosync:reading-list") ?? "[]"));
    expect(list).toHaveLength(1);
    expect(list[0].removed).toBe(true); // a versão antiga da nuvem (sem "removed") não ressuscita a entrada
  });
});

test.describe("aviso de fecho", () => {
  test.use({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });

  test("aparece centrado no ecrã", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Fechar a aplicação" }).click();
    const box = await page.getByRole("alertdialog").boundingBox();
    expect(box).not.toBeNull();
    const cx = box!.x + box!.width / 2, cy = box!.y + box!.height / 2;
    expect(Math.abs(cx - 390 / 2)).toBeLessThan(20);
    expect(Math.abs(cy - 780 / 2)).toBeLessThan(60);
  });
});

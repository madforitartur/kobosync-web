import { expect, test } from "@playwright/test";
import { BOOKS } from "./mock";

// Cada frase numerada ocupa o seu parágrafo/linhas: permite verificar saltos e repetições.
const html = Array.from({ length: 160 }, (_, i) => `<p>Frase número ${i + 1}. ${"palavra ".repeat(12)}</p>`).join("");

async function setup(page: import("@playwright/test").Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/books/b0") return route.fulfill({ json: { book: BOOKS[0] } });
    if (p === "/api/books/b0/content") return route.fulfill({ json: { title: "Livro 0", chapters: [{ id: "c1", title: "Único", html }] } });
    if (p === "/api/userdata") return route.fulfill({ json: { state: {} } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/read/b0");
  await expect(page.getByText("Frase número 1.", { exact: false }).first()).toBeVisible();
}

// Primeiro e último parágrafo totalmente visíveis (coordenadas relativas ao contentor de scroll)
const visibleNums = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll(".prose-book p")) as HTMLElement[];
    const sc = ps[0].closest("[class*='overflow']") as HTMLElement | null;
    const box = (sc ?? document.documentElement).getBoundingClientRect();
    return ps
      .filter((p) => { const r = p.getBoundingClientRect(); return r.top >= box.top - 1 && r.bottom <= box.bottom + 1; })
      .map((p) => Number(/número (\d+)/.exec(p.textContent ?? "")![1]));
  });

test("virar página não salta nem repete parágrafos", async ({ page }) => {
  await setup(page, 1000, 700);
  let prevLast = (await visibleNums(page)).at(-1)!;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(700);
    const nums = await visibleNums(page);
    expect(nums.length).toBeGreaterThan(0);
    // o último da página anterior deve ser seguido pelo primeiro desta (continuidade, sem saltos)
    expect(nums[0]).toBeLessThanOrEqual(prevLast + 1);
    expect(nums[0]).toBeGreaterThan(prevLast - 3);
    prevLast = nums.at(-1)!;
  }
  // recuar volta atrás sem perder linhas
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(700);
  const back = await visibleNums(page);
  expect(back.at(-1)!).toBeLessThanOrEqual(prevLast);
});

test("a posição guardada abre no mesmo texto noutra resolução", async ({ page }) => {
  await setup(page, 1000, 700);
  for (let i = 0; i < 5; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(600); }
  const first = (await visibleNums(page))[0];
  await page.waitForTimeout(900); // deixa gravar
  const pos = await page.evaluate(() => JSON.parse(localStorage.getItem("kobosync:reading:b0")!));
  expect(typeof pos.offset).toBe("number");

  await page.setViewportSize({ width: 420, height: 800 });
  await page.reload();
  await page.waitForTimeout(1800);
  const after = await visibleNums(page);
  // o texto guardado está no topo ou logo a seguir
  expect(Math.abs(after[0] - first)).toBeLessThanOrEqual(2);
});

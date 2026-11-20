import { expect, test } from "@playwright/test";
import { mockApi } from "./mock";

test("vista Estante: livros em prateleiras, seleção continua a funcionar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Ver em estante" }).click();
  await expect(page.getByTestId("shelf")).toBeVisible();
  expect(await page.locator(".kb-plank").count()).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: "test-results/estante.png" });
  await page.getByRole("button", { name: "Opções de Livro 0", exact: true }).click();
  await expect(page.getByRole("button", { name: "Adicionar à seleção" })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("shelf")).toBeVisible(); // a escolha fica guardada
  await page.getByRole("button", { name: "Ver em grelha" }).click();
  await expect(page.getByTestId("shelf")).toHaveCount(0);
});

test("estante no telemóvel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Ver em estante" }).click();
  await expect(page.getByTestId("shelf")).toBeVisible();
  await page.screenshot({ path: "test-results/estante-mobile.png" });
});

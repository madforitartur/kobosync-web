import { expect, test } from "@playwright/test";
import { mockApi } from "./mock";

test.describe("PC", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("clicar na capa abre o menu e seleciona; painel de seleção aparece", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Opções de Livro 0", exact: true })).toBeVisible();
    await expect(page.getByLabel("Ações do livro")).toHaveCount(0);

    await page.getByRole("button", { name: "Opções de Livro 0", exact: true }).click();
    await page.getByRole("button", { name: "Adicionar à seleção" }).click();
    await expect(page.getByRole("complementary", { name: "Seleção" })).toContainText("1 livro");
  });

  test("shift+clique seleciona um intervalo", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Opções de Livro 1", exact: true }).click({ modifiers: ["Control"] });
    await page.getByRole("button", { name: "Opções de Livro 4", exact: true }).click({ modifiers: ["Shift"] });
    await expect(page.getByRole("complementary", { name: "Seleção" })).toContainText("4 livros");
  });

  test("filtro por autor e pesquisa", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Filtros" }).click();
    await page.getByPlaceholder("Escreve para procurar…").first().fill("Ana Silva");
    await page.getByRole("button", { name: "Ver resultados" }).click();
    await expect(page.getByText("Autor: Ana Silva")).toBeVisible();
    await expect(page.getByRole("button", { name: "Opções de Livro 0", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Opções de Livro 1", exact: true })).toBeVisible();
  });

  test("navegação: séries e autores", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("complementary", { name: "Navegação principal" }).getByRole("button", { name: /Séries/ }).click();
    await page.getByRole("button", { name: /Saga/ }).click();
    await expect(page.getByText("Série: Saga")).toBeVisible();
  });
});

test.describe("Telemóvel", () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });

  test("hambúrguer, menu inferior com 5 itens e seleção visível", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await expect(page.getByLabel("Abrir menu")).toBeVisible();
    await expect(page.locator("nav button")).toHaveCount(5);

    await page.getByRole("button", { name: "Opções de Livro 0", exact: true }).click();
    await page.getByRole("button", { name: "Adicionar à seleção" }).click();
    await expect(page.locator(".grayscale")).toHaveCount(1);
  });

  test("modo selecionar e coleção", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Modo de seleção" }).click();
    await page.getByRole("button", { name: "Selecionar Livro 2", exact: true }).click();
    await page.getByRole("button", { name: "Selecionar Livro 3", exact: true }).click();
    await expect(page.getByRole("toolbar", { name: "Ações da seleção" })).toContainText("2 selecionados");
    await page.getByRole("button", { name: "Coleção" }).click();
    await page.getByPlaceholder("Nova coleção…").fill("Favoritos");
    await page.getByRole("button", { name: "Criar" }).click();
    await expect(page.getByRole("button", { name: "Favoritos" })).toBeVisible();
  });
});

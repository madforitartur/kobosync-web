import { expect, test } from "@playwright/test";
import { BOOKS, mockApi } from "./mock";

const html = Array.from({ length: 40 }, (_, i) => `<p>Frase ${i + 1}. ${"texto ".repeat(30)}</p>`).join("");

async function openReader(page: import("@playwright/test").Page) {
  await page.route("**/api/books/b0", (r) => r.fulfill({ json: { book: BOOKS[0] } }));
  await page.route("**/api/books/b0/content", (r) => r.fulfill({ json: { title: "L", chapters: [{ id: "c", title: "U", html }] } }));
  await page.route("**/api/**", (r) => (/\/api\/books\/b0/.test(r.request().url()) ? r.fallback() : r.fulfill({ json: { state: {}, user: null } })));
  await page.goto("/read/b0");
  await expect(page.getByText("Frase 1.").first()).toBeVisible();
}

test.describe("menu do leitor", () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true });

  test("cabeçalho Menu + fechar, tipos de letra colapsáveis e guardar na estante", async ({ page }) => {
    await openReader(page);
    await page.touchscreen.tap(195, 400); // centro do ecrã abre o painel
    const dialog = page.getByRole("dialog", { name: "Opções de leitura" });
    await expect(dialog.getByText("Menu", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Fechar menu" })).toBeVisible();

    // lista de letras fechada por defeito; abre e escolhe outra
    await expect(dialog.getByRole("button", { name: "Spectral" })).toHaveCount(0);
    await dialog.locator('[aria-controls="font-list"]').click();
    await dialog.getByRole("button", { name: "Spectral" }).click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("kobosync:reader-settings") ?? "{}").fontFamily)).toBe("spectral");
    expect(await page.evaluate(() => document.fonts.check("16px 'Spectral'"))).toBeTruthy();

    // guardar na estante: grava a posição e volta à biblioteca
    await dialog.getByRole("button", { name: "Guardar livro na estante" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  });
});

test.describe("perfil sem privilégios de administrador", () => {
  test("não vê Sincronizar livros/capas; o administrador vê", async ({ page }) => {
    await mockApi(page);
    await page.route("**/api/auth/status", (r) => r.fulfill({ json: { protected: true, user: { id: "u1", name: "Ana", role: "user" } } }));
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Opções de Livro 0", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Definições/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Sincronizar (livros|capas)/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Registo de atividade/ })).toHaveCount(0);

    await page.unroute("**/api/auth/status");
    await page.route("**/api/auth/status", (r) => r.fulfill({ json: { protected: true, user: { id: "admin", name: "Artur", role: "admin" } } }));
    await page.reload();
    await expect(page.getByRole("button", { name: /Sincronizar livros/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Registo de atividade/ })).toBeVisible();
  });
});

test("registo de atividade: resumo por utilizador e registo filtrável", async ({ page }) => {
  const now = Date.now();
  await page.route("**/api/activity/summary", (r) => r.fulfill({ json: { summary: [
    { id: "admin", name: "Artur", role: "admin", lastLogin: now, lastActivity: now, logins: 3, failedLogins: 0, reads: 2, downloads: 1, searches: 4, reading: [{ bookId: "b0", title: "Dom Casmurro", progress: 42, lastRead: now }] },
    { id: "u1", name: "Ana", role: "user", lastLogin: now - 3600_000, lastActivity: now - 1000, logins: 1, failedLogins: 2, reads: 1, downloads: 0, searches: 0, reading: [] },
  ] } }));
  await page.route("**/api/activity?**", (r) => r.fulfill({ json: { events: [
    { uid: "admin", name: "Artur", type: "login", ts: now, device: "Mac · Chrome" },
    { uid: "u1", name: "Ana", type: "search", ts: now - 500, detail: "pessoa", device: "biblioteca · iPhone" },
    { uid: "u1", name: "Ana", type: "read", ts: now - 900, title: "Os Maias", bookId: "b3" },
  ] } }));
  await page.goto("/definicoes/atividade");
  await expect(page.getByText("Dom Casmurro")).toBeVisible();
  await expect(page.getByText("2 falhados")).toBeVisible();
  await page.getByRole("tab", { name: "Registo completo" }).click();
  await expect(page.getByText("3 eventos")).toBeVisible();
  await page.getByLabel("Utilizador").selectOption("u1");
  await expect(page.getByText("2 eventos")).toBeVisible();
  await page.getByLabel("Tipo de evento").selectOption("search");
  await expect(page.getByText("“pessoa”")).toBeVisible();
  await expect(page.getByText("Os Maias")).toHaveCount(0);
});

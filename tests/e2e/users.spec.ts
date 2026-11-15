import { expect, test } from "@playwright/test";
import { ADMIN_ID, createSessionToken, verifySessionToken } from "../../src/lib/auth";
import { hashPin, validPin, verifyPin } from "../../src/lib/firebase/users";
import { mockApi } from "./mock";

test.describe("segurança (servidor)", () => {
  test.beforeAll(() => { process.env.APP_PIN = "1234"; process.env.AUTH_SECRET = "segredo-de-teste"; });

  test("a sessão assinada guarda o utilizador e rejeita adulterações", async () => {
    const t = await createSessionToken("abc123");
    expect(await verifySessionToken(t)).toBe("abc123");
    expect(await verifySessionToken(t.replace("abc123", ADMIN_ID))).toBeNull(); // trocar o uid invalida a assinatura
    expect(await verifySessionToken(t.slice(0, -2) + "00")).toBeNull();
    expect(await verifySessionToken("lixo")).toBeNull();
    expect(await verifySessionToken(undefined)).toBeNull();
    const expired = `abc123.${Math.floor(Date.now() / 1000) - 10}.x`;
    expect(await verifySessionToken(expired)).toBeNull();
  });

  test("o PIN é guardado só como hash e validado", () => {
    const h = hashPin("4821");
    expect(h).not.toContain("4821");
    expect(verifyPin("4821", h)).toBe(true);
    expect(verifyPin("4822", h)).toBe(false);
    expect(verifyPin("4821", undefined)).toBe(false);
    expect(validPin("4821")).toBe(true);
    expect(validPin("12")).toBe(false);
    expect(validPin("abcd")).toBe(false);
  });
});

test("ecrã de entrada: escolhe o perfil e entra com o PIN dele", async ({ page }) => {
  let body: { uid: string; pin: string } | null = null;
  await page.route("**/api/auth/profiles", (r) => r.fulfill({ json: { protected: true, profiles: [{ id: "admin", name: "Artur", role: "admin" }, { id: "u1", name: "Ana", role: "user" }] } }));
  await page.route("**/api/auth/login", (r) => { body = r.request().postDataJSON(); return r.fulfill({ json: { ok: true, user: { id: "u1", name: "Ana", role: "user" } } }); });
  await page.route("**/api/**", (r) => (r.request().url().includes("/api/auth/") ? r.fallback() : r.fulfill({ json: { state: {}, books: [], total: 0 } })));
  await page.goto("/login");
  await page.getByRole("button", { name: /Ana/ }).click();
  await page.getByLabel("PIN").fill("4821");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect.poll(() => body).toEqual({ uid: "u1", pin: "4821" });
  await page.waitForURL((u) => u.pathname === "/");
  await page.waitForLoadState("domcontentloaded");
  expect(await page.evaluate(() => localStorage.getItem("kobosync:current-user"))).toBe("u1");
});

test("mudar de utilizador limpa os dados pessoais deste aparelho", async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => {
    if (localStorage.getItem("seeded")) return;
    localStorage.setItem("seeded", "1");
    localStorage.setItem("kobosync:current-user", "admin");
    localStorage.setItem("kobosync:selection", JSON.stringify(["b1"]));
    localStorage.setItem("kobosync:reading:b1", JSON.stringify({ scrollTop: 10, ratio: 0.1, timestamp: 1 }));
  });
  await page.route("**/api/auth/profiles", (r) => r.fulfill({ json: { protected: true, profiles: [{ id: "u1", name: "Ana", role: "user" }] } }));
  await page.route("**/api/auth/login", (r) => r.fulfill({ json: { ok: true, user: { id: "u1", name: "Ana", role: "user" } } }));
  await page.goto("/login");
  await page.getByLabel("PIN").fill("4821");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.waitForLoadState("domcontentloaded");
  expect(await page.evaluate(() => localStorage.getItem("kobosync:current-user"))).toBe("u1");
  expect(await page.evaluate(() => localStorage.getItem("kobosync:selection"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("kobosync:reading:b1"))).toBeNull();
});

test("definições: o administrador cria e apaga utilizadores", async ({ page }) => {
  let users = [{ id: "admin", name: "Artur", role: "admin" }];
  await page.route("**/api/auth/status", (r) => r.fulfill({ json: { protected: true, user: users[0] } }));
  await page.route("**/api/users", async (r) => {
    if (r.request().method() === "POST") {
      const b = r.request().postDataJSON();
      users = [...users, { id: "u" + users.length, name: b.name, role: "user" }];
      return r.fulfill({ json: { user: users.at(-1) } });
    }
    return r.fulfill({ json: { users } });
  });
  await page.route("**/api/users/u1", (r) => { users = users.filter((u) => u.id !== "u1"); return r.fulfill({ json: { ok: true } }); });
  await page.goto("/definicoes");
  await page.getByLabel("Nome do novo utilizador").fill("Ana");
  await page.getByLabel("PIN do novo utilizador").fill("4821");
  await page.getByRole("button", { name: /Criar utilizador/ }).click();
  await expect(page.getByText("Utilizador criado.")).toBeVisible();
  await expect(page.getByText("Ana", { exact: true })).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Apagar Ana" }).click();
  await expect(page.getByText("Ana", { exact: true })).toHaveCount(0);
});

import { expect, test } from "@playwright/test";
import { parseFolderIds } from "../../src/lib/google-drive";

test("parseFolderIds aceita IDs, links e listas sem repetir", () => {
  const link = "https://drive.google.com/drive/folders/1EeDs8G-5nPLLmznJJ9Tlz0mTdK2PGMTn?usp=sharing";
  expect(parseFolderIds(`${link}, 1AbCdEfGhIjKlMnOp\n1AbCdEfGhIjKlMnOp`)).toEqual(["1EeDs8G-5nPLLmznJJ9Tlz0mTdK2PGMTn", "1AbCdEfGhIjKlMnOp"]);
  expect(parseFolderIds("")).toEqual([]);
  expect(parseFolderIds("curto")).toEqual([]);
  expect(parseFolderIds(null)).toEqual([]);
});

test("definições: o administrador adiciona e remove uma pasta do Drive", async ({ page }) => {
  let folders: { id: string; name: string }[] = [];
  await page.route("**/api/auth/status", (r) => r.fulfill({ json: { protected: true, user: { id: "admin", name: "Artur", role: "admin" } } }));
  await page.route("**/api/users", (r) => r.fulfill({ json: { users: [{ id: "admin", name: "Artur", role: "admin" }] } }));
  await page.route("**/api/drive-folders**", async (r) => {
    const m = r.request().method();
    if (m === "POST") {
      folders = [{ id: "1EeDs8G-5nPLLmznJJ9Tlz0mTdK2PGMTn", name: "Livros do Zé" }];
      return r.fulfill({ json: { folders, added: folders[0] } });
    }
    if (m === "DELETE") { folders = []; return r.fulfill({ json: { folders } }); }
    return r.fulfill({ json: { folders, envFolders: ["1PrincipalFolderIdxxxxx"], serviceEmail: "drive@proj.iam.gserviceaccount.com" } });
  });
  await page.goto("/definicoes");
  await expect(page.getByText("drive@proj.iam.gserviceaccount.com")).toBeVisible();
  await expect(page.getByText("Pasta principal")).toBeVisible();
  await page.getByLabel("Link da pasta do Drive").fill("https://drive.google.com/drive/folders/1EeDs8G-5nPLLmznJJ9Tlz0mTdK2PGMTn");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByText(/Pasta "Livros do Zé" adicionada/)).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remover Livros do Zé" }).click();
  await expect(page.getByRole("link", { name: "Livros do Zé" })).toHaveCount(0);
});

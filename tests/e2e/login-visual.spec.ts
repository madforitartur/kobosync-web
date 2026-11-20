import { expect, test } from "@playwright/test";

const profiles = [{ id: "admin", name: "Artur", role: "admin" }, { id: "u1", name: "Ana", role: "user" }, { id: "u2", name: "Rui", role: "user" }];

for (const [name, vp] of [["pc", { width: 1440, height: 900 }], ["telemovel", { width: 390, height: 800 }]] as const) {
  test(`login com visual de biblioteca (${name})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.route("**/api/auth/profiles", (r) => r.fulfill({ json: { protected: true, profiles } }));
    await page.goto("/login");
    await expect(page.getByText("Quem vai ler?")).toBeVisible();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `test-results/login-${name}-perfis.png` });
    await page.getByRole("button", { name: /Ana/ }).click();
    await expect(page.getByLabel("PIN")).toBeVisible();
    await page.getByLabel("PIN").fill("1234");
    await page.screenshot({ path: `test-results/login-${name}-pin.png` });
    // sem scroll horizontal
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

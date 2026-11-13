import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3111", serviceWorkers: "block" },
  webServer: {
    command: "npx next dev -p 3111",
    url: "http://localhost:3111/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

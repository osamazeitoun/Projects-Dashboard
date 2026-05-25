import { defineConfig } from "@playwright/test";

const FRONTEND_URL =
  process.env.E2E_FRONTEND_URL ?? "http://localhost:25028";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: FRONTEND_URL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});

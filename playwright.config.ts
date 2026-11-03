import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // モバイルファースト: Pixel 7 相当のビューポート + タッチ
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // AI バインディングなしの test 環境でビルド → ローカル D1 にマイグレーション → workerd で配信
    command: "npm run build && npm run db:migrate:local && npm run preview",
    url: `http://localhost:${PORT}/api/me`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { CLOUDFLARE_ENV: "test", WRANGLER_SEND_METRICS: "false" },
  },
});

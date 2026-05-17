const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 7"] }
    }
  ],
  webServer: {
    command: "node scripts/static-server.mjs 4173",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: !process.env.CI
  }
});

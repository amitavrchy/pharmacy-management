import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3217",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run start -w backend",
      url: "http://127.0.0.1:4217/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run start -w frontend",
      url: "http://localhost:3217/login",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});

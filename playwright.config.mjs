import { defineConfig, devices } from "@playwright/test";

const localBrowser = process.env.CI ? {} : { channel: "chrome" };

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...localBrowser,
        viewport: { width: 1440, height: 900 }
      },
      testMatch: /web\.spec\.mjs/
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"], ...localBrowser, viewport: { width: 390, height: 844 } },
      testMatch: /web\.spec\.mjs/
    },
    {
      name: "electron",
      testMatch: /desktop\.spec\.mjs/
    }
  ],
  webServer: {
    command: "npm run build:web && npm exec vite preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});

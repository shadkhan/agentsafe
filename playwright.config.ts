import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    trace: "on-first-retry"
  },
  projects: [
    // The store capture is excluded here so an ordinary test run never rewrites
    // published assets as a side effect.
    { name: "e2e", testIgnore: /store-screenshot\.spec\.ts/ },
    { name: "capture", testMatch: /store-screenshot\.spec\.ts/, timeout: 120_000 }
  ]
});

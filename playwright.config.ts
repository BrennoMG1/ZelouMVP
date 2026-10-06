import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3100", headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", trace: "retain-on-failure" },
  webServer: { command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 120000 },
});

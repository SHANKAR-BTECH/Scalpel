import { defineConfig } from "@playwright/test";

// Serves the static export (out/) and drives it in Chromium.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:4173", trace: "off" },
  webServer: { command: "node e2e/serve.mjs", port: 4173, reuseExistingServer: true },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});

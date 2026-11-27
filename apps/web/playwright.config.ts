import { defineConfig } from "@playwright/test";

// Runs the built app (pnpm build first) on one server with the in-memory store, so tests share one desk.
export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  workers: 1,
  use: { baseURL: "http://localhost:4173", trace: "off" },
  webServer: { command: "npx next start -p 4173", port: 4173, reuseExistingServer: true },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});

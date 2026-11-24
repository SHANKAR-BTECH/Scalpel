import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { environment: "jsdom", include: ["lib/**/*.test.ts", "components/**/*.test.tsx", "app/**/*.test.tsx", "test/**/*.test.ts"] },
});

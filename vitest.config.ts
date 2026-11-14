import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts: the sim tests need no React plugin.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});

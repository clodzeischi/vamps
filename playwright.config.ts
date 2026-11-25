import { defineConfig } from "@playwright/test";
import { PORT, SITE } from "./e2e/paths";

// Journeys through the built game in Chromium (docs/design/tooling.md).
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "reports/e2e",
  fullyParallel: true,
  workers: 4,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: "line",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium", launchOptions: { args: process.platform === "darwin" && !process.env.E2E_SOFTWARE ? ["--use-angle=metal"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } } },
    // Safari's engine: everything but the long battles and the monkey.
    { name: "webkit", use: { browserName: "webkit" }, testMatch: /(menu|geoscape|events|inventory)\.spec/ },
  ],
  webServer: {
    // The production build, plus the test handles on window (src/ui/handles.ts).
    command: `npx vite build --mode e2e --outDir ${SITE} --emptyOutDir --logLevel warn && npx vite preview --outDir ${SITE} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

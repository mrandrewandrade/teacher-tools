import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: "node test/serve.mjs",
    url: "http://127.0.0.1:4173/teacher-tools/",
    reuseExistingServer: true,
    timeout: 20_000,
  },
});


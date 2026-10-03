import { defineConfig } from "vitest/config";

/** Unit tests for the extension's pure modules and DOM helpers (happy-dom); the e2e lives in e2e/. */
export default defineConfig({
  test: { name: "extension", globals: false, environment: "happy-dom", include: ["src/**/*.test.ts"] },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: [
      "**/*.skiptest.ts",
      "**/*.local.test.ts",
      "**/flow.e2e.test.ts",
      "**/twoPhase.test.ts",
      "**/print.endpoint.test.ts",
      "**/print-control.test.ts",
      "**/generate.integration.test.ts",
      "**/generate.zip.test.ts",
      "**/generate.lazy.zip.test.ts",
    ],
    setupFiles: ["./src/test/globalSetup.ts"],
    testTimeout: 20000,
    hookTimeout: 15000,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});

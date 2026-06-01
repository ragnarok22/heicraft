import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text", "lcov", "json-summary"],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 75,
        lines: 60,
      },
    },
  },
});

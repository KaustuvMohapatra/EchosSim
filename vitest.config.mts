import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "apps/*/tests/**/*.test.{ts,tsx}",
    ],
    environment: "node",
    globals: true,
    // Simulation packages are TS source consumed directly; no build step.
  },
  esbuild: { jsx: "automatic" },
});

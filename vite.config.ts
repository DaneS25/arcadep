import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
    // Task 1 is only the scaffold; real tests arrive with the first logic in task 2.
    passWithNoTests: true,
  },
});

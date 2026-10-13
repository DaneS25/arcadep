import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // three.js in its own chunk, so a change to the site's code doesn't make a returning
        // visitor download the engine again.
        codeSplitting: {
          groups: [{ name: "three", test: /[\\/]node_modules[\\/]three[\\/]/ }],
        },
      },
    },
    // The three chunk alone is about 0.6 MB minified (about 0.15 MB gzipped), which the
    // spec's 15 MB first-load target easily allows; the app chunk sits far below this.
    // See decisions.md, task 15.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
  },
});

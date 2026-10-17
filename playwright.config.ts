import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: true,
  retries: 0,
  // One worker, as when the smoke was one file (task 39): the headless WebGL scene runs at a few
  // fps, and parallel pages starve each other into timeouts.
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite preview --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: false,
  },
});

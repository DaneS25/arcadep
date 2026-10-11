import { expect, test } from "@playwright/test";

test("the built site loads without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.locator("#app")).toBeAttached();
  // With an empty assets folder everything falls back and the loading screen still goes away.
  await expect(page.locator("#loading-screen")).toBeHidden();
  expect(errors).toEqual([]);
});

import { expect, test } from "@playwright/test";
import { profile } from "../src/content/profile";

/** Smoke: the front's arcade cabinet. */

test.describe("front: arcade cabinet", () => {
  test.use({ reducedMotion: "reduce" });

  test("opens the CRT about pages by keyboard, pages forward and closes with Escape", async ({
    page,
  }) => {
    // Runs close to the 30 s default on a busy machine (it timed out once in task 21).
    test.slow();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const [first, second] = profile.aboutPages;
    if (first === undefined || second === undefined)
      throw new Error("the site profile needs two about pages");

    await page.keyboard.press("Tab");
    await expect(canvas).toHaveAttribute("data-app-side", "front");
    await expect(canvas).toHaveAttribute("data-camera-side", "front");
    await page.screenshot({ path: "test-results/front-cabinet.png" });

    await page.keyboard.press("Enter");
    await expect(canvas).toHaveAttribute("data-camera-view", "closeUp");
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-side", "front");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      first.heading,
    );
    await expect(panel.getByText(first.body)).toBeVisible();
    await page.screenshot({ path: "test-results/front-crt-panel.png" });

    await page.keyboard.press("ArrowRight");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      second.heading,
    );
    // Arrow keys page the panel; the scene stays on the front.
    await expect(canvas).toHaveAttribute("data-app-state", "panel");
    await panel.getByRole("button", { name: "Previous" }).click();
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      first.heading,
    );
    await panel.getByRole("button", { name: "Next" }).focus();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      second.heading,
    );

    // The camera's view of the screen, with the panel hidden just for this screenshot.
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.id = "hide-panel";
      style.textContent = "dialog.panel { visibility: hidden; }";
      document.head.append(style);
    });
    await page.screenshot({ path: "test-results/front-cabinet-screen.png" });
    await page.evaluate(() => {
      document.getElementById("hide-panel")?.remove();
    });
    // Hiding the panel dropped the focus; put it back on the panel's close button.
    await panel.getByRole("button", { name: "Close" }).focus();

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(canvas).toHaveAttribute("data-app-state", "focused");
    await expect(canvas).toHaveAttribute("data-camera-view", "side");
    await expect(canvas).toHaveAttribute("data-camera-side", "front");
    await expect(canvas).toBeFocused();
  });
});

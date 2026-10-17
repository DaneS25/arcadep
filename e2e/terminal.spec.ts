import { expect, test } from "@playwright/test";
import { contact } from "../src/content/contact";
import { profile } from "../src/content/profile";
import { REM } from "./helpers";

/** Smoke: the right side's door terminal. */

test.describe("right: door terminal", () => {
  test.use({ reducedMotion: "reduce" });

  test("jacks in by keyboard, runs typed and clicked commands, and exit returns to the street", async ({
    page,
  }) => {
    // Since the camera moves in to the terminal (task 32), the wall fills the view behind
    // the panel and headless (software) WebGL draws it slower: about 29 s, as the cabinet's.
    test.slow();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");

    // Tab order: front, right.
    for (let i = 0; i < 2; i += 1) await page.keyboard.press("Tab");
    await expect(canvas).toHaveAttribute("data-app-side", "right");
    await expect(canvas).toHaveAttribute("data-camera-side", "right");
    await page.screenshot({ path: "test-results/right-terminal.png" });

    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog");
    await expect(panel).toHaveAttribute("data-side", "right");
    const input = panel.getByRole("textbox", { name: "Command" });
    await expect(input).toBeFocused();
    // The camera cuts in to the terminal under reduced motion (task 32).
    await expect(canvas).toHaveAttribute("data-camera-view", "closeUp");
    // Centred, not full screen (task 18): the full panel height, so the log has room.
    const box = await panel.boundingBox();
    expect(box?.width).toBeLessThan(1280);
    expect(box?.height).toBeLessThan(800);
    expect(Math.abs((box?.height ?? 0) - 32 * REM)).toBeLessThan(2);

    const log = panel.getByRole("log");
    await input.fill("email");
    await page.keyboard.press("Enter");
    if (contact.email !== null)
      await expect(
        log.getByRole("link", { name: contact.email }),
      ).toHaveAttribute("href", `mailto:${contact.email}`);

    await panel.getByRole("button", { name: "github" }).click();
    if (contact.github !== null) {
      const link = log.getByRole("link", { name: /opens in a new tab/ }).last();
      await expect(link).toHaveAttribute("href", contact.github);
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    await input.fill("whoami");
    await page.keyboard.press("Enter");
    await expect(log).toContainText(profile.name);
    await page.screenshot({ path: "test-results/right-terminal-panel.png" });

    await input.fill("exit");
    await page.keyboard.press("Enter");
    await expect(panel).toBeHidden();
    await expect(canvas).toHaveAttribute("data-app-state", "focused");
    await expect(canvas).toHaveAttribute("data-app-side", "right");
    await expect(canvas).toHaveAttribute("data-camera-view", "side");
    await expect(canvas).toBeFocused();
  });
});

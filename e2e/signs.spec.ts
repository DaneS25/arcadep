import { expect, test } from "@playwright/test";
import { skills } from "../src/content/skills";

/** Smoke: the left side's neon skill signs. */

test.describe("left: neon skill signs", () => {
  test.use({ reducedMotion: "reduce" });

  test("opens the Skills panel by keyboard, reaches a skill's details and closes with Escape", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const [first, second] = skills;
    if (first === undefined || second === undefined)
      throw new Error("the site content needs two skills");

    await page.keyboard.press("ArrowLeft");
    await expect(canvas).toHaveAttribute("data-app-side", "left");
    await expect(canvas).toHaveAttribute("data-camera-side", "left");
    await page.screenshot({ path: "test-results/left-signs.png" });

    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-side", "left");
    // The camera moves in close so the signs read larger (a cut under reduced motion).
    await expect(canvas).toHaveAttribute("data-camera-view", "closeUp");
    await expect(canvas).toHaveAttribute("data-camera-side", "left");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      first.name,
    );
    await expect(panel.getByRole("button", { name: "Close" })).toBeFocused();

    // Tab reaches the first skill; the arrow keys move to the next one.
    await page.keyboard.press("Tab");
    await expect(
      panel.locator(`button[data-skill="${first.id}"]`),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      second.name,
    );
    await expect(panel.getByText(second.note)).toBeVisible();
    await expect(
      panel.locator(`button[data-skill="${second.id}"]`),
    ).toBeFocused();
    // Arrow keys move through the list; the scene stays on the left.
    await expect(canvas).toHaveAttribute("data-app-state", "panel");
    await expect(canvas).toHaveAttribute("data-app-side", "left");
    await page.screenshot({ path: "test-results/left-skills-panel.png" });

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(canvas).toHaveAttribute("data-app-state", "focused");
    await expect(canvas).toHaveAttribute("data-camera-side", "left");
    await expect(canvas).toHaveAttribute("data-camera-view", "side");
    await expect(canvas).toBeFocused();
  });
  test("Up, Down, Home and End move through the skills from the close button without moving the camera", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const [first, second] = skills;
    const last = skills.at(-1);
    if (first === undefined || second === undefined || last === undefined)
      throw new Error("the site content needs two skills");
    // By id: skill names may share a prefix or hold regex characters.
    const item = (id: string) => panel.locator(`button[data-skill="${id}"]`);

    await page.keyboard.press("ArrowLeft");
    await expect(canvas).toHaveAttribute("data-camera-side", "left");
    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog");
    await expect(panel).toHaveAttribute("data-side", "left");
    const close = panel.getByRole("button", { name: "Close" });
    await expect(close).toBeFocused();

    // From the close button, not a skill: Down chooses the next skill and focuses it.
    await page.keyboard.press("ArrowDown");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      second.name,
    );
    await expect(item(second.id)).toBeFocused();

    await close.focus();
    await page.keyboard.press("End");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      last.name,
    );
    await expect(item(last.id)).toBeFocused();
    await expect(item(last.id)).toBeInViewport();

    await close.focus();
    await page.keyboard.press("Home");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      first.name,
    );
    await expect(item(first.id)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      first.name,
    );
    // Tab order is unchanged: the next skill follows.
    await page.keyboard.press("Tab");
    await expect(item(second.id)).toBeFocused();

    // The arrow keys stayed in the panel: the scene is still on the left close-up.
    await expect(canvas).toHaveAttribute("data-app-state", "panel");
    await expect(canvas).toHaveAttribute("data-app-side", "left");
    await expect(canvas).toHaveAttribute("data-camera-side", "left");
    await expect(canvas).toHaveAttribute("data-camera-view", "closeUp");

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(canvas).toHaveAttribute("data-app-state", "focused");
    await expect(canvas).toBeFocused();
  });
});

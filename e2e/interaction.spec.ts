import { expect, test } from "@playwright/test";
import { expectCentredAndFitting, type Box } from "./helpers";

/** Smoke: picking, opening and closing the sides. */

test.describe("interaction", () => {
  test.use({ reducedMotion: "reduce" });

  test("Tab picks each side, Enter opens it and Escape closes it", async ({
    page,
  }) => {
    // Four sides, four panels and five screenshots with the user's textures loaded take
    // about 40 s in headless (software) Chromium.
    test.slow();
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    await expect(canvas).toHaveAttribute("data-app-state", "exploring");

    const boxes = new Map<string, Box | null>();
    for (const side of ["front", "right", "back", "left"]) {
      await page.keyboard.press("Tab");
      await expect(canvas).toHaveAttribute("data-app-state", "focused");
      await expect(canvas).toHaveAttribute("data-app-side", side);
      await expect(canvas).toHaveAttribute("data-camera-side", side);

      await page.keyboard.press("Enter");
      await expect(canvas).toHaveAttribute("data-app-state", "panel");
      await expect(canvas).toHaveAttribute("data-app-side", side);
      const panel = page.getByRole("dialog");
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute("data-side", side);
      await expect(panel.getByRole("heading", { level: 2 })).toBeVisible();
      // The terminal starts on its command line; every other panel on its close button.
      if (side === "right")
        await expect(
          panel.getByRole("textbox", { name: "Command" }),
        ).toBeFocused();
      else
        await expect(
          panel.getByRole("button", { name: "Close" }),
        ).toBeFocused();
      // The focus trap keeps Tab inside the open panel.
      await page.keyboard.press("Tab");
      await expect(panel.locator(":focus")).toHaveCount(1);
      await page.screenshot({ path: `test-results/panel-${side}.png` });
      boxes.set(side, await panel.boundingBox());

      await page.keyboard.press("Escape");
      await expect(canvas).toHaveAttribute("data-app-state", "focused");
      await expect(canvas).toHaveAttribute("data-app-side", side);
      await expect(panel).toBeHidden();
      await expect(canvas).toBeFocused();
    }
    await page.screenshot({ path: "test-results/focused-left.png" });
    expectCentredAndFitting(boxes, page.viewportSize());

    await page.keyboard.press("Escape");
    await expect(canvas).toHaveAttribute("data-app-state", "exploring");
    await expect(canvas).not.toHaveAttribute("data-app-side", /.*/);
  });

  test("every panel fits and stays centred on a narrow window", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 480, height: 640 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const panel = page.getByRole("dialog");
    const boxes = new Map<string, Box | null>();
    for (const side of ["front", "right", "back", "left"]) {
      await page.keyboard.press("Tab");
      await expect(canvas).toHaveAttribute("data-app-side", side);
      await page.keyboard.press("Enter");
      await expect(panel).toHaveAttribute("data-side", side);
      await expect(panel.getByRole("heading", { level: 2 })).toBeVisible();
      // Nothing inside spills sideways out of the panel.
      const spill = await panel.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      );
      expect(spill).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/narrow-panel-${side}.png` });
      boxes.set(side, await panel.boundingBox());
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
    }
    expectCentredAndFitting(boxes, page.viewportSize());
  });

  test("the arrow keys pick a side too, and Tab lets focus leave after the last side", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");

    await page.keyboard.press("ArrowLeft");
    await expect(canvas).toHaveAttribute("data-app-state", "focused");
    await expect(canvas).toHaveAttribute("data-app-side", "left");
    await page.keyboard.press("Enter");
    await expect(canvas).toHaveAttribute("data-app-state", "panel");
    await page.keyboard.press("Escape");

    // Left is last in tab order, so the next Tab hands focus back to the browser.
    await page.keyboard.press("Tab");
    await expect(canvas).toHaveAttribute("data-app-state", "exploring");
  });

  test("hovering a spot marks it and clicking it opens its side", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    await page.keyboard.press("ArrowLeft");
    await expect(canvas).toHaveAttribute("data-camera-side", "left");

    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");
    // Sweep the pointer over the view, from the centre outwards (the spot is near the
    // middle of the side view), until it lands on the left side's neon sign spot. Starting
    // in the middle keeps the sweep short on the slow software renderer.
    const points: { x: number; y: number }[] = [];
    for (let row = 1; row < 16; row += 1)
      for (let col = 1; col < 24; col += 1)
        points.push({
          x: box.x + (box.width * col) / 24,
          y: box.y + (box.height * row) / 16,
        });
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const distance = (p: { x: number; y: number }): number =>
      Math.hypot(p.x - centre.x, p.y - centre.y);
    points.sort((a, b) => distance(a) - distance(b));
    let found: { x: number; y: number } | undefined;
    for (const point of points) {
      await page.mouse.move(point.x, point.y);
      const hover = await canvas.getAttribute("data-hover");
      if (hover === "spot-left") {
        found = point;
        break;
      }
    }
    if (found === undefined) throw new Error("never hovered the left spot");
    await page.screenshot({ path: "test-results/hover-left.png" });

    await page.keyboard.press("Escape");
    await expect(canvas).toHaveAttribute("data-app-state", "exploring");
    await page.mouse.click(found.x, found.y);
    await expect(canvas).toHaveAttribute("data-app-state", "panel");
    await expect(canvas).toHaveAttribute("data-app-side", "left");
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();

    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toBeHidden();
    await expect(canvas).toHaveAttribute("data-app-state", "focused");
    await expect(canvas).toBeFocused();
  });
});

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

test.describe("camera navigation", () => {
  test.use({ reducedMotion: "reduce" });

  test("the arrow keys cut to each side under reduced motion", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");

    for (const side of ["right", "back", "left", "front"]) {
      await page.keyboard.press("ArrowRight");
      await expect(canvas).toHaveAttribute("data-camera-side", side);
      await page.screenshot({ path: `test-results/side-${side}.png` });
    }
  });

  test("dragging with the mouse takes the camera off the side views", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    await page.keyboard.press("ArrowLeft");
    await expect(canvas).toHaveAttribute("data-camera-side", "left");

    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, y, { steps: 5 });
    await page.mouse.up();
    await expect(canvas).not.toHaveAttribute("data-camera-side", /.*/);
    await page.screenshot({ path: "test-results/mouse-orbit.png" });
  });
});

test("the arrow keys tween to a side with motion allowed", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#loading-screen")).toBeHidden();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("canvas.scene")).toHaveAttribute(
    "data-camera-side",
    "left",
  );
});

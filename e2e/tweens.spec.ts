import { expect, test } from "@playwright/test";
import { CAMERA } from "../src/logic/cameraOrbit";

/** Smoke: the camera tweens when motion is allowed. */

test("the camera moves in to the terminal and it jacks in as the camera lands, when motion is allowed", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#loading-screen")).toBeHidden();
  const canvas = page.locator("canvas.scene");
  for (let i = 0; i < 2; i += 1) await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog");
  await expect(panel).toHaveAttribute("data-side", "right");
  // The jack-in waits for the camera's move (task 32), so the move is seen.
  const { name, delay } = await panel.evaluate((element) => {
    const style = getComputedStyle(element);
    return { name: style.animationName, delay: style.animationDelay };
  });
  expect(name).toBe("jack-in");
  expect(delay).toBe(`${String(CAMERA.tweenMs / 1000)}s`);
  await expect(canvas).toHaveAttribute("data-camera-view", "closeUp");
  await expect(canvas).toHaveAttribute("data-camera-side", "right");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(canvas).toHaveAttribute("data-camera-view", "side");
  await expect(canvas).toHaveAttribute("data-camera-side", "right");
});

test("the camera tweens in to the cabinet's screen with motion allowed", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#loading-screen")).toBeHidden();
  const canvas = page.locator("canvas.scene");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(canvas).toHaveAttribute("data-camera-view", "closeUp");
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-camera-view", "side");
});

test("the camera tweens in to the signs with motion allowed", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#loading-screen")).toBeHidden();
  const canvas = page.locator("canvas.scene");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(canvas).toHaveAttribute("data-camera-view", "closeUp");
  await expect(canvas).toHaveAttribute("data-camera-side", "left");
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-camera-view", "side");
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

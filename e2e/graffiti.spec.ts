import { expect, test } from "@playwright/test";
import { projects } from "../src/content/projects";
import { pointOnSide } from "../src/logic/buildingLayout";
import { graffitiLayout } from "../src/logic/graffitiLayout";
import { seedFromText } from "../src/logic/neonFlicker";
import { screenPointFromSide } from "./helpers";

/** Smoke: the back's graffiti alley. */

test.describe("back: graffiti alley", () => {
  test.use({ reducedMotion: "reduce" });

  test("opens the Projects panel by keyboard, links out in a new tab and closes with Escape", async ({
    page,
  }) => {
    // Two camera moves at full motion and three screenshots: about 30 s in headless
    // (software) Chromium since the lit ground and sky fill the frame (task 38), and it was
    // already flaky at the 30 s default before.
    test.slow();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const [first, second] = projects;
    if (first === undefined || second === undefined)
      throw new Error("the dummy content needs two projects");

    // Tab order: front, right, back.
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("Tab");
    await expect(canvas).toHaveAttribute("data-app-side", "back");
    await expect(canvas).toHaveAttribute("data-camera-side", "back");
    await page.screenshot({ path: "test-results/back-graffiti.png" });

    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-side", "back");
    await expect(canvas).toHaveAttribute("data-camera-view", "closeUp");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      first.title,
    );
    await expect(panel.getByText(first.description)).toBeVisible();
    const link = panel.getByRole("link", { name: /Open project/ });
    await expect(link).toHaveAttribute("href", first.url);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");

    // Tab reaches the first project; the arrow keys move to the next one.
    await page.keyboard.press("Tab");
    await expect(
      panel.getByRole("button", { name: first.title }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      second.title,
    );
    await expect(link).toHaveAttribute("href", second.url);
    await expect(canvas).toHaveAttribute("data-app-state", "panel");
    await page.screenshot({ path: "test-results/back-projects-panel.png" });

    // The posters' close-up from past the alley's kerb (task 27: all three floors; task 26: no poles,
    // the purple tube up the back corner), with the panel hidden just for this screenshot.
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.id = "hide-panel";
      style.textContent = "dialog.panel { visibility: hidden; }";
      document.head.append(style);
    });
    await page.screenshot({ path: "test-results/sidewalk-posters.png" });
    await page.evaluate(() => {
      document.getElementById("hide-panel")?.remove();
    });
    await panel.getByRole("button", { name: "Close" }).focus();

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(canvas).toHaveAttribute("data-app-state", "focused");
    await expect(canvas).toHaveAttribute("data-camera-side", "back");
    await expect(canvas).toHaveAttribute("data-camera-view", "side");
    await expect(canvas).toBeFocused();
  });

  test("Up, Down, Home and End move through the projects from the close button and the link without moving the camera", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const [first, second] = projects;
    const last = projects.at(-1);
    if (first === undefined || second === undefined || last === undefined)
      throw new Error("the dummy content needs two projects");

    for (let i = 0; i < 3; i += 1) await page.keyboard.press("Tab");
    await expect(canvas).toHaveAttribute("data-camera-side", "back");
    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog");
    await expect(panel).toHaveAttribute("data-side", "back");
    const close = panel.getByRole("button", { name: "Close" });
    const link = panel.getByRole("link", { name: /Open project/ });
    await expect(close).toBeFocused();

    // From the close button: Down chooses the next project and focuses it.
    await page.keyboard.press("ArrowDown");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      second.title,
    );
    await expect(
      panel.getByRole("button", { name: second.title }),
    ).toBeFocused();

    // From the link: End and Home jump to the last and first project.
    await link.focus();
    await page.keyboard.press("End");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      last.title,
    );
    const lastButton = panel.getByRole("button", { name: last.title });
    await expect(lastButton).toBeFocused();
    await expect(lastButton).toBeInViewport();
    await expect(link).toHaveAttribute("href", last.url);
    await link.focus();
    await page.keyboard.press("Home");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      first.title,
    );
    await expect(
      panel.getByRole("button", { name: first.title }),
    ).toBeFocused();

    // The arrow keys stayed in the panel: the scene is still on the back close-up.
    await expect(canvas).toHaveAttribute("data-app-state", "panel");
    await expect(canvas).toHaveAttribute("data-app-side", "back");
    await expect(canvas).toHaveAttribute("data-camera-side", "back");
    await expect(canvas).toHaveAttribute("data-camera-view", "closeUp");

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(canvas).toHaveAttribute("data-app-state", "focused");
    await expect(canvas).toBeFocused();
  });

  test("clicking the graffiti between the posters opens nothing", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("Tab");
    await expect(canvas).toHaveAttribute("data-camera-side", "back");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");

    // Bare paint on the first floor, left of its middle window and well clear of every
    // poster (task 27: the posters spread over all three floors).
    const high = screenPointFromSide(
      "back",
      pointOnSide("back", -2.2, 7.3, 0.07),
      box,
    );
    await page.mouse.click(high.x, high.y);
    await page.waitForTimeout(300);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(canvas).toHaveAttribute("data-camera-view", "side");
    await page.screenshot({ path: "test-results/back-graffiti-full.png" });
  });

  test("only the posters light up while the back wall is focused", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");
    const layout = graffitiLayout(
      projects.length,
      seedFromText(projects.map((p) => p.id).join("|")),
    );
    const poster = layout.posters[0];
    if (poster === undefined) throw new Error("no poster");
    // Chromium's own capture returns base64 text, so two shots compare as strings.
    const cdp = await page.context().newCDPSession(page);
    const clipAt = (p: { x: number; y: number }) => ({
      x: Math.round(p.x - 6),
      y: Math.round(p.y - 6),
      width: 12,
      height: 12,
      scale: 1,
    });
    const shot = async (clip: ReturnType<typeof clipAt>): Promise<string> =>
      (await cdp.send("Page.captureScreenshot", { format: "png", clip })).data;
    const posterClip = clipAt(screenPointFromSide("back", poster.centre, box));
    const paintClip = clipAt(
      screenPointFromSide("back", pointOnSide("back", -2.2, 7.3, 0.07), box),
    );
    // Keep the pointer off the wall so only focus lights it.
    await page.mouse.move(box.x + 4, box.y + 4);

    for (let i = 0; i < 3; i += 1) await page.keyboard.press("Tab");
    await expect(canvas).toHaveAttribute("data-camera-side", "back");
    await page.waitForTimeout(500);
    const litPoster = await shot(posterClip);
    const litPaint = await shot(paintClip);

    await page.keyboard.press("Escape");
    await expect(canvas).toHaveAttribute("data-app-state", "exploring");
    await expect(canvas).toHaveAttribute("data-camera-side", "back");
    await page.waitForTimeout(500);
    const darkPoster = await shot(posterClip);
    const darkPaint = await shot(paintClip);

    expect(litPoster).not.toBe(darkPoster);
    expect(litPaint).toBe(darkPaint);
  });

  test("clicking a poster opens the Projects panel on that poster's project", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("Tab");
    await expect(canvas).toHaveAttribute("data-camera-side", "back");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");

    // The wall lays its posters out from the projects' ids, as the scene does.
    const layout = graffitiLayout(
      projects.length,
      seedFromText(projects.map((p) => p.id).join("|")),
    );
    for (const index of [1, 2, 0]) {
      const poster = layout.posters[index];
      const project = projects[index];
      if (poster === undefined || project === undefined)
        throw new Error("the dummy content needs three projects");
      const at = screenPointFromSide("back", poster.centre, box);
      await page.mouse.click(at.x, at.y);
      const panel = page.getByRole("dialog");
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
        project.title,
      );
      await expect(canvas).toHaveAttribute("data-camera-view", "closeUp");
      if (index === 1)
        await page.screenshot({ path: "test-results/back-poster-click.png" });
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(canvas).toHaveAttribute("data-camera-view", "side");
    }

    // Enter still opens on the first project.
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog").getByRole("heading", { level: 3 }),
    ).toHaveText(projects[0]?.title ?? "");
  });
});

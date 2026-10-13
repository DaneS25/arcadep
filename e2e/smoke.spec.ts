import { expect, test } from "@playwright/test";
import { contact } from "../src/content/contact";
import { profile } from "../src/content/profile";
import { projects } from "../src/content/projects";
import { skills } from "../src/content/skills";
import type { Vec3 } from "../src/logic/buildingLayout";
import { pointOnSide } from "../src/logic/buildingLayout";
import { posePosition, sidePose } from "../src/logic/cameraOrbit";
import { graffitiLayout } from "../src/logic/graffitiLayout";
import { seedFromText } from "../src/logic/neonFlicker";

/**
 * Where a world point lands in the canvas from a side's view (the app's 50° camera), in
 * page pixels, so a test can click one poster.
 */
function screenPointFromSide(
  side: "back",
  point: Vec3,
  box: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const pose = sidePose(side);
  const eye = posePosition(pose);
  const sub = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  });
  const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const unit = (a: Vec3): Vec3 => {
    const l = Math.hypot(a.x, a.y, a.z);
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  };
  const forward = unit(sub(pose.target, eye));
  const right = unit(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const d = sub(point, eye);
  const depth = dot(d, forward);
  const halfTan = Math.tan((25 * Math.PI) / 180);
  const ndcX = dot(d, right) / depth / (halfTan * (box.width / box.height));
  const ndcY = dot(d, up) / depth / halfTan;
  return {
    x: box.x + ((ndcX + 1) / 2) * box.width,
    y: box.y + ((1 - ndcY) / 2) * box.height,
  };
}

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

test("the neon, mono and marker fonts load and the loading screen, CRT and terminal use them", async ({
  page,
  request,
}) => {
  // The font files are the user's (untracked); without them everything falls back.
  const files = ["Orbitron", "ShareTechMono", "PermanentMarker"];
  for (const file of files) {
    const response = await request.get(`/assets/fonts/${file}.ttf`);
    const type = response.headers()["content-type"] ?? "";
    test.skip(
      !response.ok() || type.includes("html"),
      `public/assets/fonts/${file}.ttf is not there`,
    );
  }
  await page.goto("/");
  await expect(page.locator("#loading-screen")).toBeHidden();

  const result = await page.evaluate(() => {
    const unquote = (family: string): string => family.replaceAll('"', "");
    const loaded = [...document.fonts]
      .filter((face) => face.status === "loaded")
      .map((face) => unquote(face.family));
    // The first family each overlay's text asks for.
    const firstFamily = (className: string): string => {
      const el = document.createElement("div");
      el.className = className;
      document.body.append(el);
      const family = unquote(
        getComputedStyle(el).fontFamily.split(",")[0] ?? "",
      );
      el.remove();
      return family.trim();
    };
    return {
      loaded,
      loadingScreen: firstFamily("loading-screen"),
      crt: firstFamily("crt"),
      terminal: firstFamily("terminal"),
    };
  });
  expect(result.loaded).toEqual(
    expect.arrayContaining(["Orbitron", "Share Tech Mono", "Permanent Marker"]),
  );
  expect(result.loadingScreen).toBe("Orbitron");
  expect(result.crt).toBe("Share Tech Mono");
  expect(result.terminal).toBe("Share Tech Mono");
});

test("the default view renders the look pass within its draw-call budget", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await expect(page.locator("#loading-screen")).toBeHidden();
  const canvas = page.locator("canvas.scene");
  await expect(canvas).toHaveAttribute("data-draw-calls", /^\d+$/);

  // Scene pass only: merged walls, trim, pavement and street, instanced neon, the cabinet
  // (body and screen), the skill sign faces, the graffiti wall, the door terminal, the
  // merged detail props with the skill signs' plates (task 15) and the instanced fog wisps.
  const drawCalls = Number(await canvas.getAttribute("data-draw-calls"));
  expect(drawCalls).toBeGreaterThan(0);
  expect(drawCalls).toBeLessThanOrEqual(12);
  await expect(canvas).toHaveAttribute("data-textures", /^\d+$/);
  await page.screenshot({ path: "test-results/look-default.png" });
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

type Box = { x: number; y: number; width: number; height: number };

/** Root font size in the panel CSS (rem); the panel's min and max heights are 18rem and 32rem. */
const REM = 16;
const PANEL_GAP = 2.5 * REM;

/**
 * Every panel opens centred on the window at the same width (task 18), with a height that
 * fits its content between min(18rem, window - 2.5rem) and min(32rem, window - 2.5rem).
 */
function expectCentredAndFitting(
  boxes: ReadonlyMap<string, Box | null>,
  viewport: { width: number; height: number } | null,
): void {
  expect(viewport).not.toBeNull();
  const first = [...boxes.values()][0];
  for (const box of boxes.values()) {
    expect(box).not.toBeNull();
    if (box === null || first === null || first === undefined || !viewport)
      continue;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(
      2,
    );
    expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(
      2,
    );
    expect(Math.abs(box.width - first.width)).toBeLessThan(2);
    const minHeight = Math.min(18 * REM, viewport.height - PANEL_GAP);
    const maxHeight = Math.min(32 * REM, viewport.height - PANEL_GAP);
    expect(box.height).toBeGreaterThanOrEqual(minHeight - 1);
    expect(box.height).toBeLessThanOrEqual(maxHeight + 1);
  }
}

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

test.describe("front: arcade cabinet", () => {
  test.use({ reducedMotion: "reduce" });

  test("opens the CRT about pages by keyboard, pages forward and closes with Escape", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const [first, second] = profile.aboutPages;
    if (first === undefined || second === undefined)
      throw new Error("the dummy profile needs two about pages");

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
      throw new Error("the dummy content needs two skills");

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
      panel.getByRole("button", { name: new RegExp(`^${first.name}`) }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText(
      second.name,
    );
    await expect(panel.getByText(second.note)).toBeVisible();
    await expect(
      panel.getByRole("button", { name: new RegExp(`^${second.name}`) }),
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
});

test.describe("back: graffiti alley", () => {
  test.use({ reducedMotion: "reduce" });

  test("opens the Projects panel by keyboard, links out in a new tab and closes with Escape", async ({
    page,
  }) => {
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

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(canvas).toHaveAttribute("data-app-state", "focused");
    await expect(canvas).toHaveAttribute("data-camera-side", "back");
    await expect(canvas).toHaveAttribute("data-camera-view", "side");
    await expect(canvas).toBeFocused();
  });

  test("clicking the graffiti above the posters opens nothing", async ({
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

    // Bare paint on the first floor, between the AC unit and the vent.
    const high = screenPointFromSide(
      "back",
      pointOnSide("back", 0.8, 7, 0.07),
      box,
    );
    await page.mouse.click(high.x, high.y);
    await page.waitForTimeout(300);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(canvas).toHaveAttribute("data-camera-view", "side");
    await page.screenshot({ path: "test-results/back-graffiti-full.png" });
  });

  test("only the posters light up while the poster row is focused", async ({
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
      screenPointFromSide("back", pointOnSide("back", 0.8, 7, 0.07), box),
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

test.describe("right: door terminal", () => {
  test.use({ reducedMotion: "reduce" });

  test("jacks in by keyboard, runs typed and clicked commands, and exit returns to the street", async ({
    page,
  }) => {
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
    await expect(canvas).toBeFocused();
  });
});

test("the terminal jacks in with a fade when motion is allowed", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#loading-screen")).toBeHidden();
  for (let i = 0; i < 2; i += 1) await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog");
  await expect(panel).toHaveAttribute("data-side", "right");
  const animation = await panel.evaluate(
    (element) => getComputedStyle(element).animationName,
  );
  expect(animation).toBe("jack-in");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
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

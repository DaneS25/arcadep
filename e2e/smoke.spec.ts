import { expect, test } from "@playwright/test";
import { contact } from "../src/content/contact";
import { profile } from "../src/content/profile";
import { projects } from "../src/content/projects";
import { skills } from "../src/content/skills";
import type { Side, Vec3 } from "../src/logic/buildingLayout";
import { pointOnSide, wallOpenings } from "../src/logic/buildingLayout";
import { CAMERA, posePosition, sidePose } from "../src/logic/cameraOrbit";
import { backLampPosition, steamVents } from "../src/logic/ductLayout";
import { generatorPlugs } from "../src/logic/generatorLayout";
import { graffitiLayout } from "../src/logic/graffitiLayout";
import { seedFromText } from "../src/logic/neonFlicker";
import { smallLights } from "../src/logic/lightLayout";
import { tapDevices } from "../src/logic/tapLayout";

/**
 * Where a world point lands in the canvas from a side's view (the app's 50° camera), in
 * page pixels, so a test can click one poster or look at one window.
 */
function screenPointFromSide(
  side: Side,
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

  test("the flickering windows hold steady under reduced motion", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    await page.keyboard.press("ArrowRight");
    await expect(canvas).toHaveAttribute("data-camera-side", "right");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");
    // Keep the pointer off the building.
    await page.mouse.move(box.x + 4, box.y + 4);
    const flickering = wallOpenings().filter((o) => o.flicker);
    expect(flickering.length).toBeGreaterThan(0);
    const cdp = await page.context().newCDPSession(page);
    const clips = flickering.map((o) => {
      const p = screenPointFromSide(
        o.side,
        pointOnSide(o.side, o.alongM, o.bottomY + o.heightM / 2, 0.05),
        box,
      );
      return {
        x: Math.round(p.x - 4),
        y: Math.round(p.y - 4),
        width: 8,
        height: 8,
        scale: 1,
      };
    });
    const shoot = async (): Promise<string[]> =>
      Promise.all(
        clips.map(
          async (clip) =>
            (await cdp.send("Page.captureScreenshot", { format: "png", clip }))
              .data,
        ),
      );
    await page.waitForTimeout(300);
    const first = await shoot();
    // Long enough for several of the flicker's 400 ms slots to pass.
    for (let i = 0; i < 12; i += 1) {
      await page.waitForTimeout(150);
      expect(await shoot()).toEqual(first);
    }
    await page.screenshot({ path: "test-results/windows-right.png" });
  });

  test("the wire taps add no draw call and their LEDs hold steady under reduced motion", async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");
    await page.mouse.move(box.x + 4, box.y + 4);
    const cdp = await page.context().newCDPSession(page);
    const devices = tapDevices();
    // The right, then the front (the keys go round: right, back, left, front). The opening
    // view is its own orbit, not the front's view, so the front is reached by the keys too.
    for (const [side, presses] of [
      ["right", 1],
      ["front", 3],
    ] as const) {
      for (let i = 0; i < presses; i += 1)
        await page.keyboard.press("ArrowRight");
      await expect(canvas).toHaveAttribute("data-camera-side", side);
      await page.waitForTimeout(300);
      const drawCalls = Number(await canvas.getAttribute("data-draw-calls"));
      expect(drawCalls).toBeGreaterThan(0);
      expect(drawCalls).toBeLessThanOrEqual(12);
      const onSide = devices.filter((d) =>
        side === "front" ? d.at.z > 4 : d.at.x > 5,
      );
      expect(onSide.length).toBeGreaterThan(0);
      const clips = onSide.flatMap((d) =>
        d.leds
          .filter((l) => l.blink === true)
          .map((l) => {
            const p = screenPointFromSide(side, l.box.centre, box);
            return {
              x: Math.round(p.x - 4),
              y: Math.round(p.y - 4),
              width: 8,
              height: 8,
              scale: 1,
            };
          }),
      );
      expect(clips.length).toBeGreaterThan(0);
      const shoot = async (): Promise<string[]> =>
        Promise.all(
          clips.map(
            async (clip) =>
              (
                await cdp.send("Page.captureScreenshot", {
                  format: "png",
                  clip,
                })
              ).data,
          ),
        );
      const first = await shoot();
      // Long enough for several of the 400 ms blink slots to pass.
      for (let i = 0; i < 6; i += 1) {
        await page.waitForTimeout(150);
        expect(await shoot()).toEqual(first);
      }
      for (const d of onSide) {
        const at = screenPointFromSide(side, d.at, box);
        await page.screenshot({
          path: `test-results/taps-${d.id}.png`,
          clip: {
            x: Math.max(box.x, Math.round(at.x - 120)),
            y: Math.max(box.y, Math.round(at.y - 80)),
            width: 240,
            height: 160,
          },
        });
      }
    }
  });

  test("the small lights add no draw call and hold steady under reduced motion", async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");
    await page.mouse.move(box.x + 4, box.y + 4);
    const cdp = await page.context().newCDPSession(page);
    const lights = smallLights();
    // Every side in turn (the keys go round: right, back, left, front).
    for (const side of ["right", "back", "left", "front"] as const) {
      await page.keyboard.press("ArrowRight");
      await expect(canvas).toHaveAttribute("data-camera-side", side);
      await page.waitForTimeout(300);
      const drawCalls = Number(await canvas.getAttribute("data-draw-calls"));
      expect(drawCalls).toBeGreaterThan(0);
      expect(drawCalls).toBeLessThanOrEqual(12);
      const onSide = lights.filter((l) => l.side === side);
      expect(onSide.length).toBeGreaterThan(0);
      const centres = onSide.map((l) => {
        const parts = l.face
          ? l.face.quad.corners
          : l.glows.map((g) => g.box.centre);
        const n = parts.length;
        return parts.reduce(
          (m, p) => ({ x: m.x + p.x / n, y: m.y + p.y / n, z: m.z + p.z / n }),
          { x: 0, y: 0, z: 0 },
        );
      });
      const clips = centres.map((c) => {
        const p = screenPointFromSide(side, c, box);
        return {
          x: Math.round(p.x - 4),
          y: Math.round(p.y - 4),
          width: 8,
          height: 8,
          scale: 1,
        };
      });
      const shoot = async (): Promise<string[]> =>
        Promise.all(
          clips.map(
            async (clip) =>
              (
                await cdp.send("Page.captureScreenshot", {
                  format: "png",
                  clip,
                })
              ).data,
          ),
        );
      const first = await shoot();
      // Long enough for several of the 400 ms slots to pass.
      for (let i = 0; i < 6; i += 1) {
        await page.waitForTimeout(150);
        expect(await shoot()).toEqual(first);
      }
      for (const [i, l] of onSide.entries()) {
        const c = centres[i];
        if (!c) continue;
        const at = screenPointFromSide(side, c, box);
        await page.screenshot({
          path: `test-results/lights-${l.id}.png`,
          clip: {
            x: Math.max(box.x, Math.round(at.x - 120)),
            y: Math.max(box.y, Math.round(at.y - 80)),
            width: 240,
            height: 160,
          },
        });
      }
    }
  });

  test("close-ups of the weathered walls stay within the draw-call budget", async ({
    page,
  }) => {
    // Zooming with the wheel renders slowly in headless Chromium.
    test.slow();
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");

    // Grime, streaks, cracks, chips and rust runs (task 22) are drawn into the walls',
    // trim's and props' existing materials, so they add no draw call.
    for (const side of ["right", "back", "left", "front"]) {
      await page.keyboard.press("ArrowRight");
      await expect(canvas).toHaveAttribute("data-camera-side", side);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
      for (let i = 0; i < 3; i += 1) await page.mouse.wheel(0, -600);
      await page.waitForTimeout(500);
      const drawCalls = Number(await canvas.getAttribute("data-draw-calls"));
      expect(drawCalls).toBeGreaterThan(0);
      expect(drawCalls).toBeLessThanOrEqual(12);
      await page.screenshot({ path: `test-results/grime-${side}.png` });
    }
  });

  test("the ducts, steam and back door lamp add no draw call, and the steam holds still under reduced motion", async ({
    page,
  }) => {
    // A full-HD canvas renders slowly in headless Chromium.
    test.slow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");
    await page.mouse.move(box.x + 4, box.y + 4);
    // Ducts and the lamp join the details mesh; the steam is more instances of the fog
    // wisps' mesh (task 23).
    const budget = async (): Promise<void> => {
      const drawCalls = Number(await canvas.getAttribute("data-draw-calls"));
      expect(drawCalls).toBeGreaterThan(0);
      expect(drawCalls).toBeLessThanOrEqual(12);
    };
    await budget();
    await page.screenshot({ path: "test-results/ducts-default.png" });

    await page.keyboard.press("ArrowRight");
    await expect(canvas).toHaveAttribute("data-camera-side", "right");
    await budget();
    await page.screenshot({ path: "test-results/ducts-right.png" });

    await page.keyboard.press("ArrowRight");
    await expect(canvas).toHaveAttribute("data-camera-side", "back");
    await budget();
    const lamp = screenPointFromSide("back", backLampPosition(), box);
    const grate = steamVents().find((v) => v.id === "back-grate");
    if (grate === undefined) throw new Error("no grate steam");
    // A patch of the grate's steam, a metre up, is the same frame after frame.
    const steam = screenPointFromSide(
      "back",
      { ...grate.position, y: grate.position.y + 1 },
      box,
    );
    const cdp = await page.context().newCDPSession(page);
    const clip = {
      x: Math.round(steam.x - 16),
      y: Math.round(steam.y - 16),
      width: 32,
      height: 32,
      scale: 1,
    };
    const shoot = async (): Promise<string> =>
      (await cdp.send("Page.captureScreenshot", { format: "png", clip })).data;
    await page.waitForTimeout(300);
    const first = await shoot();
    for (let i = 0; i < 4; i += 1) {
      await page.waitForTimeout(200);
      expect(await shoot()).toEqual(first);
    }
    // The lit door, the steam and the fire escape over them.
    const width = 760;
    const height = 640;
    await page.screenshot({
      path: "test-results/ducts-back.png",
      clip: {
        x: Math.max(box.x, Math.round(lamp.x - width / 2)),
        y: Math.max(box.y, Math.round(lamp.y - height * 0.6)),
        width,
        height,
      },
    });
    await page.screenshot({ path: "test-results/ducts-back-full.png" });
  });

  test("the generator stands on the left side's pavement and adds no draw call", async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");
    await page.mouse.move(box.x + 4, box.y + 4);
    // The generator joins the details mesh (task 28), so the budget holds.
    await page.keyboard.press("ArrowLeft");
    await expect(canvas).toHaveAttribute("data-camera-side", "left");
    await page.waitForTimeout(300);
    const drawCalls = Number(await canvas.getAttribute("data-draw-calls"));
    console.log(`generator: ${String(drawCalls)} draw calls from the left`);
    expect(drawCalls).toBeGreaterThan(0);
    expect(drawCalls).toBeLessThanOrEqual(12);
    await page.screenshot({ path: "test-results/generator-left.png" });
    // A close crop round the generator, its ports in the middle.
    const plugs = generatorPlugs();
    const mid = plugs.reduce(
      (m, p) => ({
        x: m.x + p.position.x / plugs.length,
        y: m.y + p.position.y / plugs.length,
        z: m.z + p.position.z / plugs.length,
      }),
      { x: 0, y: 0, z: 0 },
    );
    const at = screenPointFromSide("left", mid, box);
    const width = 760;
    const height = 560;
    await page.screenshot({
      path: "test-results/generator-close.png",
      clip: {
        x: Math.max(box.x, Math.round(at.x - width / 2)),
        y: Math.max(box.y, Math.round(at.y - height * 0.4)),
        width,
        height,
      },
    });
  });

  test("the overhead wires hang round every side and add no draw call", async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");
    await page.mouse.move(box.x + 4, box.y + 4);
    // The wires join the details mesh (task 29), so the budget holds from every side.
    for (const side of ["right", "back", "left", "front"]) {
      await page.keyboard.press("ArrowRight");
      await expect(canvas).toHaveAttribute("data-camera-side", side);
      await page.waitForTimeout(300);
      const drawCalls = Number(await canvas.getAttribute("data-draw-calls"));
      console.log(`wires: ${String(drawCalls)} draw calls from the ${side}`);
      expect(drawCalls).toBeGreaterThan(0);
      expect(drawCalls).toBeLessThanOrEqual(12);
      await page.screenshot({ path: `test-results/wires-${side}.png` });
    }
    // The feeds down into the generator, close up from the left.
    await page.keyboard.press("ArrowLeft");
    await expect(canvas).toHaveAttribute("data-camera-side", "left");
    await page.waitForTimeout(300);
    const plugs = generatorPlugs();
    const mid = plugs.reduce(
      (m, p) => ({
        x: m.x + p.position.x / plugs.length,
        y: m.y + p.position.y / plugs.length,
        z: m.z + p.position.z / plugs.length,
      }),
      { x: 0, y: 0, z: 0 },
    );
    const at = screenPointFromSide("left", mid, box);
    const width = 900;
    const height = 640;
    await page.screenshot({
      path: "test-results/wires-generator.png",
      clip: {
        x: Math.max(box.x, Math.round(at.x - width / 2)),
        y: Math.max(box.y, Math.round(at.y - height * 0.55)),
        width,
        height,
      },
    });
  });

  test("the pavement runs round the building within the draw-call budget and the street fades to black past it", async ({
    page,
  }) => {
    // Several full renders and a zoomed-out orbit render slowly in headless Chromium.
    test.slow();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");
    await page.mouse.move(box.x + 4, box.y + 4);
    // The kerbs join the pavement's mesh and the drains, bags and litter the details mesh
    // (task 24), so the budget holds from every side.
    const budget = async (): Promise<void> => {
      const drawCalls = Number(await canvas.getAttribute("data-draw-calls"));
      expect(drawCalls).toBeGreaterThan(0);
      expect(drawCalls).toBeLessThanOrEqual(12);
    };
    for (const side of ["right", "back", "left", "front"]) {
      await page.keyboard.press("ArrowRight");
      await expect(canvas).toHaveAttribute("data-camera-side", side);
      await page.waitForTimeout(300);
      await budget();
      await page.screenshot({ path: `test-results/sidewalk-${side}.png` });
    }

    // High and far: zoom right out and swing up over the corner.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 4; i += 1) await page.mouse.wheel(0, 800);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 300, {
      steps: 6,
    });
    await page.mouse.up();
    await page.mouse.move(box.x + 4, box.y + 4);
    await page.waitForTimeout(600);
    await budget();
    await page.screenshot({ path: "test-results/sidewalk-high.png" });

    // Past the pavement the frame is black: the brightest pixel in each corner of the
    // high view (all street past the fade) stays near the base colour.
    const cdp = await page.context().newCDPSession(page);
    const size = 60;
    const corners = [
      [box.x + 2, box.y + 2],
      [box.x + box.width - size - 2, box.y + 2],
      [box.x + 2, box.y + box.height - size - 2],
      [box.x + box.width - size - 2, box.y + box.height - size - 2],
    ] as const;
    for (const [x, y] of corners) {
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "png",
        clip: {
          x: Math.round(x),
          y: Math.round(y),
          width: size,
          height: size,
          scale: 1,
        },
      });
      const brightest = await page.evaluate(async (png) => {
        const img = new Image();
        img.src = `data:image/png;base64,${png}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        if (ctx === null) return 255;
        ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
        let max = 0;
        for (let i = 0; i < pixels.length; i += 4)
          max = Math.max(
            max,
            pixels[i] ?? 0,
            pixels[i + 1] ?? 0,
            pixels[i + 2] ?? 0,
          );
        return max;
      }, data);
      expect(brightest).toBeLessThan(40);
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
    // Runs close to the 30 s default on a busy machine (it timed out once in task 21).
    test.slow();
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

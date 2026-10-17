import { expect, test } from "@playwright/test";
import { pointOnSide, wallOpenings } from "../src/logic/buildingLayout";
import { backLampPosition, steamVents } from "../src/logic/ductLayout";
import { generatorPlugs } from "../src/logic/generatorLayout";
import { smallLights } from "../src/logic/lightLayout";
import { STREET_LAMPS, lampLightPosition } from "../src/logic/streetLampLayout";
import { tapDevices } from "../src/logic/tapLayout";
import { clipStats, screenPointFromSide } from "./helpers";

/**
 * Smoke: the scene's look, its draw-call budget and what holds still under reduced
 * motion. The describe keeps its old title, so the full test names don't change.
 */

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

  test("the pavement runs round the building within the draw-call budget and the ground fades into the dark past it", async ({
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
    // (task 24); the ground and the night sky share one mesh (task 38), so the budget holds
    // from every side.
    const budget = async (): Promise<void> => {
      const drawCalls = Number(await canvas.getAttribute("data-draw-calls"));
      expect(drawCalls).toBeGreaterThan(0);
      expect(drawCalls).toBeLessThanOrEqual(12);
    };
    const cdp = await page.context().newCDPSession(page);
    const size = 40;
    for (const side of ["right", "back", "left", "front"] as const) {
      await page.keyboard.press("ArrowRight");
      await expect(canvas).toHaveAttribute("data-camera-side", side);
      await page.waitForTimeout(300);
      await budget();
      await page.screenshot({ path: `test-results/sidewalk-${side}.png` });

      // Concrete ground runs on past the kerb (task 38): a few metres past the pavement,
      // towards the camera, it is lit, well above the background, while up at the top of
      // the frame, far past the fade, it has gone into the dark.
      const near = screenPointFromSide(side, pointOnSide(side, 0, 0, 9), box);
      const lit = await clipStats(cdp, page, {
        x: near.x - size / 2,
        y: near.y - size / 2,
        width: size,
        height: size,
      });
      const far = await clipStats(cdp, page, {
        x: box.x + 2,
        y: box.y + 2,
        width: 60,
        height: 60,
      });
      console.log(
        `ground from the ${side}: near mean ${lit.mean.toFixed(1)}, far mean ${far.mean.toFixed(1)} max ${String(far.max)}`,
      );
      expect(lit.mean).toBeGreaterThan(8);
      expect(lit.mean).toBeGreaterThan(far.mean + 4);
      expect(far.max).toBeLessThan(40);
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

    // The ground's fade and the fog keep the far corners of the high view dark: the
    // brightest pixel in each stays near the base colour.
    const corner = 60;
    const corners = [
      [box.x + 2, box.y + 2],
      [box.x + box.width - corner - 2, box.y + 2],
      [box.x + 2, box.y + box.height - corner - 2],
      [box.x + box.width - corner - 2, box.y + box.height - corner - 2],
    ] as const;
    for (const [x, y] of corners) {
      const { max } = await clipStats(cdp, page, {
        x,
        y,
        width: corner,
        height: corner,
      });
      expect(max).toBeLessThan(40);
    }
  });

  test("the street lamps light the front and back, add no draw call and hold steady under reduced motion", async ({
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
    await page.waitForTimeout(300);
    await page.screenshot({ path: "test-results/lamps-start.png" });
    const cdp = await page.context().newCDPSession(page);
    // The keys go round: right, back, left, front. The lamps stand in front of the back
    // and front walls.
    for (const side of ["right", "back", "left", "front"] as const) {
      await page.keyboard.press("ArrowRight");
      await expect(canvas).toHaveAttribute("data-camera-side", side);
      if (side !== "back" && side !== "front") continue;
      await page.waitForTimeout(300);
      const drawCalls = Number(await canvas.getAttribute("data-draw-calls"));
      expect(drawCalls).toBeGreaterThan(0);
      expect(drawCalls).toBeLessThanOrEqual(12);
      const lamp = STREET_LAMPS.find((l) => l.id === `lamp-${side}`);
      if (lamp === undefined) throw new Error(`no lamp at the ${side}`);
      const at = screenPointFromSide(side, lampLightPosition(lamp), box);
      const clip = {
        x: Math.max(box.x, Math.round(at.x - 120)),
        y: Math.max(box.y, Math.round(at.y - 60)),
        width: 240,
        height: 200,
      };
      const first = await clipStats(cdp, page, clip);
      console.log(`lamp-${side}: warm ${first.warmShare.toFixed(3)}`);
      // The lamp lights its wall in warm orange (the one warm exception); without the lamps
      // these clips have next to no warm pixels.
      expect(first.warmShare).toBeGreaterThan(0.005);
      for (let i = 0; i < 4; i += 1) {
        await page.waitForTimeout(200);
        expect((await clipStats(cdp, page, clip)).png).toBe(first.png);
      }
      await page.screenshot({ path: `test-results/lamps-${side}.png` });
      await page.screenshot({
        path: `test-results/lamps-${side}-close.png`,
        clip,
      });
    }
  });

  test("the night sky's aurora shows from a low orbit in cold colours and holds still under reduced motion", async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await expect(page.locator("#loading-screen")).toBeHidden();
    const canvas = page.locator("canvas.scene");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("canvas has no box");
    // Swing the camera right down, so the sky fills the top of the frame.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 8 });
    await page.mouse.up();
    await page.mouse.move(box.x + 4, box.y + box.height - 4);
    await page.waitForTimeout(600);
    const drawCalls = Number(await canvas.getAttribute("data-draw-calls"));
    expect(drawCalls).toBeGreaterThan(0);
    expect(drawCalls).toBeLessThanOrEqual(12);
    await page.screenshot({ path: "test-results/sky-low.png" });

    const cdp = await page.context().newCDPSession(page);
    const band = {
      x: box.x + 10,
      y: box.y + 10,
      width: box.width - 20,
      height: box.height * 0.3,
    };
    const first = await clipStats(cdp, page, band);
    console.log(
      `sky: max ${String(first.max)}, warm ${first.warmShare.toFixed(4)}, cold ${first.coldShare.toFixed(3)}`,
    );
    // Part of the sky is lit by the aurora, never yellow or amber: the lit pixels are
    // green or purple, not red and green over blue.
    expect(first.max).toBeGreaterThan(30);
    expect(first.warmShare).toBeLessThan(0.01);
    expect(first.coldShare).toBeGreaterThan(0.02);
    // Under reduced motion the aurora is a still picture.
    await page.waitForTimeout(1500);
    const second = await clipStats(cdp, page, band);
    expect(second.png).toBe(first.png);
  });
});

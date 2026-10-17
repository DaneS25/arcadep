import { expect, test } from "@playwright/test";

/** Smoke: the built site loads and its fonts are used. */

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

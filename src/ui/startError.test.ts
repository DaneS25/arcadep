import { beforeEach, describe, expect, it } from "vitest";
import { showStartError } from "./startError";

describe("showStartError", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<main id="app"><canvas></canvas></main>';
    const found = document.querySelector<HTMLElement>("#app");
    if (found === null) throw new Error("test fixture is missing #app");
    root = found;
  });

  it("replaces the scene with an alert a screen reader announces", () => {
    showStartError(root, "no WebGL");

    expect(root.querySelector("canvas")).toBeNull();
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("shows a heading, advice and the reason as text", () => {
    showStartError(root, "Error creating WebGL context.");

    expect(root.querySelector("h1")?.textContent).toBe(
      "The 3D scene couldn't start",
    );
    expect(root.textContent).toContain("WebGL");
    expect(root.textContent).toContain(
      "Details: Error creating WebGL context.",
    );
  });
});

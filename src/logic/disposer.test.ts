import { describe, expect, it } from "vitest";
import { createDisposer } from "./disposer";

describe("createDisposer", () => {
  it("runs steps in reverse order of registration", () => {
    const calls: string[] = [];
    const disposer = createDisposer();
    disposer.add(() => calls.push("first"));
    disposer.add(() => calls.push("second"));

    disposer.dispose();

    expect(calls).toEqual(["second", "first"]);
  });

  it("runs each step only once when disposed twice", () => {
    let count = 0;
    const disposer = createDisposer();
    disposer.add(() => {
      count += 1;
    });

    disposer.dispose();
    disposer.dispose();

    expect(count).toBe(1);
  });

  it("reports whether it has been disposed", () => {
    const disposer = createDisposer();
    expect(disposer.disposed).toBe(false);
    disposer.dispose();
    expect(disposer.disposed).toBe(true);
  });

  it("runs a step added after disposal straight away", () => {
    let ran = false;
    const disposer = createDisposer();
    disposer.dispose();

    disposer.add(() => {
      ran = true;
    });

    expect(ran).toBe(true);
  });
});

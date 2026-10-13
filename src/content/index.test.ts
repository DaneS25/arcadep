import { describe, expect, it, vi } from "vitest";
import { loadContent, rawContent } from "@/content/index";

describe("loadContent", () => {
  it("returns the dummy content and warns about nothing", () => {
    const warn = vi.fn();

    const content = loadContent(warn);

    expect(content).toEqual(rawContent);
    expect(warn).not.toHaveBeenCalled();
  });

  it("reports each skipped entry through warn", () => {
    const warn = vi.fn();

    const content = loadContent(warn, { ...rawContent, skills: [{ id: "x" }] });

    expect(content.skills).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'content: skills[0] skipped: "name" is missing or empty',
    );
  });
});

describe("signage", () => {
  it("gives every shop sign some words", async () => {
    const { signage } = await import("@/content/signage");
    for (const text of Object.values(signage))
      expect(text.trim().length).toBeGreaterThan(0);
  });
});

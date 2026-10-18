import { describe, expect, it, vi } from "vitest";
import { loadContent, rawContent } from "@/content/index";
import { MAX_POSTERS } from "@/logic/graffitiLayout";
import { MAX_SIGNS } from "@/logic/skillSignsLayout";

describe("loadContent", () => {
  it("returns the site content and warns about nothing", () => {
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

describe("site content", () => {
  it("has no placeholder left to replace", () => {
    const files = import.meta.glob<string>("./*.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    });
    for (const [path, source] of Object.entries(files))
      expect(source, path).not.toContain("DUMMY" + ": replace");
  });

  it("fits every skill on the left wall", () => {
    expect(rawContent.skills.length).toBeLessThanOrEqual(MAX_SIGNS);
  });

  it("fits every project on the graffiti wall", () => {
    expect(rawContent.projects.length).toBeLessThanOrEqual(MAX_POSTERS);
  });
});

describe("signage", () => {
  it("gives every shop sign some words", async () => {
    const { signage } = await import("@/content/signage");
    for (const text of Object.values(signage))
      expect(text.trim().length).toBeGreaterThan(0);
  });
});

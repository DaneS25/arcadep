import { describe, expect, it } from "vitest";
import { rawContent } from "@/content/index";
import type { SiteContent } from "@/content/types";
import {
  isHttpsUrl,
  isThumbnailPath,
  validateContent,
} from "@/content/validate";

function validSkill(overrides: Record<string, unknown> = {}) {
  return {
    id: "ts",
    name: "TypeScript",
    group: "Languages",
    level: 3,
    years: 2,
    note: "Daily driver.",
    ...overrides,
  };
}

function validProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "app",
    title: "App",
    description: "An app.",
    url: "https://example.com/app",
    thumbnail: "/assets/thumbnails/app.png",
    tags: ["Web"],
    ...overrides,
  };
}

function contentWith(overrides: Record<string, unknown>): unknown {
  return {
    profile: {
      name: "Alex",
      title: "Dev",
      tagline: "Hi.",
      aboutPages: [{ heading: "Intro", body: "Hello." }],
    },
    skills: [validSkill()],
    projects: [validProject()],
    contact: { email: "a@example.com", links: [] },
    ...overrides,
  };
}

describe("validateContent", () => {
  it("accepts the dummy content with no warnings", () => {
    const { content, warnings } = validateContent(rawContent);

    expect(warnings).toEqual([]);
    expect(content).toEqual(rawContent);
  });

  it("returns the same content when every entry is valid", () => {
    const { content, warnings } = validateContent(contentWith({}));

    expect(warnings).toEqual([]);
    expect(content.skills).toHaveLength(1);
    expect(content.projects).toHaveLength(1);
    expect(content.profile.aboutPages).toHaveLength(1);
  });

  it("returns empty content with a warning when the input is not an object", () => {
    const { content, warnings } = validateContent(null);

    expect(content.skills).toEqual([]);
    expect(content.projects).toEqual([]);
    expect(content.profile.name).toBe("");
    expect(content.contact).toEqual({
      email: null,
      github: null,
      linkedin: null,
      links: [],
    });
    expect(warnings[0]).toBe("expected an object, showing no content");
  });

  it("does not throw on garbage input", () => {
    expect(() => validateContent(42)).not.toThrow();
    expect(() => validateContent({ skills: "x", projects: {} })).not.toThrow();
  });

  it("trims surrounding whitespace from text fields", () => {
    const { content } = validateContent(
      contentWith({ skills: [validSkill({ name: "  TypeScript  " })] }),
    );

    expect(content.skills[0]?.name).toBe("TypeScript");
  });
});

describe("validateContent: profile", () => {
  it("blanks a missing profile field and warns", () => {
    const { content, warnings } = validateContent(
      contentWith({
        profile: { title: "Dev", tagline: "Hi.", aboutPages: [] },
      }),
    );

    expect(content.profile.name).toBe("");
    expect(content.profile.title).toBe("Dev");
    expect(warnings).toEqual(['profile: "name" is missing or empty']);
  });

  it("skips an about page with an empty body and keeps the rest", () => {
    const { content, warnings } = validateContent(
      contentWith({
        profile: {
          name: "Alex",
          title: "Dev",
          tagline: "Hi.",
          aboutPages: [
            { heading: "Intro", body: "   " },
            { heading: "More", body: "Text." },
          ],
        },
      }),
    );

    expect(content.profile.aboutPages).toEqual([
      { heading: "More", body: "Text." },
    ]);
    expect(warnings).toEqual([
      'profile.aboutPages[0] skipped: "body" is missing or empty',
    ]);
  });
});

describe("validateContent: skills", () => {
  it("skips a skill with a missing name", () => {
    const { content, warnings } = validateContent(
      contentWith({
        skills: [validSkill({ name: undefined }), validSkill({ id: "py" })],
      }),
    );

    expect(content.skills.map((skill) => skill.id)).toEqual(["py"]);
    expect(warnings).toEqual(['skills[0] skipped: "name" is missing or empty']);
  });

  it.each([0, 6, 2.5, "3"])("skips a skill with level %j", (level) => {
    const { content, warnings } = validateContent(
      contentWith({ skills: [validSkill({ level })] }),
    );

    expect(content.skills).toEqual([]);
    expect(warnings).toEqual([
      'skills[0] skipped: "level" must be a whole number from 1 to 5',
    ]);
  });

  it.each([-1, Number.NaN, 81, "2"])("skips a skill with years %j", (years) => {
    const { content } = validateContent(
      contentWith({ skills: [validSkill({ years })] }),
    );

    expect(content.skills).toEqual([]);
  });

  it("skips a skill whose id repeats an earlier one", () => {
    const { content, warnings } = validateContent(
      contentWith({
        skills: [validSkill(), validSkill({ name: "Other" })],
      }),
    );

    expect(content.skills.map((skill) => skill.name)).toEqual(["TypeScript"]);
    expect(warnings).toEqual(['skills[1] skipped: duplicate id "ts"']);
  });

  it("shows no skills and warns when skills is not a list", () => {
    const { content, warnings } = validateContent(
      contentWith({ skills: { id: "ts" } }),
    );

    expect(content.skills).toEqual([]);
    expect(warnings).toEqual(["skills: expected a list, showing none"]);
  });
});

describe("validateContent: projects", () => {
  it.each([
    "http://example.com",
    "javascript:alert(1)",
    "ftp://example.com",
    "example.com",
    "not a url",
  ])("skips a project with the url %j", (url) => {
    const { content, warnings } = validateContent(
      contentWith({ projects: [validProject({ url })] }),
    );

    expect(content.projects).toEqual([]);
    expect(warnings).toEqual([
      'projects[0] skipped: "url" must be an https: URL',
    ]);
  });

  it("skips a project with a thumbnail outside the thumbnails folder", () => {
    const { content, warnings } = validateContent(
      contentWith({
        projects: [validProject({ thumbnail: "/assets/textures/app.png" })],
      }),
    );

    expect(content.projects).toEqual([]);
    expect(warnings).toEqual([
      'projects[0] skipped: "thumbnail" must be a path under /assets/thumbnails/',
    ]);
  });

  it("skips a project with a missing description", () => {
    const { content } = validateContent(
      contentWith({ projects: [validProject({ description: undefined })] }),
    );

    expect(content.projects).toEqual([]);
  });

  it("treats missing tags as an empty list", () => {
    const { content } = validateContent(
      contentWith({ projects: [validProject({ tags: undefined })] }),
    );

    expect(content.projects[0]?.tags).toEqual([]);
  });

  it("skips a project with a non-string tag", () => {
    const { content } = validateContent(
      contentWith({ projects: [validProject({ tags: ["Web", 3] })] }),
    );

    expect(content.projects).toEqual([]);
  });

  it("skips a project whose id repeats an earlier one", () => {
    const { content, warnings } = validateContent(
      contentWith({
        projects: [validProject(), validProject({ title: "Copy" })],
      }),
    );

    expect(content.projects.map((project) => project.title)).toEqual(["App"]);
    expect(warnings).toEqual(['projects[1] skipped: duplicate id "app"']);
  });

  it("allows the same id in skills and projects", () => {
    const { warnings } = validateContent(
      contentWith({
        skills: [validSkill({ id: "same" })],
        projects: [validProject({ id: "same" })],
      }),
    );

    expect(warnings).toEqual([]);
  });
});

describe("validateContent: contact", () => {
  it("keeps valid contact fields", () => {
    const contact: SiteContent["contact"] = {
      email: "a@example.com",
      github: "https://github.com/a",
      linkedin: "https://linkedin.com/in/a",
      links: [{ label: "Blog", url: "https://a.dev" }],
    };

    const { content, warnings } = validateContent(contentWith({ contact }));

    expect(content.contact).toEqual(contact);
    expect(warnings).toEqual([]);
  });

  it("drops an invalid email and warns", () => {
    const { content, warnings } = validateContent(
      contentWith({ contact: { email: "not-an-email" } }),
    );

    expect(content.contact.email).toBeNull();
    expect(warnings).toEqual([
      'contact: "email" skipped: must be an email address',
    ]);
  });

  it("drops a non-https GitHub link and warns", () => {
    const { content, warnings } = validateContent(
      contentWith({ contact: { github: "http://github.com/a" } }),
    );

    expect(content.contact.github).toBeNull();
    expect(warnings).toEqual([
      'contact: "github" skipped: must be an https: URL',
    ]);
  });

  it("leaves omitted optional contact fields null without a warning", () => {
    const { content, warnings } = validateContent(contentWith({ contact: {} }));

    expect(content.contact).toEqual({
      email: null,
      github: null,
      linkedin: null,
      links: [],
    });
    expect(warnings).toEqual([]);
  });

  it("skips a link with a bad url and keeps the rest", () => {
    const { content, warnings } = validateContent(
      contentWith({
        contact: {
          links: [
            { label: "Bad", url: "mailto:a@example.com" },
            { label: "Good", url: "https://a.dev" },
          ],
        },
      }),
    );

    expect(content.contact.links).toEqual([
      { label: "Good", url: "https://a.dev" },
    ]);
    expect(warnings).toEqual([
      'contact.links[0] skipped: "url" must be an https: URL',
    ]);
  });
});

describe("isHttpsUrl", () => {
  it("accepts an https URL", () => {
    expect(isHttpsUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("rejects a relative path", () => {
    expect(isHttpsUrl("/assets/x.png")).toBe(false);
  });
});

describe("isThumbnailPath", () => {
  it.each([
    ["/assets/thumbnails/a.png", true],
    ["/assets/thumbnails/sub/a.png", true],
    ["/assets/thumbnails/", false],
    ["/assets/thumbnails/../secret.png", false],
    ["/assets/thumbnails//a.png", false],
    ["assets/thumbnails/a.png", false],
    ["https://example.com/assets/thumbnails/a.png", false],
  ])("returns the right answer for %j", (path, expected) => {
    expect(isThumbnailPath(path)).toBe(expected);
  });
});

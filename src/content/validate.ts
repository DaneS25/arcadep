import type {
  AboutPage,
  Contact,
  ContactLink,
  Profile,
  Project,
  SiteContent,
  Skill,
  SkillLevel,
} from "@/content/types";

/** Validated content plus one warning per entry or field that was skipped. */
export type ContentValidation = {
  content: SiteContent;
  warnings: string[];
};

type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string };

const THUMBNAIL_PREFIX = "/assets/thumbnails/";
const MAX_SKILL_YEARS = 80;
// Deliberately loose: something@something.tld with no spaces.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSkillLevel(value: unknown): value is SkillLevel {
  return (
    value === 1 || value === 2 || value === 3 || value === 4 || value === 5
  );
}

/** A trimmed, non-empty string, or `null`. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** True only for an absolute `https:` URL. */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    // An unparseable URL is just invalid content, not an error to surface.
    return false;
  }
}

/** True for a file path directly or nested under `/assets/thumbnails/`, with no `..` segments. */
export function isThumbnailPath(value: string): boolean {
  if (!value.startsWith(THUMBNAIL_PREFIX)) return false;
  const rest = value.slice(THUMBNAIL_PREFIX.length);
  return (
    rest !== "" && rest.split("/").every((part) => part !== "" && part !== "..")
  );
}

function requireText(
  record: Record<string, unknown>,
  field: string,
): Parsed<string> {
  const value = text(record[field]);
  return value === null
    ? { ok: false, reason: `"${field}" is missing or empty` }
    : { ok: true, value };
}

/**
 * Parses each entry of a list, skipping (with a warning) entries that fail and entries
 * whose id repeats an earlier one.
 */
function parseList<T extends { id: string }>(
  raw: unknown,
  name: string,
  parse: (entry: unknown) => Parsed<T>,
  warnings: string[],
): T[] {
  if (!Array.isArray(raw)) {
    warnings.push(`${name}: expected a list, showing none`);
    return [];
  }
  const seen = new Set<string>();
  const result: T[] = [];
  raw.forEach((entry: unknown, index) => {
    const parsed = parse(entry);
    if (!parsed.ok) {
      warnings.push(`${name}[${String(index)}] skipped: ${parsed.reason}`);
    } else if (seen.has(parsed.value.id)) {
      warnings.push(
        `${name}[${String(index)}] skipped: duplicate id "${parsed.value.id}"`,
      );
    } else {
      seen.add(parsed.value.id);
      result.push(parsed.value);
    }
  });
  return result;
}

function parseAboutPage(raw: unknown): Parsed<AboutPage> {
  if (!isRecord(raw)) return { ok: false, reason: "not an object" };
  const heading = requireText(raw, "heading");
  if (!heading.ok) return heading;
  const body = requireText(raw, "body");
  if (!body.ok) return body;
  return { ok: true, value: { heading: heading.value, body: body.value } };
}

function validateProfile(raw: unknown, warnings: string[]): Profile {
  const record = isRecord(raw) ? raw : {};
  if (!isRecord(raw)) warnings.push("profile: not an object");

  const field = (name: "name" | "title" | "tagline"): string => {
    const value = text(record[name]);
    if (value === null) {
      warnings.push(`profile: "${name}" is missing or empty`);
      return "";
    }
    return value;
  };

  const aboutPages: AboutPage[] = [];
  const rawPages = record.aboutPages;
  if (Array.isArray(rawPages)) {
    rawPages.forEach((entry: unknown, index) => {
      const parsed = parseAboutPage(entry);
      if (parsed.ok) aboutPages.push(parsed.value);
      else
        warnings.push(
          `profile.aboutPages[${String(index)}] skipped: ${parsed.reason}`,
        );
    });
  } else {
    warnings.push('profile: "aboutPages" is not a list, showing none');
  }

  return {
    name: field("name"),
    title: field("title"),
    tagline: field("tagline"),
    aboutPages,
  };
}

function parseSkill(raw: unknown): Parsed<Skill> {
  if (!isRecord(raw)) return { ok: false, reason: "not an object" };
  const id = requireText(raw, "id");
  if (!id.ok) return id;
  const name = requireText(raw, "name");
  if (!name.ok) return name;
  const group = requireText(raw, "group");
  if (!group.ok) return group;
  const note = requireText(raw, "note");
  if (!note.ok) return note;
  const { level, years } = raw;
  if (!isSkillLevel(level)) {
    return { ok: false, reason: '"level" must be a whole number from 1 to 5' };
  }
  if (
    typeof years !== "number" ||
    !Number.isFinite(years) ||
    years < 0 ||
    years > MAX_SKILL_YEARS
  ) {
    return {
      ok: false,
      reason: `"years" must be a number from 0 to ${String(MAX_SKILL_YEARS)}`,
    };
  }
  return {
    ok: true,
    value: {
      id: id.value,
      name: name.value,
      group: group.value,
      level,
      years,
      note: note.value,
    },
  };
}

function parseTags(raw: unknown): Parsed<string[]> {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw))
    return { ok: false, reason: '"tags" must be a list' };
  const tags: string[] = [];
  for (const entry of raw) {
    const tag = text(entry);
    if (tag === null) {
      return { ok: false, reason: '"tags" must hold non-empty strings' };
    }
    tags.push(tag);
  }
  return { ok: true, value: tags };
}

function parseProject(raw: unknown): Parsed<Project> {
  if (!isRecord(raw)) return { ok: false, reason: "not an object" };
  const id = requireText(raw, "id");
  if (!id.ok) return id;
  const title = requireText(raw, "title");
  if (!title.ok) return title;
  const description = requireText(raw, "description");
  if (!description.ok) return description;
  const url = requireText(raw, "url");
  if (!url.ok) return url;
  if (!isHttpsUrl(url.value)) {
    return { ok: false, reason: '"url" must be an https: URL' };
  }
  const thumbnail = requireText(raw, "thumbnail");
  if (!thumbnail.ok) return thumbnail;
  if (!isThumbnailPath(thumbnail.value)) {
    return {
      ok: false,
      reason: `"thumbnail" must be a path under ${THUMBNAIL_PREFIX}`,
    };
  }
  const tags = parseTags(raw.tags);
  if (!tags.ok) return tags;
  return {
    ok: true,
    value: {
      id: id.value,
      title: title.value,
      description: description.value,
      url: url.value,
      thumbnail: thumbnail.value,
      tags: tags.value,
    },
  };
}

function parseContactLink(raw: unknown): Parsed<ContactLink> {
  if (!isRecord(raw)) return { ok: false, reason: "not an object" };
  const label = requireText(raw, "label");
  if (!label.ok) return label;
  const url = requireText(raw, "url");
  if (!url.ok) return url;
  if (!isHttpsUrl(url.value)) {
    return { ok: false, reason: '"url" must be an https: URL' };
  }
  return { ok: true, value: { label: label.value, url: url.value } };
}

function validateContact(raw: unknown, warnings: string[]): Contact {
  const record = isRecord(raw) ? raw : {};
  if (!isRecord(raw)) warnings.push("contact: not an object");

  const optional = (
    name: "email" | "github" | "linkedin",
    isValid: (value: string) => boolean,
    rule: string,
  ): string | null => {
    const value = record[name];
    if (value === undefined || value === null) return null;
    const trimmed = text(value);
    if (trimmed === null || !isValid(trimmed)) {
      warnings.push(`contact: "${name}" skipped: ${rule}`);
      return null;
    }
    return trimmed;
  };

  const links: ContactLink[] = [];
  const rawLinks = record.links;
  if (Array.isArray(rawLinks)) {
    rawLinks.forEach((entry: unknown, index) => {
      const parsed = parseContactLink(entry);
      if (parsed.ok) links.push(parsed.value);
      else
        warnings.push(
          `contact.links[${String(index)}] skipped: ${parsed.reason}`,
        );
    });
  } else if (rawLinks !== undefined) {
    warnings.push('contact: "links" is not a list, showing none');
  }

  return {
    email: optional(
      "email",
      (value) => EMAIL_PATTERN.test(value),
      "must be an email address",
    ),
    github: optional("github", isHttpsUrl, "must be an https: URL"),
    linkedin: optional("linkedin", isHttpsUrl, "must be an https: URL"),
    links,
  };
}

/**
 * Validates site content from `src/content/`. Never throws: a bad entry or field is
 * skipped and described in `warnings`, so the site still loads.
 */
export function validateContent(raw: unknown): ContentValidation {
  const warnings: string[] = [];
  const record = isRecord(raw) ? raw : {};
  if (!isRecord(raw)) warnings.push("expected an object, showing no content");

  const content: SiteContent = {
    profile: validateProfile(record.profile, warnings),
    skills: parseList(record.skills, "skills", parseSkill, warnings),
    projects: parseList(record.projects, "projects", parseProject, warnings),
    contact: validateContact(record.contact, warnings),
  };
  return { content, warnings };
}

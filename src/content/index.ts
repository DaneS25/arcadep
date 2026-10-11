import { contact } from "@/content/contact";
import { profile } from "@/content/profile";
import { projects } from "@/content/projects";
import { skills } from "@/content/skills";
import type { SiteContent } from "@/content/types";
import { validateContent } from "@/content/validate";

/** The content as written in `src/content/`, before validation. */
export const rawContent: SiteContent = { profile, skills, projects, contact };

/**
 * Validates the site content once at start-up and reports each skipped entry through
 * `warn`, so a bad entry never crashes the site.
 */
export function loadContent(
  warn: (message: string) => void,
  raw: unknown = rawContent,
): SiteContent {
  const { content, warnings } = validateContent(raw);
  for (const message of warnings) warn(`content: ${message}`);
  return content;
}

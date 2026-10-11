/** One page of the about panel on the arcade cabinet (front side). */
export type AboutPage = {
  heading: string;
  body: string;
};

export type Profile = {
  name: string;
  title: string;
  tagline: string;
  aboutPages: readonly AboutPage[];
};

/** Skill level from 1 (beginner) to 5 (expert). */
export type SkillLevel = 1 | 2 | 3 | 4 | 5;

/** One neon sign on the left side. */
export type Skill = {
  id: string;
  name: string;
  group: string;
  level: SkillLevel;
  years: number;
  note: string;
};

/** One paste-up poster on the graffiti wall (back side). */
export type Project = {
  id: string;
  title: string;
  description: string;
  /** Where the project is hosted. Always `https:`. */
  url: string;
  /** Site path under `/assets/thumbnails/`, served from `public/assets/thumbnails/`. */
  thumbnail: string;
  tags: readonly string[];
};

export type ContactLink = {
  label: string;
  /** Always `https:`. */
  url: string;
};

/** What the door terminal (right side) shows. A missing or invalid field is `null`. */
export type Contact = {
  email: string | null;
  github: string | null;
  linkedin: string | null;
  links: readonly ContactLink[];
};

export type SiteContent = {
  profile: Profile;
  skills: readonly Skill[];
  projects: readonly Project[];
  contact: Contact;
};

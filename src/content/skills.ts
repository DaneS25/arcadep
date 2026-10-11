import type { Skill } from "@/content/types";

// DUMMY: replace
export const skills: readonly Skill[] = [
  {
    id: "typescript",
    name: "TypeScript",
    group: "Languages",
    level: 4,
    years: 4,
    note: "My default for anything that runs in a browser.",
  },
  {
    id: "python",
    name: "Python",
    group: "Languages",
    level: 3,
    years: 3,
    note: "Scripts, tooling and the odd data crunch.",
  },
  {
    id: "react",
    name: "React",
    group: "Front end",
    level: 4,
    years: 3,
    note: "Component-driven UIs with a focus on accessibility.",
  },
  {
    id: "threejs",
    name: "three.js",
    group: "Front end",
    level: 2,
    years: 1,
    note: "The thing this building is made of.",
  },
  {
    id: "node",
    name: "Node.js",
    group: "Back end",
    level: 3,
    years: 3,
    note: "APIs, CLIs and build tooling.",
  },
  {
    id: "git",
    name: "Git",
    group: "Tools",
    level: 4,
    years: 5,
    note: "Small commits, clear messages.",
  },
];

import type { Project } from "@/content/types";

// DUMMY: replace
export const projects: readonly Project[] = [
  {
    id: "budget-app",
    title: "Budget App",
    description:
      "A personal budgeting app for tracking income, spending and monthly goals.",
    url: "https://example.com/budget-app",
    thumbnail: "/assets/thumbnails/budget-app.png",
    tags: ["React", "TypeScript"],
  },
  {
    id: "pixel-racer",
    title: "Pixel Racer",
    description: "A tiny top-down racing game that runs in the browser.",
    url: "https://example.com/pixel-racer",
    thumbnail: "/assets/thumbnails/pixel-racer.png",
    tags: ["Game", "Canvas"],
  },
  {
    id: "weather-cli",
    title: "Weather CLI",
    description: "A command-line tool that prints the forecast as ASCII art.",
    url: "https://example.com/weather-cli",
    thumbnail: "/assets/thumbnails/weather-cli.png",
    tags: ["Node.js", "CLI"],
  },
];

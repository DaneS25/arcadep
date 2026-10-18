import type { Project } from "@/content/types";

/** Thumbnails are placeholders until screenshots are added under `public/assets/thumbnails/`. */
export const projects: readonly Project[] = [
  {
    id: "arcade-portfolio",
    title: "Arcade Portfolio",
    description:
      "This building: a three.js portfolio made by a team of AI agents, with me as product owner.",
    url: "https://github.com/DaneS25/arcadep",
    thumbnail: "/assets/thumbnails/arcade-portfolio.png",
    tags: ["three.js", "TypeScript", "AI agents"],
  },
  {
    id: "budget-app",
    title: "Budget App",
    description:
      "A personal budget tracker that answers one question: am I on track this month? Expenses, monthly category budgets and spent vs budget, stored in the browser.",
    url: "https://github.com/DaneS25/project-1",
    thumbnail: "/assets/thumbnails/budget-app.png",
    tags: ["React", "TypeScript", "Vite"],
  },
  {
    id: "streetle",
    title: "Streetle",
    description:
      "A geography guessing game in the spirit of GeoGuessr and Wordle: guess where you are from a Google Street View scene.",
    url: "https://streetle-29d87.web.app/",
    thumbnail: "/assets/thumbnails/streetle.png",
    tags: ["React", "Google Street View"],
  },
  {
    id: "five-card-poker",
    title: "5 Card Poker",
    description:
      "A multiplayer five-card draw game: one chance to swap cards, then a heads-up showdown.",
    url: "https://dane-poker.web.app/",
    thumbnail: "/assets/thumbnails/five-card-poker.png",
    tags: ["React", "Firebase"],
  },
  {
    id: "coming-soon-1",
    title: "Coming soon",
    description: "Something new is on the way.",
    url: "https://github.com/DaneS25",
    thumbnail: "/assets/thumbnails/coming-soon-1.png",
    tags: ["Soon"],
  },
  {
    id: "coming-soon-2",
    title: "Coming soon",
    description: "Something new is on the way.",
    url: "https://github.com/DaneS25",
    thumbnail: "/assets/thumbnails/coming-soon-2.png",
    tags: ["Soon"],
  },
];

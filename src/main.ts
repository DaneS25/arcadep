import "@/ui/base.css";
import { startApp } from "@/app/app";
import { paletteCssVars } from "@/logic/palette";
import { showStartError } from "@/ui/startError";

const root = document.querySelector<HTMLElement>("#app");

if (root === null) {
  throw new Error("index.html is missing the #app element");
}

for (const { name, value } of paletteCssVars()) {
  document.documentElement.style.setProperty(name, value);
}

const started = startApp(root);

if (started.ok) {
  const { app } = started;
  // pagehide (not unload) also fires on mobile and with the back/forward cache;
  // a persisted page keeps its scene so it can be shown again.
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) app.dispose();
  });
} else {
  showStartError(root, started.reason);
}

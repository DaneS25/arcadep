import "@/ui/base.css";
import { startApp } from "@/app/app";
import { loadContent } from "@/content/index";
import { fontCssVars } from "@/logic/assetManifest";
import { paletteCssVars } from "@/logic/palette";
import { hideWhenSettled, mountLoadingScreen } from "@/ui/loadingScreen";
import { showStartError } from "@/ui/startError";

const root = document.querySelector<HTMLElement>("#app");

if (root === null) {
  throw new Error("index.html is missing the #app element");
}

for (const { name, value } of [...paletteCssVars(), ...fontCssVars()]) {
  document.documentElement.style.setProperty(name, value);
}

const loadingScreen = mountLoadingScreen(document);

// Validated once at start-up; a bad entry is skipped with a warning, never a crash.
const content = loadContent((message) => {
  console.warn(message);
});

const started = startApp(root, {
  onLoadProgress(ratio) {
    loadingScreen.setProgress(ratio);
  },
  warn(message) {
    console.warn(message);
  },
  content,
});

if (started.ok) {
  const { app } = started;
  // pagehide (not unload) also fires on mobile and with the back/forward cache;
  // a persisted page keeps its scene so it can be shown again.
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) app.dispose();
  });
  hideWhenSettled(
    loadingScreen,
    app.assets,
    () => app.reducedMotion.value,
    window,
  );
} else {
  loadingScreen.remove();
  showStartError(root, started.reason);
}

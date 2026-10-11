import "./loadingScreen.css";
import { progressPercent } from "@/logic/assetFallback";

export const LOADING_SCREEN_ID = "loading-screen";

/** How long the fade-out lasts; matches `.loading-screen` in `loadingScreen.css`. */
export const LOADING_FADE_MS = 400;

/** Hides the loading screen after this long even if loading never settles, so a hung request can't trap the visitor. */
export const LOADING_TIMEOUT_MS = 15_000;

export type LoadingScreen = {
  readonly element: HTMLElement;
  /** Shows progress from 0 to 1. */
  setProgress(ratio: number): void;
  /** Fades the screen out (or removes it at once under reduced motion), then removes it. */
  hide(reducedMotion: boolean): Promise<void>;
  /** Removes the screen at once. */
  remove(): void;
};

/** Builds the loading screen markup (the same markup `index.html` ships so it shows before any script runs). */
export function createLoadingScreenElement(doc: Document): HTMLElement {
  const screen = doc.createElement("div");
  screen.id = LOADING_SCREEN_ID;
  screen.className = "loading-screen";

  const title = doc.createElement("p");
  title.className = "loading-screen__title";
  title.setAttribute("aria-hidden", "true");
  title.textContent = "LOADING";

  const bar = doc.createElement("div");
  bar.className = "loading-screen__bar";
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", "Loading the arcade");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.setAttribute("aria-valuenow", "0");
  const fill = doc.createElement("div");
  fill.className = "loading-screen__fill";
  bar.append(fill);

  const percent = doc.createElement("p");
  percent.className = "loading-screen__percent";
  percent.setAttribute("aria-hidden", "true");
  percent.textContent = "0%";

  screen.append(title, bar, percent);
  return screen;
}

/** Takes over the loading screen from `index.html`, or adds one to the body if it is missing. */
export function mountLoadingScreen(doc: Document): LoadingScreen {
  let element = doc.getElementById(LOADING_SCREEN_ID);
  if (element === null) {
    element = createLoadingScreenElement(doc);
    doc.body.append(element);
  }
  const screen = element;
  const bar = screen.querySelector(".loading-screen__bar");
  const percent = screen.querySelector(".loading-screen__percent");

  const remove = (): void => {
    screen.remove();
  };

  return {
    element: screen,
    setProgress(ratio) {
      const value = progressPercent(ratio);
      screen.style.setProperty("--progress", String(value / 100));
      bar?.setAttribute("aria-valuenow", String(value));
      if (percent !== null) percent.textContent = `${String(value)}%`;
    },
    hide(reducedMotion) {
      if (reducedMotion || !screen.isConnected) {
        remove();
        return Promise.resolve();
      }
      screen.classList.add("loading-screen--done");
      // Removed on a timer rather than on transitionend, which never fires if the
      // transition is skipped (hidden tab, no CSS).
      return new Promise((resolve) => {
        const win = doc.defaultView;
        if (win === null) {
          remove();
          resolve();
          return;
        }
        win.setTimeout(() => {
          remove();
          resolve();
        }, LOADING_FADE_MS);
      });
    },
    remove,
  };
}

/**
 * Hides the screen one frame after `settled` resolves (so the scene has drawn),
 * or after `timeoutMs` if it never does, whichever comes first.
 */
export function hideWhenSettled(
  screen: LoadingScreen,
  settled: Promise<unknown>,
  reducedMotion: () => boolean,
  win: Window,
  timeoutMs = LOADING_TIMEOUT_MS,
): void {
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    win.clearTimeout(timer);
    void screen.hide(reducedMotion());
  };
  const timer = win.setTimeout(finish, timeoutMs);
  void settled.then(() => {
    if (done) return;
    screen.setProgress(1);
    win.requestAnimationFrame(finish);
  });
}

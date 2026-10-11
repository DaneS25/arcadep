import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import indexHtml from "../../index.html?raw";
import {
  LOADING_FADE_MS,
  LOADING_SCREEN_ID,
  LOADING_TIMEOUT_MS,
  createLoadingScreenElement,
  hideWhenSettled,
  mountLoadingScreen,
} from "./loadingScreen";

/** Tag, sorted attributes and own text of an element and its descendants, ignoring whitespace. */
function shape(element: Element): string[] {
  return [element, ...element.querySelectorAll("*")].map((node) => {
    const attributes = [...node.attributes]
      .map(({ name, value }) => `${name}=${value}`)
      .sort()
      .join(" ");
    const text = [...node.childNodes]
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent?.trim() ?? "")
      .join("");
    return `${node.tagName} ${attributes} ${text}`;
  });
}

describe("index.html", () => {
  it("ships the same loading screen markup the script builds", () => {
    const page = new DOMParser().parseFromString(indexHtml, "text/html");
    const shipped = page.getElementById(LOADING_SCREEN_ID);
    if (shipped === null) throw new Error("index.html has no loading screen");

    expect(shape(shipped)).toEqual(shape(createLoadingScreenElement(document)));
  });
});

function progressbar(): Element | null {
  return document.querySelector('[role="progressbar"]');
}

describe("mountLoadingScreen", () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("takes over the screen already in the page instead of adding a second one", () => {
    document.body.append(createLoadingScreenElement(document));

    mountLoadingScreen(document);

    expect(document.querySelectorAll(`#${LOADING_SCREEN_ID}`)).toHaveLength(1);
  });

  it("adds the screen when the page has none", () => {
    mountLoadingScreen(document);

    expect(document.getElementById(LOADING_SCREEN_ID)).not.toBeNull();
  });

  it("starts at 0% with a labelled progress bar", () => {
    mountLoadingScreen(document);

    expect(progressbar()?.getAttribute("aria-label")).toBe(
      "Loading the arcade",
    );
    expect(progressbar()?.getAttribute("aria-valuenow")).toBe("0");
    expect(document.body.textContent).toContain("0%");
  });

  it("shows progress as text and on the progress bar", () => {
    const screen = mountLoadingScreen(document);

    screen.setProgress(0.42);

    expect(progressbar()?.getAttribute("aria-valuenow")).toBe("42");
    expect(document.body.textContent).toContain("42%");
    expect(screen.element.style.getPropertyValue("--progress")).toBe("0.42");
  });

  it("removes the screen at once under reduced motion", async () => {
    const screen = mountLoadingScreen(document);

    await screen.hide(true);

    expect(document.getElementById(LOADING_SCREEN_ID)).toBeNull();
  });

  it("fades out and then removes the screen", async () => {
    vi.useFakeTimers();
    const screen = mountLoadingScreen(document);

    const hidden = screen.hide(false);

    expect(screen.element.classList.contains("loading-screen--done")).toBe(
      true,
    );
    expect(screen.element.isConnected).toBe(true);
    await vi.advanceTimersByTimeAsync(LOADING_FADE_MS);
    await hidden;
    expect(screen.element.isConnected).toBe(false);
  });

  it("removes the screen when start-up fails", () => {
    const screen = mountLoadingScreen(document);

    screen.remove();

    expect(document.getElementById(LOADING_SCREEN_ID)).toBeNull();
  });
});

describe("hideWhenSettled", () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides the screen a frame after loading settles", async () => {
    const screen = mountLoadingScreen(document);

    hideWhenSettled(screen, Promise.resolve(), () => true, window);
    await Promise.resolve();
    expect(screen.element.isConnected).toBe(true);
    vi.advanceTimersToNextFrame();

    expect(screen.element.isConnected).toBe(false);
  });

  it("hides the screen after the timeout when loading never settles", async () => {
    const screen = mountLoadingScreen(document);

    hideWhenSettled(
      screen,
      new Promise<never>(() => undefined),
      () => true,
      window,
    );
    await vi.advanceTimersByTimeAsync(LOADING_TIMEOUT_MS - 1);
    expect(screen.element.isConnected).toBe(true);
    await vi.advanceTimersByTimeAsync(1);

    expect(screen.element.isConnected).toBe(false);
  });
});

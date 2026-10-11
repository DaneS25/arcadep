import { describe, expect, it } from "vitest";
import {
  createReducedMotion,
  REDUCED_MOTION_QUERY,
  type MotionQueryList,
} from "./reducedMotion";

type Listener = (event: { matches: boolean }) => void;

function fakeMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  const queries: string[] = [];
  const list: MotionQueryList = {
    matches: initial,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  return {
    matchMedia: (query: string) => {
      queries.push(query);
      return list;
    },
    queries,
    listeners,
    emit(matches: boolean) {
      for (const listener of listeners) listener({ matches });
    },
  };
}

describe("createReducedMotion", () => {
  it("reads the prefers-reduced-motion media query", () => {
    const media = fakeMatchMedia(false);
    createReducedMotion(media.matchMedia);
    expect(media.queries).toEqual([REDUCED_MOTION_QUERY]);
  });

  it("starts with the current preference", () => {
    expect(createReducedMotion(fakeMatchMedia(true).matchMedia).value).toBe(
      true,
    );
    expect(createReducedMotion(fakeMatchMedia(false).matchMedia).value).toBe(
      false,
    );
  });

  it("follows a change in the preference and tells subscribers", () => {
    const media = fakeMatchMedia(false);
    const setting = createReducedMotion(media.matchMedia);
    const seen: boolean[] = [];
    setting.subscribe((reduced) => seen.push(reduced));

    media.emit(true);

    expect(setting.value).toBe(true);
    expect(seen).toEqual([true]);
  });

  it("does not notify when the preference is unchanged", () => {
    const media = fakeMatchMedia(true);
    const setting = createReducedMotion(media.matchMedia);
    const seen: boolean[] = [];
    setting.subscribe((reduced) => seen.push(reduced));

    media.emit(true);

    expect(seen).toEqual([]);
  });

  it("stops notifying a subscriber after it unsubscribes", () => {
    const media = fakeMatchMedia(false);
    const setting = createReducedMotion(media.matchMedia);
    const seen: boolean[] = [];
    const unsubscribe = setting.subscribe((reduced) => seen.push(reduced));

    unsubscribe();
    media.emit(true);

    expect(seen).toEqual([]);
  });

  it("removes its media query listener on dispose", () => {
    const media = fakeMatchMedia(false);
    const setting = createReducedMotion(media.matchMedia);

    setting.dispose();

    expect(media.listeners.size).toBe(0);
  });
});

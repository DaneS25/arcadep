import "./panelLayer.css";
import type { AppMode } from "@/logic/appState";
import type { Side } from "@/logic/buildingLayout";
import { trapMove } from "@/logic/focusTrap";
import {
  CLOSE_HINT,
  CLOSE_LABEL,
  PANEL_PLACEHOLDER,
  PANEL_TITLES,
} from "./copy";

/** What a side's panel shows: a heading and the body nodes under it. */
export type PanelView = {
  readonly title: string;
  readonly body: readonly Node[];
};

/** Builds a side's panel content. The side tasks (10 to 13) supply real ones. */
export type PanelRenderer = (side: Side, doc: Document) => PanelView;

export type PanelLayer = {
  readonly element: HTMLDialogElement;
  /** The side whose panel is open, if any. */
  readonly openSide: Side | undefined;
  /** Shows or hides the panel to match the app state (`panel(side)` opens it). */
  sync(mode: AppMode): void;
  dispose(): void;
};

export type PanelLayerOptions = {
  /** Where the dialog is added. */
  parent: HTMLElement;
  /** Asked to close (Escape, the close button, a click on the backdrop); the app state machine decides. */
  onCloseRequest: () => void;
  /** Gets focus on close when the element that had it before opening is gone (or was the body). */
  fallbackFocus: () => HTMLElement | undefined;
  /** Panel content per side; defaults to `placeholderPanel`. */
  render?: PanelRenderer;
};

export const PANEL_TITLE_ID = "panel-title";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/** Placeholder content: the side's heading and a short note. */
export function placeholderPanel(side: Side, doc: Document): PanelView {
  const note = doc.createElement("p");
  note.className = "panel__placeholder";
  note.textContent = PANEL_PLACEHOLDER;
  return { title: PANEL_TITLES[side], body: [note] };
}

/**
 * The overlay panel layer: one native modal `<dialog>` that shows the open side's panel.
 * It follows the app state (`sync`) and never changes it; closing goes back through
 * `onCloseRequest`. Focus moves into the panel on open, is trapped there, and returns to
 * the element that had it (or `fallbackFocus`) on close. Under reduced motion there is no
 * fade (CSS).
 */
export function createPanelLayer(options: PanelLayerOptions): PanelLayer {
  const doc = options.parent.ownerDocument;
  const render = options.render ?? placeholderPanel;

  const dialog = doc.createElement("dialog");
  dialog.className = "panel";
  dialog.setAttribute("aria-labelledby", PANEL_TITLE_ID);

  const frame = doc.createElement("div");
  frame.className = "panel__frame";

  const header = doc.createElement("header");
  header.className = "panel__header";
  const title = doc.createElement("h2");
  title.className = "panel__title";
  title.id = PANEL_TITLE_ID;
  const close = doc.createElement("button");
  close.type = "button";
  close.className = "panel__close";
  const hint = doc.createElement("span");
  hint.className = "panel__hint";
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = CLOSE_HINT;
  close.append(CLOSE_LABEL, " ", hint);
  header.append(title, close);

  const body = doc.createElement("div");
  body.className = "panel__body";
  frame.append(header, body);
  dialog.append(frame);
  options.parent.append(dialog);

  let openSide: Side | undefined;
  let opener: HTMLElement | undefined;

  const show = (side: Side): void => {
    const view = render(side, doc);
    title.textContent = view.title;
    body.replaceChildren(...view.body);
    dialog.dataset.side = side;
    body.scrollTop = 0;
  };

  const restoreFocus = (): void => {
    const target =
      opener?.isConnected === true ? opener : options.fallbackFocus();
    opener = undefined;
    target?.focus();
  };

  const open = (side: Side): void => {
    const active = doc.activeElement;
    opener =
      active instanceof HTMLElement && active !== doc.body ? active : undefined;
    openSide = side;
    show(side);
    if (!dialog.open) dialog.showModal();
    close.focus();
  };

  const hide = (): void => {
    // Cleared first so the dialog's own close event knows this close was ours.
    openSide = undefined;
    delete dialog.dataset.side;
    if (dialog.open) dialog.close();
    restoreFocus();
  };

  const onCancel = (event: Event): void => {
    // Escape: leave the decision to the state machine instead of closing natively.
    event.preventDefault();
    if (openSide !== undefined) options.onCloseRequest();
  };

  const onClose = (): void => {
    // The browser closed the dialog by itself (a cancel it would not let us stop):
    // tidy up and tell the app so the state follows.
    if (openSide === undefined) return;
    openSide = undefined;
    delete dialog.dataset.side;
    restoreFocus();
    options.onCloseRequest();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey)
      return;
    const focusables = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const active = doc.activeElement;
    const current = focusables.findIndex((element) => element === active);
    const move = trapMove(current, focusables.length, event.shiftKey);
    if (move.kind === "native") return;
    event.preventDefault();
    if (move.kind === "move") focusables[move.index]?.focus();
  };

  const onClick = (event: MouseEvent): void => {
    // The frame fills the dialog, so only a click on the backdrop targets the dialog.
    if (event.target === dialog && openSide !== undefined) {
      options.onCloseRequest();
    }
  };

  const onCloseClick = (): void => {
    if (openSide !== undefined) options.onCloseRequest();
  };

  dialog.addEventListener("cancel", onCancel);
  dialog.addEventListener("close", onClose);
  dialog.addEventListener("keydown", onKeyDown);
  dialog.addEventListener("click", onClick);
  close.addEventListener("click", onCloseClick);

  return {
    element: dialog,
    get openSide() {
      return openSide;
    },
    sync(mode) {
      if (mode.kind === "panel") {
        if (openSide === undefined) open(mode.side);
        else if (openSide !== mode.side) {
          openSide = mode.side;
          show(mode.side);
        }
      } else if (openSide !== undefined) {
        hide();
      }
    },
    dispose() {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("keydown", onKeyDown);
      dialog.removeEventListener("click", onClick);
      close.removeEventListener("click", onCloseClick);
      openSide = undefined;
      opener = undefined;
      if (dialog.open) dialog.close();
      dialog.remove();
    },
  };
}

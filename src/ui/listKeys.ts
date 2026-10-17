import { listKeyCommand, listTarget } from "@/logic/listKeys";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/**
 * A panel's key handler for its list of item buttons (Skills and Projects, task 37): Up,
 * Down, Home and End choose an item wherever focus is in the panel, Left and Right while an
 * item has focus. The new item gets focus and is scrolled into view; the press is ours, so
 * the scene's arrow keys and the page's scrolling leave it alone. A text field keeps its keys.
 */
export function listKeyHandler(
  buttons: readonly HTMLElement[],
  chosen: () => number,
  choose: (index: number) => void,
): (event: KeyboardEvent) => void {
  return (event) => {
    const from = buttons.findIndex((button) => button === event.target);
    const focusedItem = from < 0 ? undefined : from;
    const command = listKeyCommand(event, {
      focusedItem,
      typing: isTyping(event.target),
    });
    if (command === undefined || buttons.length === 0) return;
    event.preventDefault();
    const target = listTarget(chosen(), buttons.length, command, focusedItem);
    choose(target);
    const button = buttons[target];
    if (button === undefined) return;
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: "nearest" });
  };
}

// Shared Vitest setup.

// jsdom has <dialog> and its `open` attribute but not showModal() or close(). This is a
// minimal stand-in: it toggles `open` and fires `close` like a browser (synchronously
// here). Focus moves and inertness are not emulated; the code under test does its own.
if (!("showModal" in HTMLDialogElement.prototype)) {
  Object.defineProperties(HTMLDialogElement.prototype, {
    show: {
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    showModal: {
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      value(this: HTMLDialogElement) {
        if (!this.open) return;
        this.open = false;
        this.dispatchEvent(new Event("close"));
      },
    },
  });
}

// jsdom lays nothing out, so it has no scrollIntoView(); a no-op lets tests spy on it.
if (!("scrollIntoView" in Element.prototype)) {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value() {
      // Nothing to scroll in jsdom.
    },
  });
}

/** Shows a readable message in place of the scene when it can't start (for example, no WebGL). */
export function showStartError(root: HTMLElement, reason: string): HTMLElement {
  const box = root.ownerDocument.createElement("section");
  box.className = "start-error";
  box.setAttribute("role", "alert");

  const heading = root.ownerDocument.createElement("h1");
  heading.textContent = "The 3D scene couldn't start";
  const body = root.ownerDocument.createElement("p");
  body.textContent =
    "This site needs WebGL. Try a recent desktop browser with hardware acceleration turned on.";
  const detail = root.ownerDocument.createElement("p");
  detail.className = "start-error__detail";
  detail.textContent = `Details: ${reason}`;

  box.append(heading, body, detail);
  root.replaceChildren(box);
  return box;
}

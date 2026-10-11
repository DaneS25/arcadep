const root = document.querySelector<HTMLElement>("#app");

if (root === null) {
  throw new Error("index.html is missing the #app element");
}

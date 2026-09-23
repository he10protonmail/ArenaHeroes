export function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}
export function toggle(id, visible) {
  document.getElementById(id)?.classList.toggle("hidden", !visible);
}
export function delegatedClick(root, selector, handler) {
  root.addEventListener("click", event => {
    const target = event.target.closest(selector);
    if (target) handler(target, event);
  });
}

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

// Keeps the legacy form markup compatible while the editor is migrated from
// "whip" to the public "push" ability name.
export function normalizeAbilityOptions(root = document) {
  const normalize = () => {
    root.querySelectorAll('select#unit-ability-type option, select#ue-ability option').forEach(option => {
      if (option.value === "whip") {
        option.value = "push";
        option.textContent = "Push";
      }
    });
  };

  normalize();
  const observer = new MutationObserver(normalize);
  observer.observe(root.body || root, { childList: true, subtree: true });
  return observer;
}

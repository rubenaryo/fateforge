// Generic recursive renderer. Turns any character object into a DOM tree.

const humanize = (key) =>
  key.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function renderValue(value) {
  if (value === null || value === undefined) {
    const span = document.createElement("span");
    span.className = "value empty";
    span.textContent = "—";
    return span;
  }

  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    const span = document.createElement("span");
    span.className = "value";
    span.textContent = String(value);
    return span;
  }

  if (Array.isArray(value)) {
    const ul = document.createElement("ul");
    ul.className = "list";
    for (const item of value) {
      const li = document.createElement("li");
      if (item && typeof item === "object" && "name" in item) {
        li.textContent =
          "value" in item ? `${item.name} (${item.value})` : String(item.name);
      } else {
        li.appendChild(renderValue(item));
      }
      ul.appendChild(li);
    }
    return ul;
  }

  if (typeof value === "object") {
    return renderGroup(value);
  }

  const span = document.createElement("span");
  span.className = "value";
  span.textContent = String(value);
  return span;
}

function renderGroup(obj) {
  const grid = document.createElement("div");
  grid.className = "group";
  for (const [key, val] of Object.entries(obj)) {
    const cell = document.createElement("div");
    cell.className = "cell";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = humanize(key);

    cell.appendChild(label);
    cell.appendChild(renderValue(val));
    grid.appendChild(cell);
  }
  return grid;
}

export function renderCharacter(character, mountEl) {
  mountEl.replaceChildren(renderGroup(character));
}

// Generic recursive renderer. Turns any character object into a DOM tree.
// Rolled entries ({ name, flavor?, stats?, value? }) render richly;
// everything else falls back to plain values / lists / nested groups.

const humanize = (key) =>
  key.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const isEntry = (v) =>
  v !== null && typeof v === "object" && typeof v.name === "string";

function statsChip(stats) {
  const wrap = document.createElement("span");
  wrap.className = "stats";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "stats-btn";
  btn.textContent = "details";

  const pop = document.createElement("span");
  pop.className = "stats-pop";
  for (const [k, v] of Object.entries(stats)) {
    const line = document.createElement("span");
    line.className = "stats-line";
    line.textContent = `${humanize(k)}: ${v}`;
    pop.appendChild(line);
  }

  wrap.append(btn, pop);
  return wrap;
}

function renderEntry(entry) {
  const wrap = document.createElement("div");
  wrap.className = "entry";

  const main = document.createElement("div");
  main.className = "value";
  main.textContent =
    entry.value !== undefined ? `${entry.name} (${entry.value})` : entry.name;
  if (entry.stats) main.appendChild(statsChip(entry.stats));
  wrap.appendChild(main);

  if (entry.flavor) {
    const flavor = document.createElement("div");
    flavor.className = "flavor";
    flavor.textContent = entry.flavor;
    wrap.appendChild(flavor);
  }

  return wrap;
}

function renderValue(value) {
  if (value === null || value === undefined) {
    const span = document.createElement("span");
    span.className = "value empty";
    span.textContent = "—";
    return span;
  }

  if (isEntry(value)) return renderEntry(value);

  if (Array.isArray(value)) {
    const ul = document.createElement("ul");
    ul.className = "list";
    for (const item of value) {
      const li = document.createElement("li");
      li.appendChild(renderValue(item));
      ul.appendChild(li);
    }
    return ul;
  }

  if (typeof value === "object") return renderGroup(value);

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

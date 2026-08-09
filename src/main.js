import { loadRegistry, missingSourceKeys } from "./registry.js";
import { rollCharacter } from "./roller.js";
import { renderCharacter } from "./render.js";

const els = {
  schema:    document.getElementById("schema-select"),
  dataset:   document.getElementById("dataset-select"),
  roll:      document.getElementById("roll-btn"),
  sheet:     document.getElementById("sheet"),
  warning:   document.getElementById("warning"),
  logToggle: document.getElementById("log-toggle"),
  logPanel:  document.getElementById("log-panel"),
  logList:   document.getElementById("log-list"),
};

let registry = null;
let currentSchema  = null;
let currentDataset = null;

function populateSelect(select, entries) {
  select.replaceChildren(
    ...entries.map((e) => {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = e.name;
      return opt;
    })
  );
}

function syncSelections() {
  currentSchema  = registry.schemas.find((s) => s.id === els.schema.value)  ?? null;
  currentDataset = registry.datasets.find((d) => d.id === els.dataset.value) ?? null;
}

function updateWarning() {
  if (!currentSchema || !currentDataset) return;
  const missing = missingSourceKeys(currentSchema, currentDataset);
  if (missing.length) {
    els.warning.textContent =
      `Dataset is missing sources required by schema: ${missing.join(", ")}. Some fields will not roll correctly.`;
    els.warning.hidden = false;
  } else {
    els.warning.textContent = "";
    els.warning.hidden = true;
  }
}

function renderLog(lines) {
  els.logList.replaceChildren(
    ...lines.map((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      return li;
    })
  );
}

function roll() {
  if (!currentSchema || !currentDataset) return;
  updateWarning();
  const { character, log } = rollCharacter(currentSchema, currentDataset);
  renderCharacter(character, els.sheet);
  renderLog(log);
}

async function init() {
  try {
    registry = await loadRegistry();

    populateSelect(els.schema,  registry.schemas);
    populateSelect(els.dataset, registry.datasets);
    syncSelections();

    els.schema.addEventListener("change",  () => { syncSelections(); roll(); });
    els.dataset.addEventListener("change", () => { syncSelections(); roll(); });
    els.roll.addEventListener("click", roll);
    els.logToggle.addEventListener("click", () => {
      els.logPanel.classList.toggle("open");
    });

    roll();
  } catch (err) {
    console.error(err);
    els.warning.textContent = `Error: ${err.message}`;
    els.warning.hidden = false;
  }
}

init();

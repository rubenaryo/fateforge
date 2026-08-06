import { loadRegistry, loadSchema, loadDataset } from "./registry.js";
import { rollCharacter } from "./roller.js";
import { renderCharacter } from "./render.js";

const els = {
  schema: document.getElementById("schema-select"),
  dataset: document.getElementById("dataset-select"),
  roll: document.getElementById("roll-btn"),
  sheet: document.getElementById("sheet"),
  status: document.getElementById("status"),
};

let registry = null;
let currentSchema = null;
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

async function syncSchema() {
  const entry = registry.schemas.find((s) => s.id === els.schema.value);
  currentSchema = await loadSchema(entry);
}

async function syncDataset() {
  const entry = registry.datasets.find((d) => d.id === els.dataset.value);
  currentDataset = await loadDataset(entry);
}

function roll() {
  if (!currentSchema || !currentDataset) return;
  const character = rollCharacter(currentSchema, currentDataset);
  renderCharacter(character, els.sheet);
  els.status.textContent = "";
}

async function init() {
  try {
    registry = await loadRegistry();
    populateSelect(els.schema, registry.schemas);
    populateSelect(els.dataset, registry.datasets);
    await Promise.all([syncSchema(), syncDataset()]);

    els.schema.addEventListener("change", async () => {
      await syncSchema();
      roll();
    });
    els.dataset.addEventListener("change", async () => {
      await syncDataset();
      roll();
    });
    els.roll.addEventListener("click", roll);

    roll();
  } catch (err) {
    console.error(err);
    els.status.textContent = `Error: ${err.message}`;
  }
}

init();

// Loads the registry and named schemas/datasets from /data.

const DATA_ROOT = "data";

async function fetchJson(path) {
  const res = await fetch(`${DATA_ROOT}/${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

export async function loadRegistry() {
  return fetchJson("index.json");
}

export async function loadSchema(entry) {
  return fetchJson(entry.path);
}

export async function loadDataset(entry) {
  return fetchJson(entry.path);
}

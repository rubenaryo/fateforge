const SCHEMA_ROOT  = "data/schemas";
const DATASET_ROOT = "data/datasets";
const INDEX_PATH   = "data/index.json";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

// Returns { schemas: [...], datasets: [...] } with each entry fully loaded.
export async function loadRegistry() {
  const index = await fetchJson(INDEX_PATH);

  const [schemas, datasets] = await Promise.all([
    Promise.all(index.schemas.map((f) => fetchJson(`${SCHEMA_ROOT}/${f}`))),
    Promise.all(index.datasets.map((f) => fetchJson(`${DATASET_ROOT}/${f}`))),
  ]);

  return { schemas, datasets };
}

function collectSources(fields, out = []) {
  for (const spec of Object.values(fields ?? {})) {
    if (spec.source) out.push(spec.source);
    if (spec.children) collectSources(spec.children, out);
  }
  return out;
}

export function missingSourceKeys(schema, dataset) {
  const required = collectSources(schema.fields);
  const available = new Set(Object.keys(dataset.sources ?? {}));
  return [...new Set(required)].filter((k) => !available.has(k));
}

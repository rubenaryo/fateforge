// Roll a character from a schema + dataset.
// Field types: roll, pick, pickMany, group, static. Unknown → placeholder.

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

const pickN = (arr, n) => {
  const pool = arr.slice();
  const out = [];
  const take = Math.min(n, pool.length);
  for (let i = 0; i < take; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
};

function rollField(spec, sources) {
  switch (spec.type) {
    case "roll":
      return randInt(spec.min, spec.max);

    case "pick": {
      const pool = sources[spec.source];
      if (!pool || !pool.length) return `[missing source: ${spec.source}]`;
      return pickOne(pool);
    }

    case "pickMany": {
      const pool = sources[spec.source];
      if (!pool || !pool.length) return `[missing source: ${spec.source}]`;
      const picks = pickN(pool, spec.count ?? 1);
      if (spec.withValue) {
        return picks.map((name) => ({
          name,
          value: randInt(spec.withValue.min, spec.withValue.max),
        }));
      }
      return picks;
    }

    case "group": {
      const out = {};
      for (const [key, child] of Object.entries(spec.children ?? {})) {
        out[key] = rollField(child, sources);
      }
      return out;
    }

    case "static":
      return spec.value;

    default:
      return `[unsupported: ${spec.type}]`;
  }
}

export function rollCharacter(schema, dataset) {
  const sources = dataset.sources ?? {};
  const character = {};
  for (const [key, spec] of Object.entries(schema.fields ?? {})) {
    character[key] = rollField(spec, sources);
  }
  return character;
}

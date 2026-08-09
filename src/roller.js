// Roll a character from a schema + dataset.
// Field types: roll, pick, pickMany, group, static. Unknown → placeholder.
//
// Dataset entries may be plain strings or objects:
//   { name, flavor?, stats?, weight?, requires? }
// - flavor: descriptive text shown under the name
// - stats:  key/value map (damage, armor, etc.) shown on hover
// - weight: relative pick probability (default 1)
// - requires: { "<field path>": [allowed names] } — filters this entry
//   against fields already rolled, e.g. { "class": ["Fighter", "Paladin"] }.
//   Fields roll in schema order, so later picks can depend on earlier results.

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const normalize = (e) => (typeof e === "string" ? { name: e } : e);

const resolvePath = (obj, path) =>
  path.split(".").reduce((v, k) => (v == null ? v : v[k]), obj);

const nameOf = (v) => (v !== null && typeof v === "object" ? v.name : v);

function toResult(entry) {
  const out = { name: entry.name };
  if (entry.flavor) out.flavor = entry.flavor;
  if (entry.stats) out.stats = entry.stats;
  return out;
}

function satisfies(entry, character) {
  return Object.entries(entry.requires ?? {}).every(([path, allowed]) => {
    const rolled = nameOf(resolvePath(character, path));
    return rolled === undefined || allowed.includes(rolled);
  });
}

// Resolve a source into a normalized pool, applying entry requirements.
function selectPool(spec, ctx, label) {
  const raw = ctx.sources[spec.source];
  if (!raw || !raw.length) {
    ctx.log.push(`${label}: source "${spec.source}" missing from dataset`);
    return null;
  }
  const pool = raw.map(normalize);
  const filtered = pool.filter((e) => satisfies(e, ctx.character));
  if (!filtered.length) {
    ctx.log.push(
      `${label}: all ${pool.length} entries in "${spec.source}" excluded by requirements — using full pool`
    );
    return pool;
  }
  if (filtered.length < pool.length) {
    ctx.log.push(
      `${label}: requirements narrowed "${spec.source}" ${pool.length} → ${filtered.length}`
    );
  }
  return filtered;
}

function pickFrom(pool) {
  if (pool.some((e) => e.weight !== undefined)) {
    const total = pool.reduce((s, e) => s + (e.weight ?? 1), 0);
    let r = Math.random() * total;
    for (const e of pool) {
      r -= e.weight ?? 1;
      if (r < 0) return e;
    }
    return pool[pool.length - 1];
  }
  return pool[randInt(0, pool.length - 1)];
}

function rollField(spec, ctx, label) {
  switch (spec.type) {
    case "roll": {
      const n = randInt(spec.min, spec.max);
      ctx.log.push(`${label}: rolling random number in [${spec.min}, ${spec.max}] → ${n}`);
      return n;
    }

    case "pick": {
      const pool = selectPool(spec, ctx, label);
      if (!pool) return `[missing source: ${spec.source}]`;
      const weighted = pool.some((e) => e.weight !== undefined);
      const entry = pickFrom(pool);
      ctx.log.push(
        `${label}: picking from "${spec.source}" (${pool.length} entries${weighted ? ", weighted" : ""}) → ${entry.name}`
      );
      return toResult(entry);
    }

    case "pickMany": {
      const pool = selectPool(spec, ctx, label);
      if (!pool) return `[missing source: ${spec.source}]`;
      const working = pool.slice();
      const take = Math.min(spec.count ?? 1, working.length);
      const out = [];
      for (let i = 0; i < take; i++) {
        const entry = pickFrom(working);
        working.splice(working.indexOf(entry), 1);
        const res = toResult(entry);
        if (spec.withValue) res.value = randInt(spec.withValue.min, spec.withValue.max);
        out.push(res);
      }
      const shown = out.map((e) => (e.value !== undefined ? `${e.name} (${e.value})` : e.name));
      ctx.log.push(
        `${label}: picking ${take} from "${spec.source}" (${pool.length} entries)` +
          (spec.withValue ? ` with values in [${spec.withValue.min}, ${spec.withValue.max}]` : "") +
          ` → ${shown.join(", ")}`
      );
      return out;
    }

    case "static":
      ctx.log.push(`${label}: static value → ${spec.value}`);
      return spec.value;

    default:
      ctx.log.push(`${label}: unsupported field type "${spec.type}"`);
      return `[unsupported: ${spec.type}]`;
  }
}

// Groups are assigned into the character before their children roll,
// so children (and later fields) can reference partial results by path.
function rollFields(fields, target, ctx, prefix) {
  for (const [key, spec] of Object.entries(fields ?? {})) {
    const label = prefix ? `${prefix}.${key}` : key;
    if (spec.type === "group") {
      target[key] = {};
      rollFields(spec.children, target[key], ctx, label);
    } else {
      target[key] = rollField(spec, ctx, label);
    }
  }
}

export function rollCharacter(schema, dataset) {
  const ctx = { character: {}, sources: dataset.sources ?? {}, log: [] };
  ctx.log.push(`generating with schema "${schema.name}" + dataset "${dataset.name}"`);
  rollFields(schema.fields, ctx.character, ctx, "");
  return { character: ctx.character, log: ctx.log };
}

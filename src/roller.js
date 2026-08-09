// Roll a character from a schema + dataset.
//
// Field types:
//   roll     { min, max }                        → integer
//   pick     { source }                          → one entry
//   pickMany { source, count, withValue? }       → N distinct entries
//   group    { children }                        → nested object
//   static   { value }                           → literal
//   formula  { expr }                            → number via expression engine
//              e.g. "max(1, 1d8 + @abilities.toughness)", "dice(@class.silver_dice, 6) * 10"
//   lookup   { expr, table: [{min, max, value}] } → roll expr, map through range table
// Unknown types → placeholder (soft fail).
//
// Dataset entries may be plain strings or objects:
//   { name, flavor?, stats?, weight?, tags?, requires?, vars?, sub?, ...extra }
// - flavor: descriptive text shown under the name
// - stats:  key/value map (damage, armor, etc.) shown on hover
// - weight: relative pick probability (default 1)
// - tags:   labels other rolls can test via hasTag conditions
// - vars:   { key: expr } — evaluated at pick time; "{key}" placeholders in
//           name/flavor/stats are substituted (e.g. torch count from Presence)
// - sub:    { source } — nested pick appended to this entry (e.g. "a scroll: <which one>")
// - extra numeric/object fields survive into the result so formulas can
//   reference them (e.g. @class.hp_die)
//
// requires — filters an entry against fields already rolled. Two forms:
//   legacy map:  { "class": ["Fighter", "Paladin"] }
//   conditions:  [{ "path": "equipment", "hasTag": "scroll", "not": true }]
// Fields roll in schema order (groups attach before their children roll),
// so any later roll can depend on any earlier result.

import { evaluate } from "./formula.js";

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const normalize = (e) => (typeof e === "string" ? { name: e } : e);

const resolvePath = (obj, path) =>
  path.split(".").reduce((v, k) => (v == null ? v : v[k]), obj);

const nameOf = (v) => (v !== null && typeof v === "object" ? v.name : v);

const subst = (str, vars) =>
  typeof str === "string"
    ? str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
    : str;

function hasTag(v, tag) {
  if (v === null || typeof v !== "object") return false;
  if (Array.isArray(v)) return v.some((x) => hasTag(x, tag));
  if (Array.isArray(v.tags) && v.tags.includes(tag)) return true;
  return Object.values(v).some((x) => hasTag(x, tag));
}

function checkCondition(cond, character) {
  const v = resolvePath(character, cond.path);
  let ok;
  if (cond.hasTag !== undefined) {
    ok = hasTag(v, cond.hasTag);
  } else if (cond.anyOf) {
    const n = nameOf(v);
    ok = n === undefined || cond.anyOf.includes(n);
  } else {
    ok = v !== undefined;
  }
  return cond.not ? !ok : ok;
}

function satisfies(entry, character) {
  const req = entry.requires;
  if (!req) return true;
  if (Array.isArray(req)) return req.every((c) => checkCondition(c, character));
  return Object.entries(req).every(([path, allowed]) => {
    const rolled = nameOf(resolvePath(character, path));
    return rolled === undefined || allowed.includes(rolled);
  });
}

// Resolve a source into a normalized pool, applying entry requirements.
function selectPool(source, ctx, label) {
  const raw = ctx.sources[source];
  if (!raw || !raw.length) {
    ctx.log.push(`${label}: source "${source}" missing from dataset`);
    return null;
  }
  const pool = raw.map(normalize);
  const filtered = pool.filter((e) => satisfies(e, ctx.character));
  if (!filtered.length) {
    ctx.log.push(
      `${label}: all ${pool.length} entries in "${source}" excluded by requirements — using full pool`
    );
    return pool;
  }
  if (filtered.length < pool.length) {
    ctx.log.push(
      `${label}: requirements narrowed "${source}" ${pool.length} → ${filtered.length}`
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

// Turn a picked entry into a result: evaluate vars, substitute placeholders,
// resolve nested sub-picks. Everything except roll-time metadata survives.
function materialize(entry, ctx, label) {
  const res = {};
  for (const [k, v] of Object.entries(entry)) {
    if (k === "weight" || k === "requires" || k === "vars" || k === "sub") continue;
    res[k] = v;
  }

  if (entry.vars) {
    const vars = {};
    const shown = [];
    for (const [k, expr] of Object.entries(entry.vars)) {
      try {
        vars[k] = evaluate(expr, ctx.character).value;
        shown.push(`${k}=${vars[k]}`);
      } catch (err) {
        vars[k] = `?`;
        ctx.log.push(`${label}: var "${k}" (${expr}) failed — ${err.message}`);
      }
    }
    if (shown.length) ctx.log.push(`${label}: vars for ${entry.name}: ${shown.join(", ")}`);
    res.name = subst(res.name, vars);
    res.flavor = subst(res.flavor, vars);
    if (res.stats) {
      res.stats = Object.fromEntries(
        Object.entries(res.stats).map(([k, v]) => [k, subst(v, vars)])
      );
    }
  }

  if (entry.sub) {
    const pool = selectPool(entry.sub.source, ctx, label);
    if (pool) {
      const subEntry = pickFrom(pool);
      ctx.log.push(`${label}: sub-pick from "${entry.sub.source}" → ${subEntry.name}`);
      const subRes = materialize(subEntry, ctx, label);
      res.name = `${res.name}: ${subRes.name}`;
      if (subRes.flavor) res.flavor = subRes.flavor;
      if (subRes.stats) res.stats = { ...res.stats, ...subRes.stats };
      if (subRes.tags) res.tags = [...new Set([...(res.tags ?? []), ...subRes.tags])];
    }
  }

  return res;
}

function rollField(spec, ctx, label) {
  switch (spec.type) {
    case "roll": {
      const n = randInt(spec.min, spec.max);
      ctx.log.push(`${label}: rolling random number in [${spec.min}, ${spec.max}] → ${n}`);
      return n;
    }

    case "formula": {
      try {
        const { value, notes } = evaluate(spec.expr, ctx.character);
        ctx.log.push(
          `${label}: ${spec.expr} → ${value}${notes.length ? `  (${notes.join(", ")})` : ""}`
        );
        return value;
      } catch (err) {
        ctx.log.push(`${label}: formula "${spec.expr}" failed — ${err.message}`);
        return `[formula error: ${err.message}]`;
      }
    }

    case "lookup": {
      try {
        const { value: raw, notes } = evaluate(spec.expr, ctx.character);
        const rows = spec.table ?? [];
        const row =
          rows.find((r) => raw >= r.min && raw <= r.max) ??
          (raw < rows[0]?.min ? rows[0] : rows[rows.length - 1]);
        if (!row) throw new Error("empty lookup table");
        ctx.log.push(
          `${label}: lookup ${spec.expr} = ${raw} → ${row.value}${notes.length ? `  (${notes.join(", ")})` : ""}`
        );
        return row.value;
      } catch (err) {
        ctx.log.push(`${label}: lookup "${spec.expr}" failed — ${err.message}`);
        return `[lookup error: ${err.message}]`;
      }
    }

    case "pick": {
      const pool = selectPool(spec.source, ctx, label);
      if (!pool) return `[missing source: ${spec.source}]`;
      const weighted = pool.some((e) => e.weight !== undefined);
      const entry = pickFrom(pool);
      ctx.log.push(
        `${label}: picking from "${spec.source}" (${pool.length} entries${weighted ? ", weighted" : ""}) → ${entry.name}`
      );
      return materialize(entry, ctx, label);
    }

    case "pickMany": {
      const pool = selectPool(spec.source, ctx, label);
      if (!pool) return `[missing source: ${spec.source}]`;
      const working = pool.slice();
      const take = Math.min(spec.count ?? 1, working.length);
      const out = [];
      for (let i = 0; i < take; i++) {
        const entry = pickFrom(working);
        working.splice(working.indexOf(entry), 1);
        const res = materialize(entry, ctx, label);
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

// Tiny expression engine for schema formulas. No eval.
//
// Grammar:
//   expr   := term (('+' | '-') term)*
//   term   := factor (('*' | '/') factor)*
//   factor := number | dice | ref | func | '(' expr ')' | '-' factor
//   dice   := [N]dX[dlK]         e.g. d8, 3d6, 4d6dl1 (drop lowest K)
//   ref    := @path.to.field     resolved against the character rolled so far
//   func   := max(...) | min(...) | dice(n, sides)   — dynamic dice via refs
//
// evaluate() returns { value, notes } — notes record each die result and
// ref resolution so the generation log can show how a value was reached.

const DICE_RE = /^(\d*)d(\d+)(?:dl(\d+))?/;
const NUM_RE = /^\d+/;
const REF_RE = /^@[A-Za-z_][\w.]*/;
const IDENT_RE = /^[A-Za-z_]\w*/;

function tokenize(src) {
  const tokens = [];
  let s = src;
  while ((s = s.trimStart()).length) {
    let m;
    if ((m = s.match(DICE_RE)) && !/^[A-Za-z]/.test(s.slice(m[0].length))) {
      tokens.push({ type: "dice", n: m[1] ? +m[1] : 1, sides: +m[2], drop: m[3] ? +m[3] : 0 });
    } else if ((m = s.match(NUM_RE))) {
      tokens.push({ type: "num", value: +m[0] });
    } else if ((m = s.match(REF_RE))) {
      tokens.push({ type: "ref", path: m[0].slice(1) });
    } else if ((m = s.match(IDENT_RE))) {
      tokens.push({ type: "ident", name: m[0] });
    } else if ("+-*/(),".includes(s[0])) {
      m = [s[0]];
      tokens.push({ type: s[0] });
    } else {
      throw new Error(`bad token near "${s.slice(0, 12)}"`);
    }
    s = s.slice(m[0].length);
  }
  return tokens;
}

const resolvePath = (obj, path) =>
  path.split(".").reduce((v, k) => (v == null ? v : v[k]), obj);

function rollDice(n, sides, drop, notes) {
  if (!Number.isFinite(n) || !Number.isFinite(sides) || n < 1 || sides < 1) {
    throw new Error(`bad dice: ${n}d${sides}`);
  }
  const rolls = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * sides));
  const kept = drop ? [...rolls].sort((a, b) => a - b).slice(drop) : rolls;
  const total = kept.reduce((s, v) => s + v, 0);
  notes.push(`${n}d${sides}${drop ? `dl${drop}` : ""}=${total}${n > 1 ? ` [${rolls.join(",")}]` : ""}`);
  return total;
}

export function evaluate(expr, character) {
  const notes = [];
  const tokens = tokenize(expr);
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = (type) => {
    const t = tokens[pos];
    if (!t || t.type !== type) throw new Error(`expected ${type} in "${expr}"`);
    pos++;
    return t;
  };

  function factor() {
    const t = peek();
    if (!t) throw new Error(`unexpected end of "${expr}"`);
    if (t.type === "num") { pos++; return t.value; }
    if (t.type === "dice") { pos++; return rollDice(t.n, t.sides, t.drop, notes); }
    if (t.type === "ref") {
      pos++;
      const v = resolvePath(character, t.path);
      if (typeof v !== "number") throw new Error(`@${t.path} is not a number`);
      notes.push(`@${t.path}=${v}`);
      return v;
    }
    if (t.type === "ident") {
      pos++;
      eat("(");
      const args = [expr_()];
      while (peek()?.type === ",") { pos++; args.push(expr_()); }
      eat(")");
      switch (t.name) {
        case "max": return Math.max(...args);
        case "min": return Math.min(...args);
        case "dice": return rollDice(Math.round(args[0]), Math.round(args[1]), 0, notes);
        default: throw new Error(`unknown function "${t.name}"`);
      }
    }
    if (t.type === "(") { pos++; const v = expr_(); eat(")"); return v; }
    if (t.type === "-") { pos++; return -factor(); }
    throw new Error(`unexpected token in "${expr}"`);
  }

  function term() {
    let v = factor();
    while (peek()?.type === "*" || peek()?.type === "/") {
      const op = tokens[pos++].type;
      const r = factor();
      v = op === "*" ? v * r : Math.floor(v / r);
    }
    return v;
  }

  function expr_() {
    let v = term();
    while (peek()?.type === "+" || peek()?.type === "-") {
      const op = tokens[pos++].type;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  const value = expr_();
  if (pos < tokens.length) throw new Error(`trailing tokens in "${expr}"`);
  return { value, notes };
}

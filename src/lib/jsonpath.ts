/**
 * Minimal JSONPath for CRD additionalPrinterColumns (kubectl-style), e.g.
 *   .spec.replicas   .status.conditions[?(@.type=="Ready")].status   .spec.items[*].name   .metadata.labels.app\.kubernetes\.io/name
 * Returns all matches; callers join them with ",".
 */
export function jsonPath(obj: unknown, path: string): unknown[] {
  let p = path.trim();
  if (p.startsWith("{") && p.endsWith("}")) p = p.slice(1, -1);
  if (p.startsWith("$")) p = p.slice(1);
  const tokens = tokenize(p);
  let cur: unknown[] = [obj];
  for (const t of tokens) {
    const next: unknown[] = [];
    for (const v of cur) {
      if (v == null) continue;
      if (t.kind === "field") {
        const x = (v as any)[t.name];
        if (x !== undefined) next.push(x);
      } else if (t.kind === "index") {
        if (Array.isArray(v)) {
          const x = v[t.i < 0 ? v.length + t.i : t.i];
          if (x !== undefined) next.push(x);
        }
      } else if (t.kind === "all") {
        if (Array.isArray(v)) next.push(...v);
        else if (typeof v === "object") next.push(...Object.values(v as object));
      } else if (t.kind === "filter" && Array.isArray(v)) {
        next.push(...v.filter((e) => {
          const got = jsonPath(e, t.path)[0];
          return t.op === "==" ? String(got) === t.value : t.op === "!=" ? String(got) !== t.value : got !== undefined;
        }));
      }
    }
    cur = next;
  }
  return cur;
}

type Tok =
  | { kind: "field"; name: string }
  | { kind: "index"; i: number }
  | { kind: "all" }
  | { kind: "filter"; path: string; op: "==" | "!=" | "exists"; value: string };

function tokenize(p: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < p.length) {
    if (p[i] === ".") { i++; continue; }
    if (p[i] === "[") {
      const end = matchBracket(p, i);
      const inner = p.slice(i + 1, end).trim();
      i = end + 1;
      if (inner === "*") out.push({ kind: "all" });
      else if (/^-?\d+$/.test(inner)) out.push({ kind: "index", i: Number(inner) });
      else if (inner.startsWith("?(")) {
        const expr = inner.slice(2, -1).trim();
        const m = /^@(\S*?)\s*(==|!=)\s*['"]?(.*?)['"]?$/.exec(expr);
        if (m) out.push({ kind: "filter", path: m[1], op: m[2] as "==" | "!=", value: m[3] });
        else out.push({ kind: "filter", path: expr.replace(/^@/, ""), op: "exists", value: "" });
      } else out.push({ kind: "field", name: inner.replace(/^['"]|['"]$/g, "") });
      continue;
    }
    let name = "";
    while (i < p.length && p[i] !== "." && p[i] !== "[") {
      if (p[i] === "\\" && i + 1 < p.length) { name += p[i + 1]; i += 2; continue; }
      name += p[i++];
    }
    if (name === "*") out.push({ kind: "all" });
    else if (name) out.push({ kind: "field", name });
  }
  return out;
}

function matchBracket(p: string, start: number) {
  let depth = 0;
  for (let i = start; i < p.length; i++) {
    if (p[i] === "[") depth++;
    else if (p[i] === "]" && --depth === 0) return i;
  }
  return p.length;
}

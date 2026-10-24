/**
 * @file conditions.ts
 * @description Tiny deterministic condition + amount-expression language for rules (no eval, no I/O).
 * conditions: { factName: literal | { eq, ne, in, notIn, gt, gte, lt, lte, exists } }  (all keys must hold)
 * amounts:    { const: n } | { fact: name } | { add|sub|mul: [expr, ...] } | { div: [expr, expr] } | { taxOn: expr }
 * A fact that is needed but absent is reported as missing (never guessed).
 */
export interface CondResult { matched: boolean; missing: string[]; invalid: string[] }

const OPS = new Set(['eq', 'ne', 'in', 'notIn', 'gt', 'gte', 'lt', 'lte', 'exists']);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function getFact(facts: Record<string, unknown>, path: string): { found: boolean; value: unknown } {
  let cur: any = facts;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object' || !(part in cur)) return { found: false, value: undefined };
    cur = cur[part];
  }
  return cur === undefined || cur === null || cur === '' ? { found: false, value: undefined } : { found: true, value: cur };
}

export function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (isObj(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}

export function evalConditions(cond: unknown, facts: Record<string, unknown>): CondResult {
  const res: CondResult = { matched: true, missing: [], invalid: [] };
  if (cond == null) return res;
  if (!isObj(cond)) { res.matched = false; res.invalid.push('conditions-not-object'); return res; }
  for (const key of Object.keys(cond).sort()) {
    const want = cond[key];
    const f = getFact(facts, key);
    const spec: Record<string, unknown> = isObj(want) ? want : { eq: want };
    const ops = Object.keys(spec);
    if (!ops.length || ops.some(o => !OPS.has(o))) { res.matched = false; res.invalid.push(`bad-operator:${key}`); continue; }
    if ('exists' in spec) {
      if (f.found !== !!spec.exists) res.matched = false;
      if (ops.length === 1) continue;
    }
    if (!f.found) { if (spec.exists !== false) { res.matched = false; res.missing.push(`fact:${key}`); } continue; }
    const v = f.value;
    const num = (x: unknown) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : NaN);
    for (const op of ops) {
      const w = spec[op];
      let ok = true;
      if (op === 'eq') ok = canonical(v) === canonical(w);
      else if (op === 'ne') ok = canonical(v) !== canonical(w);
      else if (op === 'in') ok = Array.isArray(w) && w.some(x => canonical(x) === canonical(v));
      else if (op === 'notIn') ok = Array.isArray(w) && !w.some(x => canonical(x) === canonical(v));
      else if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
        const a = num(v), b = num(w);
        ok = Number.isFinite(a) && Number.isFinite(b) && (op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b);
      }
      if (!ok) res.matched = false;
    }
  }
  return res;
}

export interface ExprResult { value: number | null; missing: string[]; error?: string }

export function evalExpr(expr: unknown, facts: Record<string, unknown>, taxRate: number | null, depth = 0): ExprResult {
  if (depth > 8 || !isObj(expr)) return { value: null, missing: [], error: 'bad-expression' };
  const keys = Object.keys(expr);
  if (keys.length !== 1) return { value: null, missing: [], error: 'bad-expression' };
  const k = keys[0], arg = expr[k];
  if (k === 'const') return typeof arg === 'number' && Number.isFinite(arg) ? { value: arg, missing: [] } : { value: null, missing: [], error: 'bad-const' };
  if (k === 'fact') {
    if (typeof arg !== 'string') return { value: null, missing: [], error: 'bad-fact-name' };
    const f = getFact(facts, arg);
    if (!f.found) return { value: null, missing: [`fact:${arg}`] };
    const n = typeof f.value === 'number' ? f.value : Number(f.value);
    return Number.isFinite(n) ? { value: n, missing: [] } : { value: null, missing: [], error: `non-numeric-fact:${arg}` };
  }
  if (k === 'taxOn') {
    const inner = evalExpr(arg, facts, taxRate, depth + 1);
    if (inner.error || inner.value == null) return inner;
    if (taxRate == null) return { value: null, missing: ['taxRate'] };
    return { value: inner.value * taxRate, missing: inner.missing };
  }
  if (!Array.isArray(arg) || arg.length < 2 || (k === 'div' && arg.length !== 2) || !['add', 'sub', 'mul', 'div'].includes(k))
    return { value: null, missing: [], error: 'bad-expression' };
  const parts = arg.map(a => evalExpr(a, facts, taxRate, depth + 1));
  const missing = [...new Set(parts.flatMap(p => p.missing))];
  const err = parts.find(p => p.error)?.error;
  if (err) return { value: null, missing, error: err };
  if (parts.some(p => p.value == null)) return { value: null, missing };
  const vals = parts.map(p => p.value as number);
  if (k === 'add') return { value: vals.reduce((a, b) => a + b, 0), missing };
  if (k === 'sub') return { value: vals.slice(1).reduce((a, b) => a - b, vals[0]), missing };
  if (k === 'mul') return { value: vals.reduce((a, b) => a * b, 1), missing };
  if (vals[1] === 0) return { value: null, missing, error: 'division-by-zero' };
  return { value: vals[0] / vals[1], missing };
}

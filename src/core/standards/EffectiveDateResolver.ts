/**
 * @file EffectiveDateResolver.ts
 * @description Pure, deterministic version/effective-date logic (SI-4). No I/O.
 * Never relies on insertion order: candidates are sorted explicitly.
 */
import { Versioned, isIsoDate } from './standardsTypes';

export type ResolveResult<T> =
  | { status: 'RESOLVED'; item: T }
  | { status: 'NONE' }
  | { status: 'CONFLICT'; items: T[] };

export interface ResolveOptions {
  /** Version identifiers (`${id}@${version}`) the entity explicitly opted into for early adoption. */
  earlyAdoptionOptIn?: ReadonlySet<string>;
}

export const versionKey = (id: string, version: number) => `${id}@${version}`;

export function isEffectiveOn(v: Versioned, date: string): boolean {
  if (!isIsoDate(date)) return false;
  return v.effectiveFrom <= date && (v.effectiveTo == null || date <= v.effectiveTo);
}

/** Early adoption applies only when the version allows it AND the entity opted in explicitly. */
export function isEarlyAdoptedOn(v: Versioned, id: string, date: string, opts?: ResolveOptions): boolean {
  if (!v.earlyAdoptionAllowed || !opts?.earlyAdoptionOptIn?.has(versionKey(id, v.version))) return false;
  const from = v.earlyAdoptionFrom || v.effectiveFrom;
  return isIsoDate(date) && date >= from && date < v.effectiveFrom;
}

/**
 * Pick the single version of ONE logical item (same id) that applies on `date`.
 * Two different effective versions with the same version number cannot be told apart => CONFLICT.
 */
export function resolveVersion<T extends Versioned>(
  id: string, candidates: T[], date: string, opts?: ResolveOptions,
): ResolveResult<T> {
  if (!isIsoDate(date)) return { status: 'NONE' };
  const live = candidates.filter(c => isEffectiveOn(c, date) || isEarlyAdoptedOn(c, id, date, opts));
  if (!live.length) return { status: 'NONE' };
  const top = Math.max(...live.map(c => c.version));
  const best = live.filter(c => c.version === top);
  return best.length === 1 ? { status: 'RESOLVED', item: best[0] } : { status: 'CONFLICT', items: best };
}

/** Basic validity of a version window. Returns an error string or null. */
export function validateWindow(v: Versioned): string | null {
  if (!Number.isInteger(v.version) || v.version < 1) return 'version must be a positive integer';
  if (!isIsoDate(v.effectiveFrom)) return 'effectiveFrom must be YYYY-MM-DD';
  if (v.effectiveTo != null && !isIsoDate(v.effectiveTo)) return 'effectiveTo must be YYYY-MM-DD or null';
  if (v.effectiveTo != null && v.effectiveTo < v.effectiveFrom) return 'effectiveTo is before effectiveFrom';
  if (v.earlyAdoptionFrom != null && (!isIsoDate(v.earlyAdoptionFrom) || v.earlyAdoptionFrom >= v.effectiveFrom))
    return 'earlyAdoptionFrom must be a date before effectiveFrom';
  return null;
}

/**
 * History protection: a new version of the same logical item must not overlap any existing version's window,
 * must not reuse a version number, and must not rewrite the past (never overwrite historical rules).
 */
export function validateNewVersion<T extends Versioned>(existing: T[], incoming: T): string | null {
  const w = validateWindow(incoming);
  if (w) return w;
  for (const e of existing) {
    if (e.version === incoming.version) return `version ${incoming.version} already exists (history is immutable)`;
    const eEnd = e.effectiveTo ?? '9999-12-31';
    const iEnd = incoming.effectiveTo ?? '9999-12-31';
    if (incoming.effectiveFrom <= eEnd && e.effectiveFrom <= iEnd)
      return `effective window overlaps version ${e.version} (${e.effectiveFrom}..${e.effectiveTo ?? 'open'})`;
  }
  return null;
}

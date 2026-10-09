/**
 * @file pgDate.ts
 * @description node-postgres returns a DATE column as a JS Date at LOCAL midnight. Turning it into text with String(date).slice(0, 10)
 * gives garbage ("Fri Oct 09") and toISOString() shifts the day for servers ahead of UTC (e.g. Egypt). Local calendar parts are the only
 * correct reading. Plain strings (YYYY-MM-DD...) pass through unchanged.
 */
export function pgDateToYmd(v: unknown): string {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
}

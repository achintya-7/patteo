/** First visible row so `cursor` stays inside a window of `view` rows over `total`. */
export function keepVisible(cursor: number, start: number, view: number, total: number): number {
  if (total <= view) return 0;
  const clamped = Math.max(0, Math.min(cursor, total - 1));
  let next = start;
  if (clamped < next) next = clamped;
  else if (clamped >= next + view) next = clamped - view + 1;
  return Math.max(0, Math.min(next, total - view));
}

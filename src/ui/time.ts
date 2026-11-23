export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  const ts = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ts)) return "";
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(ts).toISOString().slice(0, 10);
}

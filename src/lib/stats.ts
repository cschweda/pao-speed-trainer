// Linear-interpolated quantile, ported verbatim from the original.
export function quantile(arr: number[], q: number): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const b = Math.floor(pos);
  const rest = pos - b;
  return s[b + 1] !== undefined ? s[b] + rest * (s[b + 1] - s[b]) : s[b];
}

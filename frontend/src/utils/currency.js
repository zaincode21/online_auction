/** Format amounts as Rwandan Francs, e.g. RWF 15,000 */
export function formatRwf(amount, options = {}) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 'RWF 0';
  return `RWF ${n.toLocaleString('en-US', options)}`;
}

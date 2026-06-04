// Bridge for vanilla modules to raise a toast via the Alpine `toast` store.
// Kept separate from entrypoint.ts to avoid an import cycle.
export function showToast(msg: string): void {
  const A = (window as unknown as { Alpine?: { store(name: string): { show(m: string): void } } }).Alpine;
  if (A) A.store('toast').show(msg);
}

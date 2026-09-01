export const STYLUS_HOLD_MS = 800;

export function stylusHoldProgress(startedAt: number, now: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now) || now <= startedAt) return 0;
  return Math.min(1, Math.max(0, (now - startedAt) / STYLUS_HOLD_MS));
}

export function stylusReadyToDrop(startedAt: number, now: number): boolean {
  return stylusHoldProgress(startedAt, now) >= 1;
}

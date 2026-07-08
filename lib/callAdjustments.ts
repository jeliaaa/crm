// Manual one-off corrections to the call (status-change) counts, keyed by
// Tbilisi date (YYYY-MM-DD). Used to account for calls made before automatic
// logging was in place. Pinned to specific dates so they never carry forward.

export const CALL_ADJUSTMENTS: Record<string, number> = {
  '2026-07-08': 15,
};

export function callAdjustment(dateYmd: string): number {
  return CALL_ADJUSTMENTS[dateYmd] ?? 0;
}

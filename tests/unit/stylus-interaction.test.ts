import { describe, expect, it } from "vitest";
import { STYLUS_HOLD_MS, stylusHoldProgress, stylusReadyToDrop } from "@/shared/focus/stylus";

describe("immersive stylus hold", () => {
  it("does not start before the deliberate hold finishes", () => {
    expect(stylusHoldProgress(1_000, 1_000)).toBe(0);
    expect(stylusHoldProgress(1_000, 1_000 + STYLUS_HOLD_MS / 2)).toBe(0.5);
    expect(stylusReadyToDrop(1_000, 1_000 + STYLUS_HOLD_MS - 1)).toBe(false);
  });

  it("drops at the threshold and clamps delayed frames", () => {
    expect(stylusReadyToDrop(1_000, 1_000 + STYLUS_HOLD_MS)).toBe(true);
    expect(stylusHoldProgress(1_000, 9_000)).toBe(1);
  });
});

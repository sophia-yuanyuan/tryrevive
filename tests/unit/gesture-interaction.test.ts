import { describe, expect, it } from "vitest";
import {
  createGestureInteractionState,
  gestureHoldProgress,
  interpretGesture
} from "@/shared/gesture/interaction";
import type { RitualHandFeatures } from "@/shared/gesture/landmark-features";

function features(overrides: Partial<RitualHandFeatures> = {}): RitualHandFeatures {
  return {
    valid: true,
    cursor: { x: 0.42, y: 0.58 },
    pinchRatio: 0.8,
    worldPinchRatio: null,
    palmScale: 120,
    openPalm: false,
    ...overrides
  };
}

describe("ritual gesture interaction", () => {
  it("requires a stable open palm and re-arms only after a real release", () => {
    const state = createGestureInteractionState();
    expect(
      interpretGesture(state, { features: features({ openPalm: true }), timestamp: 0 })
    ).toEqual([]);
    expect(
      interpretGesture(state, { features: features({ openPalm: true }), timestamp: 299 })
    ).toEqual([]);
    expect(
      interpretGesture(state, { features: features({ openPalm: true }), timestamp: 300 })
    ).toEqual([{ type: "open" }]);
    expect(
      interpretGesture(state, { features: features({ openPalm: true }), timestamp: 900 })
    ).toEqual([]);

    interpretGesture(state, { features: features(), timestamp: 1_000 });
    interpretGesture(state, { features: features(), timestamp: 1_180 });
    interpretGesture(state, { features: features({ openPalm: true }), timestamp: 1_200 });
    expect(
      interpretGesture(state, { features: features({ openPalm: true }), timestamp: 1_500 })
    ).toEqual([{ type: "open" }]);
  });

  it("uses pinch and release holds with a hysteresis dead zone", () => {
    const state = createGestureInteractionState();
    const pinched = features({ pinchRatio: 0.2 });
    interpretGesture(state, { features: pinched, timestamp: 0 });
    expect(gestureHoldProgress(state, { features: pinched, timestamp: 119 })).toBeCloseTo(
      119 / 120
    );
    expect(interpretGesture(state, { features: pinched, timestamp: 119 })).toEqual([]);
    expect(interpretGesture(state, { features: pinched, timestamp: 120 })).toEqual([
      { type: "pointer_down", x: 0.42, y: 0.58 }
    ]);

    expect(
      interpretGesture(state, {
        features: features({ pinchRatio: 0.37, cursor: { x: 0.5, y: 0.5 } }),
        timestamp: 220
      })
    ).toEqual([{ type: "pointer_move", x: expect.any(Number), y: expect.any(Number) }]);

    const released = features({ pinchRatio: 0.6, cursor: { x: 0.6, y: 0.45 } });
    expect(interpretGesture(state, { features: released, timestamp: 300 })).toHaveLength(1);
    expect(interpretGesture(state, { features: released, timestamp: 439 })).toHaveLength(1);
    const releaseIntents = interpretGesture(state, { features: released, timestamp: 440 });
    expect(releaseIntents.map((intent) => intent.type)).toEqual(["pointer_move", "pointer_up"]);
  });

  it("does not turn a short tracking dropout into a release", () => {
    const state = createGestureInteractionState();
    const pinched = features({ pinchRatio: 0.2 });
    interpretGesture(state, { features: pinched, timestamp: 0 });
    interpretGesture(state, { features: pinched, timestamp: 120 });

    expect(interpretGesture(state, { features: null, timestamp: 200 })).toEqual([]);
    expect(interpretGesture(state, { features: null, timestamp: 649 })).toEqual([]);
    expect(interpretGesture(state, { features: null, timestamp: 650 })).toEqual([
      { type: "cancel" }
    ]);
    expect(interpretGesture(state, { features: null, timestamp: 900 })).toEqual([]);
  });

  it("does not carry an open-palm hold across a tracking dropout", () => {
    const state = createGestureInteractionState();
    const openPalm = features({ openPalm: true });
    interpretGesture(state, { features: openPalm, timestamp: 0 });
    interpretGesture(state, { features: openPalm, timestamp: 250 });
    interpretGesture(state, { features: null, timestamp: 260 });

    expect(interpretGesture(state, { features: openPalm, timestamp: 500 })).toEqual([]);
    expect(interpretGesture(state, { features: openPalm, timestamp: 799 })).toEqual([]);
    expect(interpretGesture(state, { features: openPalm, timestamp: 800 })).toEqual([
      { type: "open" }
    ]);
  });

  it("does not carry a pinch or release hold across a tracking dropout", () => {
    const state = createGestureInteractionState();
    const pinched = features({ pinchRatio: 0.2 });
    const released = features({ pinchRatio: 0.7 });

    interpretGesture(state, { features: pinched, timestamp: 0 });
    interpretGesture(state, { features: pinched, timestamp: 100 });
    interpretGesture(state, { features: null, timestamp: 110 });
    expect(interpretGesture(state, { features: pinched, timestamp: 200 })).toEqual([]);
    expect(interpretGesture(state, { features: pinched, timestamp: 320 })).toEqual([
      { type: "pointer_down", x: expect.any(Number), y: expect.any(Number) }
    ]);

    interpretGesture(state, { features: released, timestamp: 400 });
    interpretGesture(state, { features: released, timestamp: 500 });
    interpretGesture(state, { features: null, timestamp: 510 });
    expect(
      interpretGesture(state, { features: released, timestamp: 600 }).map((intent) => intent.type)
    ).toEqual(["pointer_move"]);
    expect(
      interpretGesture(state, { features: released, timestamp: 740 }).map((intent) => intent.type)
    ).toEqual(["pointer_move", "pointer_up"]);
  });

  it("ignores stale samples and prevents an immediate re-grab after release", () => {
    const state = createGestureInteractionState();
    const pinched = features({ pinchRatio: 0.2 });
    interpretGesture(state, { features: pinched, timestamp: 10 });
    expect(interpretGesture(state, { features: pinched, timestamp: 9 })).toEqual([]);
    interpretGesture(state, { features: pinched, timestamp: 130 });
    const released = features({ pinchRatio: 0.7 });
    interpretGesture(state, { features: released, timestamp: 200 });
    interpretGesture(state, { features: released, timestamp: 340 });

    interpretGesture(state, { features: pinched, timestamp: 400 });
    expect(interpretGesture(state, { features: pinched, timestamp: 530 })).toEqual([]);
    interpretGesture(state, { features: pinched, timestamp: 640 });
    expect(interpretGesture(state, { features: pinched, timestamp: 760 })).toEqual([
      { type: "pointer_down", x: expect.any(Number), y: expect.any(Number) }
    ]);
  });
});

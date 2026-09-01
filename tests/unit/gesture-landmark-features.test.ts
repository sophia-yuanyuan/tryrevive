import { describe, expect, it } from "vitest";
import { extractRitualHandFeatures, type HandLandmark } from "@/shared/gesture/landmark-features";

function openHand(): HandLandmark[] {
  return [
    { x: 0.5, y: 0.9 },
    { x: 0.42, y: 0.76 },
    { x: 0.35, y: 0.69 },
    { x: 0.29, y: 0.62 },
    { x: 0.23, y: 0.55 },
    { x: 0.36, y: 0.62 },
    { x: 0.35, y: 0.48 },
    { x: 0.34, y: 0.34 },
    { x: 0.33, y: 0.2 },
    { x: 0.46, y: 0.59 },
    { x: 0.46, y: 0.43 },
    { x: 0.46, y: 0.28 },
    { x: 0.46, y: 0.14 },
    { x: 0.56, y: 0.61 },
    { x: 0.57, y: 0.46 },
    { x: 0.58, y: 0.32 },
    { x: 0.59, y: 0.2 },
    { x: 0.66, y: 0.66 },
    { x: 0.69, y: 0.54 },
    { x: 0.71, y: 0.42 },
    { x: 0.73, y: 0.31 }
  ];
}

describe("ritual hand landmark features", () => {
  it("recognizes a full open palm and maps the mirrored cursor to the stage", () => {
    const result = extractRitualHandFeatures(openHand(), undefined, 640, 480);
    expect(result.valid).toBe(true);
    expect(result.openPalm).toBe(true);
    expect(result.pinchRatio).toBeGreaterThan(0.48);
    expect(result.cursor.x).toBeCloseTo((0.85 - 0.33) / 0.7);
  });

  it("normalizes a pinch by palm scale and preserves it when the image is doubled", () => {
    const hand = openHand();
    hand[4] = { x: 0.335, y: 0.205 };
    const regular = extractRitualHandFeatures(hand, undefined, 640, 480);
    const doubled = extractRitualHandFeatures(hand, undefined, 1280, 960);

    expect(regular.valid).toBe(true);
    expect(regular.pinchRatio).toBeLessThan(0.28);
    expect(doubled.pinchRatio).toBeCloseTo(regular.pinchRatio, 6);
  });

  it("keeps geometric classification consistent for a horizontally mirrored hand", () => {
    const hand = openHand();
    const mirrored = hand.map((point) => ({ ...point, x: 1 - point.x }));
    const left = extractRitualHandFeatures(hand, undefined, 640, 480);
    const right = extractRitualHandFeatures(mirrored, undefined, 640, 480);

    expect(right.valid).toBe(true);
    expect(right.openPalm).toBe(left.openPalm);
    expect(right.pinchRatio).toBeCloseTo(left.pinchRatio, 6);
  });

  it("rejects a cropped, tiny, incomplete, or non-finite hand", () => {
    const tiny = openHand().map((point) => ({
      x: 0.5 + (point.x - 0.5) * 0.08,
      y: 0.5 + (point.y - 0.5) * 0.08
    }));
    const cropped = openHand();
    cropped[9] = { x: 1.2, y: 0.5 };
    const nonFinite = openHand();
    nonFinite[8] = { x: Number.NaN, y: 0.2 };

    expect(extractRitualHandFeatures(tiny, undefined, 640, 480).valid).toBe(false);
    expect(extractRitualHandFeatures(cropped, undefined, 640, 480).valid).toBe(false);
    expect(extractRitualHandFeatures(nonFinite, undefined, 640, 480).valid).toBe(false);
    expect(extractRitualHandFeatures(openHand().slice(0, 20), undefined, 640, 480).valid).toBe(
      false
    );
  });

  it("uses world landmarks as an optional second pinch signal", () => {
    const hand = openHand();
    hand[4] = { x: 0.335, y: 0.205 };
    const world = hand.map((point) => ({ x: point.x, y: point.y, z: 0 }));
    world[4] = { ...world[4]!, z: 0.5 };
    const result = extractRitualHandFeatures(hand, world, 640, 480);

    expect(result.pinchRatio).toBeLessThan(0.28);
    expect(result.worldPinchRatio).toBeGreaterThan(0.32);
  });
});

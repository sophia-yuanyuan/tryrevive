import { describe, expect, it } from "vitest";
import {
  createGestureInteractionState,
  gestureHoldProgress,
  interpretGesture
} from "@/shared/gesture/interaction";

describe("gesture interaction state machine", () => {
  it("uses an open palm to rotate only after meaningful movement", () => {
    const state = createGestureInteractionState();
    expect(
      interpretGesture(state, { name: "Open_Palm", score: 0.9, palmX: 0.4, timestamp: 100 })
    ).toBeNull();
    expect(
      interpretGesture(state, { name: "Open_Palm", score: 0.9, palmX: 0.405, timestamp: 200 })
    ).toBeNull();
    expect(
      interpretGesture(state, { name: "Open_Palm", score: 0.9, palmX: 0.45, timestamp: 300 })
    ).toEqual({ type: "rotate", degrees: expect.closeTo(5.85, 2) });
  });

  it("requires a stable fist and a release before it can select again", () => {
    const state = createGestureInteractionState();
    const first = { name: "Closed_Fist" as const, score: 0.9, palmX: 0.5, timestamp: 100 };
    interpretGesture(state, first);
    expect(gestureHoldProgress(state, first)).toBe(0);
    expect(
      interpretGesture(state, { name: "Closed_Fist", score: 0.9, palmX: 0.5, timestamp: 600 })
    ).toBeNull();
    expect(
      gestureHoldProgress(state, {
        name: "Closed_Fist",
        score: 0.9,
        palmX: 0.5,
        timestamp: 600
      })
    ).toBeCloseTo(500 / 650);
    expect(
      interpretGesture(state, { name: "Closed_Fist", score: 0.9, palmX: 0.5, timestamp: 800 })
    ).toEqual({ type: "select-next" });
    expect(
      interpretGesture(state, { name: "Closed_Fist", score: 0.9, palmX: 0.5, timestamp: 3_000 })
    ).toBeNull();
    expect(
      gestureHoldProgress(state, {
        name: "Closed_Fist",
        score: 0.9,
        palmX: 0.5,
        timestamp: 3_000
      })
    ).toBe(1);

    interpretGesture(state, { name: "None", score: 0, palmX: null, timestamp: 3_100 });
    interpretGesture(state, { name: "Closed_Fist", score: 0.9, palmX: 0.5, timestamp: 3_200 });
    expect(
      interpretGesture(state, { name: "Closed_Fist", score: 0.9, palmX: 0.5, timestamp: 3_900 })
    ).toEqual({ type: "select-next" });
  });

  it("opens the selected project after a stable thumbs-up and ignores weak detections", () => {
    const state = createGestureInteractionState();
    expect(
      interpretGesture(state, { name: "Thumb_Up", score: 0.4, palmX: 0.5, timestamp: 100 })
    ).toBeNull();
    interpretGesture(state, { name: "Thumb_Up", score: 0.9, palmX: 0.5, timestamp: 200 });
    expect(
      interpretGesture(state, { name: "Thumb_Up", score: 0.9, palmX: 0.5, timestamp: 900 })
    ).toEqual({ type: "open-selected" });
  });
});

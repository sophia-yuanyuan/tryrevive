import { describe, expect, it } from "vitest";
import { createGestureInteractionState, interpretGesture } from "@/shared/gesture/interaction";

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

  it("requires a stable fist before selecting and applies a cooldown", () => {
    const state = createGestureInteractionState();
    interpretGesture(state, { name: "Closed_Fist", score: 0.9, palmX: 0.5, timestamp: 100 });
    expect(
      interpretGesture(state, { name: "Closed_Fist", score: 0.9, palmX: 0.5, timestamp: 600 })
    ).toBeNull();
    expect(
      interpretGesture(state, { name: "Closed_Fist", score: 0.9, palmX: 0.5, timestamp: 800 })
    ).toEqual({ type: "select-next" });
    expect(
      interpretGesture(state, { name: "Closed_Fist", score: 0.9, palmX: 0.5, timestamp: 1_500 })
    ).toBeNull();
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

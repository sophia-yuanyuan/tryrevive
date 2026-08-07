export type SupportedGesture = "Open_Palm" | "Closed_Fist" | "Thumb_Up" | "None";

export interface GestureSample {
  name: SupportedGesture;
  score: number;
  palmX: number | null;
  timestamp: number;
}

export type GestureCommand =
  { type: "rotate"; degrees: number } | { type: "select-next" } | { type: "open-selected" };

export const GESTURE_HOLD_MS = 650;

export interface GestureInteractionState {
  activeGesture: SupportedGesture;
  activeSince: number;
  lastPalmX: number | null;
  discreteArmed: boolean;
}

export function createGestureInteractionState(): GestureInteractionState {
  return {
    activeGesture: "None",
    activeSince: 0,
    lastPalmX: null,
    discreteArmed: true
  };
}

export function interpretGesture(
  state: GestureInteractionState,
  sample: GestureSample
): GestureCommand | null {
  if (sample.score < 0.65 || sample.name === "None") {
    state.activeGesture = "None";
    state.activeSince = sample.timestamp;
    state.lastPalmX = null;
    state.discreteArmed = true;
    return null;
  }

  if (state.activeGesture !== sample.name) {
    state.activeGesture = sample.name;
    state.activeSince = sample.timestamp;
    state.lastPalmX = sample.palmX;
    if (sample.name === "Open_Palm") state.discreteArmed = true;
    return null;
  }

  if (sample.name === "Open_Palm") {
    state.discreteArmed = true;
    if (sample.palmX === null || state.lastPalmX === null) {
      state.lastPalmX = sample.palmX;
      return null;
    }
    const degrees = (sample.palmX - state.lastPalmX) * 130;
    state.lastPalmX = sample.palmX;
    return Math.abs(degrees) >= 1.2 ? { type: "rotate", degrees } : null;
  }

  const stableFor = sample.timestamp - state.activeSince;
  if (!state.discreteArmed || stableFor < GESTURE_HOLD_MS) return null;
  state.discreteArmed = false;
  return sample.name === "Closed_Fist" ? { type: "select-next" } : { type: "open-selected" };
}

export function gestureHoldProgress(state: GestureInteractionState, sample: GestureSample): number {
  if (
    sample.score < 0.65 ||
    !["Closed_Fist", "Thumb_Up"].includes(sample.name) ||
    state.activeGesture !== sample.name
  ) {
    return 0;
  }
  if (!state.discreteArmed) return 1;
  return Math.min(1, Math.max(0, (sample.timestamp - state.activeSince) / GESTURE_HOLD_MS));
}

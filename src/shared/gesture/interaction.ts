export type SupportedGesture = "Open_Palm" | "Closed_Fist" | "Thumb_Up" | "None";

export interface GestureSample {
  name: SupportedGesture;
  score: number;
  palmX: number | null;
  timestamp: number;
}

export type GestureCommand =
  { type: "rotate"; degrees: number } | { type: "select-next" } | { type: "open-selected" };

export interface GestureInteractionState {
  activeGesture: SupportedGesture;
  activeSince: number;
  lastTriggeredAt: number;
  lastPalmX: number | null;
}

export function createGestureInteractionState(): GestureInteractionState {
  return {
    activeGesture: "None",
    activeSince: 0,
    lastTriggeredAt: 0,
    lastPalmX: null
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
    return null;
  }

  if (state.activeGesture !== sample.name) {
    state.activeGesture = sample.name;
    state.activeSince = sample.timestamp;
    state.lastPalmX = sample.palmX;
    return null;
  }

  if (sample.name === "Open_Palm") {
    if (sample.palmX === null || state.lastPalmX === null) {
      state.lastPalmX = sample.palmX;
      return null;
    }
    const degrees = (sample.palmX - state.lastPalmX) * 130;
    state.lastPalmX = sample.palmX;
    return Math.abs(degrees) >= 1.2 ? { type: "rotate", degrees } : null;
  }

  const stableFor = sample.timestamp - state.activeSince;
  const sinceLastTrigger = sample.timestamp - state.lastTriggeredAt;
  if (stableFor < 650 || (state.lastTriggeredAt > 0 && sinceLastTrigger < 1_250)) return null;
  state.lastTriggeredAt = sample.timestamp;
  state.activeSince = sample.timestamp;
  return sample.name === "Closed_Fist" ? { type: "select-next" } : { type: "open-selected" };
}

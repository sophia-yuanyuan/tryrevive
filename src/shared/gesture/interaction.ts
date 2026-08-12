import type { RitualHandFeatures } from "./landmark-features";

export const PINCH_HOLD_MS = 120;
export const RELEASE_HOLD_MS = 140;
export const OPEN_PALM_HOLD_MS = 300;
export const OPEN_PALM_REARM_MS = 180;
export const LOST_HAND_CANCEL_MS = 450;
export const GESTURE_COOLDOWN_MS = 300;

export type RitualGestureIntent =
  | { type: "open" }
  | { type: "pointer_down"; x: number; y: number }
  | { type: "pointer_move"; x: number; y: number }
  | { type: "pointer_up"; x: number; y: number }
  | { type: "cancel" };

export interface RitualGestureSample {
  features: RitualHandFeatures | null;
  timestamp: number;
}

export interface RitualGestureState {
  activePinch: boolean;
  pinchCandidateSince: number | null;
  releaseCandidateSince: number | null;
  openCandidateSince: number | null;
  nonOpenSince: number | null;
  openArmed: boolean;
  lostSince: number | null;
  lossCanceled: boolean;
  cooldownUntil: number;
  lastTimestamp: number;
  cursor: { x: number; y: number } | null;
}

export function createGestureInteractionState(): RitualGestureState {
  return {
    activePinch: false,
    pinchCandidateSince: null,
    releaseCandidateSince: null,
    openCandidateSince: null,
    nonOpenSince: null,
    openArmed: true,
    lostSince: null,
    lossCanceled: false,
    cooldownUntil: 0,
    lastTimestamp: Number.NEGATIVE_INFINITY,
    cursor: null
  };
}

function smoothCursor(
  previous: { x: number; y: number } | null,
  current: { x: number; y: number },
  alpha: number
): { x: number; y: number } {
  if (!previous) return { ...current };
  const next = {
    x: previous.x + (current.x - previous.x) * alpha,
    y: previous.y + (current.y - previous.y) * alpha
  };
  if (Math.hypot(next.x - previous.x, next.y - previous.y) < 0.006) return previous;
  return next;
}

function pinchEntered(features: RitualHandFeatures): boolean {
  return (
    features.pinchRatio <= 0.28 &&
    (features.worldPinchRatio === null || features.worldPinchRatio <= 0.32)
  );
}

function pinchReleased(features: RitualHandFeatures): boolean {
  return (
    features.pinchRatio >= 0.48 &&
    (features.worldPinchRatio === null || features.worldPinchRatio >= 0.52)
  );
}

export function interpretGesture(
  state: RitualGestureState,
  sample: RitualGestureSample
): RitualGestureIntent[] {
  if (!Number.isFinite(sample.timestamp) || sample.timestamp <= state.lastTimestamp) return [];
  state.lastTimestamp = sample.timestamp;
  const features = sample.features?.valid ? sample.features : null;

  if (!features) {
    state.pinchCandidateSince = null;
    state.openCandidateSince = null;
    state.nonOpenSince = null;
    state.releaseCandidateSince = null;
    if (state.lostSince === null) state.lostSince = sample.timestamp;
    if (
      state.activePinch &&
      !state.lossCanceled &&
      sample.timestamp - state.lostSince >= LOST_HAND_CANCEL_MS
    ) {
      state.activePinch = false;
      state.pinchCandidateSince = null;
      state.releaseCandidateSince = null;
      state.lossCanceled = true;
      state.cooldownUntil = sample.timestamp + GESTURE_COOLDOWN_MS;
      return [{ type: "cancel" }];
    }
    return [];
  }

  state.lostSince = null;
  state.lossCanceled = false;
  state.cursor = smoothCursor(state.cursor, features.cursor, state.activePinch ? 0.55 : 0.35);
  const cursor = state.cursor;
  const intents: RitualGestureIntent[] = [];

  if (features.openPalm && !state.activePinch) {
    state.nonOpenSince = null;
    if (state.openCandidateSince === null) state.openCandidateSince = sample.timestamp;
    if (
      state.openArmed &&
      sample.timestamp >= state.cooldownUntil &&
      sample.timestamp - state.openCandidateSince >= OPEN_PALM_HOLD_MS
    ) {
      state.openArmed = false;
      intents.push({ type: "open" });
    }
  } else {
    state.openCandidateSince = null;
    if (state.nonOpenSince === null) state.nonOpenSince = sample.timestamp;
    if (sample.timestamp - state.nonOpenSince >= OPEN_PALM_REARM_MS) state.openArmed = true;
  }

  if (state.activePinch) {
    intents.push({ type: "pointer_move", ...cursor });
    if (pinchReleased(features)) {
      if (state.releaseCandidateSince === null) state.releaseCandidateSince = sample.timestamp;
      if (sample.timestamp - state.releaseCandidateSince >= RELEASE_HOLD_MS) {
        state.activePinch = false;
        state.releaseCandidateSince = null;
        state.pinchCandidateSince = null;
        state.cooldownUntil = sample.timestamp + GESTURE_COOLDOWN_MS;
        intents.push({ type: "pointer_up", ...cursor });
      }
    } else {
      state.releaseCandidateSince = null;
    }
    return intents;
  }

  if (sample.timestamp < state.cooldownUntil) {
    state.pinchCandidateSince = null;
    return intents;
  }

  if (pinchEntered(features)) {
    if (state.pinchCandidateSince === null) state.pinchCandidateSince = sample.timestamp;
    if (sample.timestamp - state.pinchCandidateSince >= PINCH_HOLD_MS) {
      state.activePinch = true;
      state.releaseCandidateSince = null;
      state.openCandidateSince = null;
      state.openArmed = false;
      intents.push({ type: "pointer_down", ...cursor });
    }
  } else {
    state.pinchCandidateSince = null;
  }

  return intents;
}

export function gestureHoldProgress(
  state: RitualGestureState,
  sample: RitualGestureSample
): number {
  const features = sample.features?.valid ? sample.features : null;
  if (!features) return 0;
  if (state.activePinch) {
    if (state.releaseCandidateSince === null) return 1;
    return Math.min(1, (sample.timestamp - state.releaseCandidateSince) / RELEASE_HOLD_MS);
  }
  if (features.openPalm && state.openCandidateSince !== null && state.openArmed) {
    return Math.min(1, (sample.timestamp - state.openCandidateSince) / OPEN_PALM_HOLD_MS);
  }
  if (pinchEntered(features) && state.pinchCandidateSince !== null) {
    return Math.min(1, (sample.timestamp - state.pinchCandidateSince) / PINCH_HOLD_MS);
  }
  return 0;
}

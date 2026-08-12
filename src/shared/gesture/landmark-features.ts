export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface RitualHandFeatures {
  valid: boolean;
  cursor: { x: number; y: number };
  pinchRatio: number;
  worldPinchRatio: number | null;
  palmScale: number;
  openPalm: boolean;
}

const HAND_LANDMARK_COUNT = 21;
const CORE_LANDMARKS = [0, 5, 9, 13, 17] as const;
const FINGERS = [
  [5, 6, 8],
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20]
] as const;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteLandmark(point: HandLandmark | undefined): point is HandLandmark {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function distance2d(
  left: HandLandmark,
  right: HandLandmark,
  width: number,
  height: number
): number {
  return Math.hypot((left.x - right.x) * width, (left.y - right.y) * height);
}

function distance3d(left: HandLandmark, right: HandLandmark): number {
  return Math.hypot(left.x - right.x, left.y - right.y, (left.z ?? 0) - (right.z ?? 0));
}

function angleDegrees(
  start: HandLandmark,
  vertex: HandLandmark,
  end: HandLandmark,
  width: number,
  height: number
): number {
  const leftX = (start.x - vertex.x) * width;
  const leftY = (start.y - vertex.y) * height;
  const rightX = (end.x - vertex.x) * width;
  const rightY = (end.y - vertex.y) * height;
  const denominator = Math.hypot(leftX, leftY) * Math.hypot(rightX, rightY);
  if (!denominator) return 0;
  const cosine = clamp((leftX * rightX + leftY * rightY) / denominator, -1, 1);
  return (Math.acos(cosine) * 180) / Math.PI;
}

function straightFinger(
  landmarks: readonly HandLandmark[],
  indices: readonly [number, number, number],
  width: number,
  height: number
): boolean {
  const [mcpIndex, pipIndex, tipIndex] = indices;
  const wrist = landmarks[0];
  const mcp = landmarks[mcpIndex];
  const pip = landmarks[pipIndex];
  const tip = landmarks[tipIndex];
  if (!wrist || !mcp || !pip || !tip) return false;
  return (
    angleDegrees(mcp, pip, tip, width, height) >= 155 &&
    distance2d(tip, wrist, width, height) >= distance2d(pip, wrist, width, height) * 1.06
  );
}

function invalidFeatures(): RitualHandFeatures {
  return {
    valid: false,
    cursor: { x: 0.5, y: 0.5 },
    pinchRatio: Number.POSITIVE_INFINITY,
    worldPinchRatio: null,
    palmScale: 0,
    openPalm: false
  };
}

export function extractRitualHandFeatures(
  landmarks: readonly HandLandmark[] | undefined,
  worldLandmarks: readonly HandLandmark[] | undefined,
  videoWidth: number,
  videoHeight: number
): RitualHandFeatures {
  if (
    !landmarks ||
    landmarks.length !== HAND_LANDMARK_COUNT ||
    !Number.isFinite(videoWidth) ||
    !Number.isFinite(videoHeight) ||
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    !landmarks.every(finiteLandmark)
  ) {
    return invalidFeatures();
  }

  const wrist = landmarks[0]!;
  const thumbTip = landmarks[4]!;
  const indexMcp = landmarks[5]!;
  const indexTip = landmarks[8]!;
  const middleMcp = landmarks[9]!;
  const littleMcp = landmarks[17]!;
  const palmWidth = distance2d(indexMcp, littleMcp, videoWidth, videoHeight);
  const palmLength = distance2d(wrist, middleMcp, videoWidth, videoHeight);
  const palmScale = Math.sqrt(palmWidth * palmLength);
  const coreVisible = CORE_LANDMARKS.every((index) => {
    const point = landmarks[index]!;
    return point.x >= -0.04 && point.x <= 1.04 && point.y >= -0.04 && point.y <= 1.04;
  });
  const minimumScale = Math.min(videoWidth, videoHeight) * 0.08;
  if (!coreVisible || !Number.isFinite(palmScale) || palmScale < minimumScale) {
    return invalidFeatures();
  }

  const pinchRatio = distance2d(thumbTip, indexTip, videoWidth, videoHeight) / palmScale;
  let worldPinchRatio: number | null = null;
  if (
    worldLandmarks?.length === HAND_LANDMARK_COUNT &&
    worldLandmarks.every(finiteLandmark) &&
    worldLandmarks[4] &&
    worldLandmarks[8] &&
    worldLandmarks[5] &&
    worldLandmarks[17]
  ) {
    const worldPalmWidth = distance3d(worldLandmarks[5], worldLandmarks[17]);
    if (worldPalmWidth > 0) {
      worldPinchRatio = distance3d(worldLandmarks[4], worldLandmarks[8]) / worldPalmWidth;
    }
  }

  return {
    valid: true,
    cursor: {
      x: clamp((0.85 - indexTip.x) / 0.7),
      y: clamp((indexTip.y - 0.12) / 0.76)
    },
    pinchRatio,
    worldPinchRatio,
    palmScale,
    openPalm: FINGERS.every((indices) =>
      straightFinger(landmarks, indices, videoWidth, videoHeight)
    )
  };
}

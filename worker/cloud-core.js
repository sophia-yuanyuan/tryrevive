export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT_CHARS = 120_000;

const encoder = new TextEncoder();
const DECISIONS = new Set(["continue", "shrink", "help", "pause", "abandon"]);

function boundedString(value, maximum, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maximum);
}

export function parseSourceMetadata(value) {
  const source = value && typeof value === "object" ? value : {};
  const kind = ["audio", "attachment", "text"].includes(source.kind) ? source.kind : null;
  const name = boundedString(source.name, 180);
  const mimeType = boundedString(source.mimeType, 120);
  const sizeBytes = Number(source.sizeBytes);
  const durationSeconds = source.durationSeconds == null ? null : Number(source.durationSeconds);
  if (!kind || !name || !mimeType) throw new Error("来源信息不完整");
  if (!Number.isInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > MAX_SOURCE_BYTES) {
    throw new Error("文件大小不符合限制");
  }
  if (
    kind === "audio" &&
    (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 3600)
  ) {
    throw new Error("语音时长不符合限制");
  }
  return { kind, name, mimeType, sizeBytes, durationSeconds };
}

export function estimateCost(metadata) {
  const source = parseSourceMetadata(metadata);
  return {
    speechMinutes:
      source.kind === "audio" ? Math.max(1, Math.ceil(source.durationSeconds / 60)) : 0,
    projectAnalyses: 1
  };
}

export function stableMetadata(metadata) {
  const source = parseSourceMetadata(metadata);
  return JSON.stringify([
    source.kind,
    source.mimeType,
    source.sizeBytes,
    source.durationSeconds
  ]);
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function extractResponseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const parts = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

export function normalizeAnalysis(value, { sourceLabel, createdAt = Date.now() }) {
  const input = value && typeof value === "object" ? value : {};
  const stallReasons = (Array.isArray(input.stallReasons) ? input.stallReasons : [])
    .map((item) => boundedString(item, 240))
    .filter(Boolean)
    .slice(0, 3);
  const uncertainties = (Array.isArray(input.uncertainties) ? input.uncertainties : [])
    .map((item) => boundedString(item, 240))
    .filter(Boolean)
    .slice(0, 5);
  const nextAction = input.nextAction && typeof input.nextAction === "object" ? input.nextAction : {};
  const minutes = Number(nextAction.minutes);
  const normalized = {
    id: `analysis_${crypto.randomUUID()}`,
    sourceLabel: boundedString(sourceLabel, 180, "用户提供的上下文"),
    originalGoal: boundedString(input.originalGoal, 500),
    lastCompleted: boundedString(input.lastCompleted, 240),
    stuckAt: boundedString(input.stuckAt, 240),
    deadline: boundedString(input.deadline, 80),
    whyMatters: boundedString(input.whyMatters, 240),
    stallReasons,
    suggestedDecision: DECISIONS.has(input.suggestedDecision)
      ? input.suggestedDecision
      : "shrink",
    nextAction: {
      text: boundedString(nextAction.text, 160),
      doneDefinition: boundedString(nextAction.doneDefinition, 160),
      minutes: Number.isInteger(minutes) ? Math.min(20, Math.max(5, minutes)) : 10
    },
    uncertainties,
    createdAt
  };
  if (
    !normalized.originalGoal ||
    !normalized.lastCompleted ||
    !normalized.stuckAt ||
    !normalized.stallReasons.length ||
    !normalized.nextAction.text ||
    !normalized.nextAction.doneDefinition
  ) {
    throw new Error("模型没有返回完整的项目草稿");
  }
  return normalized;
}

export function isAcceptedAttachment(metadata) {
  const source = parseSourceMetadata(metadata);
  if (source.kind === "audio") {
    const acceptedAudioMimeTypes = new Set([
      "audio/m4a",
      "audio/mp4",
      "audio/mpeg",
      "audio/mpga",
      "audio/wav",
      "audio/webm",
      "audio/x-m4a",
      "audio/x-wav",
      "video/mp4",
      "video/mpeg"
    ]);
    return (
      acceptedAudioMimeTypes.has(source.mimeType.toLowerCase()) ||
      /\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i.test(source.name)
    );
  }
  if (source.kind === "text") return /^text\//i.test(source.mimeType);
  const acceptedMimeTypes = new Set([
    "application/json",
    "application/msword",
    "application/pdf",
    "application/rtf",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/xml"
  ]);
  if (/^text\//i.test(source.mimeType) || acceptedMimeTypes.has(source.mimeType.toLowerCase())) {
    return true;
  }
  return /\.(pdf|doc|docx|rtf|odt|txt|md|json|html|xml|csv|xls|xlsx|ppt|pptx)$/i.test(
    source.name
  );
}

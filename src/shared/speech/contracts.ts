import { z } from "zod";

export const LOCAL_SPEECH_CULTURE = "zh-CN";
export const MAX_LOCAL_SPEECH_SECONDS = 90;
export const MAX_LOCAL_SPEECH_WAV_BYTES = 4 * 1024 * 1024;

export const LocalSpeechCapabilitySchema = z.object({
  available: z.boolean(),
  culture: z.string().trim().min(1).max(24).nullable(),
  recognizer: z.string().trim().max(160).nullable(),
  message: z.string().trim().min(1).max(300)
});

export const LocalSpeechResultSchema = z.object({
  transcript: z.string().trim().min(1).max(20_000),
  culture: z.string().trim().min(1).max(24),
  confidence: z.number().min(0).max(1).nullable()
});

export interface LocalSpeechRequest {
  bytes: Uint8Array;
  culture?: string;
}

export type LocalSpeechCapability = z.infer<typeof LocalSpeechCapabilitySchema>;
export type LocalSpeechResult = z.infer<typeof LocalSpeechResultSchema>;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function viewBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

export function parseLocalSpeechRequest(input: unknown): Required<LocalSpeechRequest> {
  if (!input || typeof input !== "object") throw new Error("本机语音转写请求无效");
  const source = input as Record<string, unknown>;
  const bytes = viewBytes(source.bytes);
  if (!bytes || bytes.byteLength < 44 || bytes.byteLength > MAX_LOCAL_SPEECH_WAV_BYTES) {
    throw new Error("本机语音必须是 44 字节到 4 MB 的 WAV 文件");
  }
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") {
    throw new Error("本机语音缺少有效的 WAV 文件头");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const validPcm =
    ascii(bytes, 12, 4) === "fmt " &&
    view.getUint16(20, true) === 1 &&
    view.getUint16(22, true) === 1 &&
    view.getUint32(24, true) === 16_000 &&
    view.getUint16(34, true) === 16 &&
    ascii(bytes, 36, 4) === "data" &&
    view.getUint32(40, true) === bytes.byteLength - 44;
  if (!validPcm) throw new Error("本机语音必须是 TryRevive 生成的 16 kHz 单声道 PCM WAV");

  let energy = 0;
  let sampled = 0;
  for (let offset = 44; offset + 1 < bytes.byteLength; offset += 16) {
    const sample = view.getInt16(offset, true) / 0x8000;
    energy += sample * sample;
    sampled += 1;
  }
  if (!sampled || Math.sqrt(energy / sampled) < 0.0015) {
    throw new Error("没有录到清晰声音；请靠近麦克风再试，或直接输入文字");
  }

  const culture = typeof source.culture === "string" ? source.culture.trim() : LOCAL_SPEECH_CULTURE;
  if (!/^[a-z]{2,3}-[A-Z]{2}$/u.test(culture)) throw new Error("本机语音语言无效");
  return { bytes, culture };
}

import { describe, expect, it } from "vitest";
import { encodeLocalSpeechWav, LOCAL_SPEECH_SAMPLE_RATE } from "@/shared/audio/pcm-wav";
import { MAX_LOCAL_SPEECH_SECONDS, parseLocalSpeechRequest } from "@/shared/speech/contracts";

function text(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

describe("local Windows speech WAV boundary", () => {
  it("encodes browser samples as bounded 16 kHz mono PCM", () => {
    const sourceRate = 48_000;
    const source = new Float32Array(sourceRate);
    source.forEach((_value, index) => {
      source[index] = Math.sin((index / sourceRate) * Math.PI * 2 * 440) * 0.25;
    });

    const bytes = encodeLocalSpeechWav([source], sourceRate);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(text(bytes, 0, 4)).toBe("RIFF");
    expect(text(bytes, 8, 4)).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(LOCAL_SPEECH_SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(bytes.byteLength).toBe(44 + LOCAL_SPEECH_SAMPLE_RATE * 2);
    expect(parseLocalSpeechRequest({ bytes })).toMatchObject({ culture: "zh-CN" });
  });

  it("caps an overlong recording before it crosses the IPC limit", () => {
    const sourceRate = 16_000;
    const source = new Float32Array(sourceRate * (MAX_LOCAL_SPEECH_SECONDS + 5));
    const bytes = encodeLocalSpeechWav([source], sourceRate);

    expect(bytes.byteLength).toBe(44 + sourceRate * MAX_LOCAL_SPEECH_SECONDS * 2);
  });

  it("rejects empty, malformed, oversized, and invalid-language requests", () => {
    expect(() => encodeLocalSpeechWav([], 48_000)).toThrow("没有录到");
    expect(() => parseLocalSpeechRequest({ bytes: new Uint8Array(44) })).toThrow("WAV 文件头");
    expect(() => parseLocalSpeechRequest({ bytes: new Uint8Array(4 * 1024 * 1024 + 1) })).toThrow(
      "4 MB"
    );
    const silence = encodeLocalSpeechWav([new Float32Array(1_000)], 16_000);
    expect(() => parseLocalSpeechRequest({ bytes: silence })).toThrow("没有录到清晰声音");

    const valid = encodeLocalSpeechWav([Float32Array.from({ length: 1_000 }, () => 0.1)], 16_000);
    expect(() => parseLocalSpeechRequest({ bytes: valid, culture: "../../tmp" })).toThrow(
      "语言无效"
    );
  });
});

import { describe, expect, it } from "vitest";
import { MAX_WAV_EXPORT_BYTES, parseAudioExportRequest } from "@/shared/audio/export";

function wavBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  return bytes;
}

describe("audio export boundary", () => {
  it("keeps valid WAV bytes and sanitizes the suggested file name", () => {
    const result = parseAudioExportRequest({
      fileName: "../我的:项目?.WAV",
      bytes: wavBytes()
    });

    expect(result.fileName).toBe("我的-项目-.wav");
    expect(result.bytes).toHaveLength(64);
  });

  it("rejects non-WAV and oversized payloads before desktop file access", () => {
    expect(() =>
      parseAudioExportRequest({ fileName: "not-a-wave.wav", bytes: new Uint8Array(64) })
    ).toThrow(/WAV 文件头/);
    expect(() =>
      parseAudioExportRequest({
        fileName: "too-large.wav",
        bytes: wavBytes(MAX_WAV_EXPORT_BYTES + 1)
      })
    ).toThrow(/5 MB/);
  });
});

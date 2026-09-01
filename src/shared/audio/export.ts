export const MAX_WAV_EXPORT_BYTES = 5 * 1024 * 1024;

export interface AudioExportRequest {
  fileName: string;
  bytes: Uint8Array;
}

function header(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function sanitizeWavFileName(rawName: string): string {
  const forbidden = '<>:"/\\|?*';
  const baseName = [...rawName.normalize("NFKC")]
    .map((character) =>
      character.charCodeAt(0) <= 31 || forbidden.includes(character) ? "-" : character
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s-]+/g, "")
    .replace(/\.+$/g, "")
    .slice(0, 80);
  return `${baseName.replace(/\.wav$/i, "") || "TryRevive-项目唱片"}.wav`;
}

export function parseAudioExportRequest(input: unknown): AudioExportRequest {
  if (!input || typeof input !== "object") throw new Error("音乐导出请求无效");
  const source = input as Record<string, unknown>;
  const rawBytes = source.bytes;
  const bytes =
    rawBytes instanceof Uint8Array
      ? rawBytes
      : ArrayBuffer.isView(rawBytes)
        ? new Uint8Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength)
        : null;
  if (!bytes || bytes.byteLength < 44 || bytes.byteLength > MAX_WAV_EXPORT_BYTES) {
    throw new Error("项目唱片必须是 44 字节到 5 MB 的 WAV 文件");
  }
  if (header(bytes, 0, 4) !== "RIFF" || header(bytes, 8, 4) !== "WAVE") {
    throw new Error("项目唱片缺少有效的 WAV 文件头");
  }

  const rawName = typeof source.fileName === "string" ? source.fileName : "";
  const fileName = sanitizeWavFileName(rawName);
  return { fileName, bytes };
}

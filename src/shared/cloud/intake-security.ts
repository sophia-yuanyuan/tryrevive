const PACKAGED_CLOUD_ORIGIN = "https://api.tryrevive.online";

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  csv: "text/csv",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  mpeg: "video/mpeg",
  mpga: "audio/mpga",
  m4a: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac"
};

export function resolveCloudBaseUrl(
  configured: string | undefined,
  isPackaged: boolean
): string | null {
  const candidate = configured?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (isPackaged) return url.origin === PACKAGED_CLOUD_ORIGIN ? url.origin : null;
    const localDevelopment =
      url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
    return url.protocol === "https:" || localDevelopment ? url.origin : null;
  } catch {
    return null;
  }
}

export function normalizeCloudMimeType(fileName: string, reportedMimeType: string): string {
  const normalized = reportedMimeType.trim().toLowerCase();
  if (normalized && normalized !== "application/octet-stream") return normalized;
  const extension =
    fileName
      .trim()
      .toLowerCase()
      .match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export function isCloudAudioFile(fileName: string, reportedMimeType: string): boolean {
  const mimeType = normalizeCloudMimeType(fileName, reportedMimeType);
  return (
    mimeType.startsWith("audio/") ||
    ["video/mp4", "video/mpeg"].includes(mimeType) ||
    /\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i.test(fileName.trim())
  );
}

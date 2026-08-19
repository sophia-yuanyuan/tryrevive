import { extractDocxText, extractPdfText } from "@/shared/domain/local-document-text";

export const MAX_LOCAL_MATERIAL_FILES = 8;
export const MAX_LOCAL_TEXT_MATERIAL_BYTES = 1024 * 1024;
export const MAX_LOCAL_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_LOCAL_MATERIAL_TOTAL_BYTES = 16 * 1024 * 1024;
export const MAX_LOCAL_MATERIAL_CHARACTERS = 200_000;

const LOCAL_TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".yaml",
  ".yml"
]);

export interface LocalMaterialFile {
  name: string;
  size: number;
  type?: string;
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}

export interface LocalMaterialSummary {
  name: string;
  sizeBytes: number;
  characters: number;
}

export interface LocalMaterialBundle {
  content: string;
  sourceLabel: string;
  titleHint: string;
  materials: LocalMaterialSummary[];
}

type LocalMaterialKind = "text" | "pdf" | "docx";

function safeFileName(value: string): string {
  const finalSegment = value.split(/[\\/]+/u).at(-1) ?? value;
  const withoutControls = [...finalSegment]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f ? " " : character;
    })
    .join("");
  const normalized = withoutControls
    .replace(/[\\/]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 120);
  return normalized || "未命名文字材料.txt";
}

function extensionOf(name: string): string {
  const match = name.toLocaleLowerCase("en-US").match(/\.[a-z0-9]{1,12}$/u);
  return match?.[0] ?? "";
}

function baseName(name: string): string {
  const extension = extensionOf(name);
  return (extension ? name.slice(0, -extension.length) : name).trim().slice(0, 80);
}

export function isSupportedLocalTextMaterial(name: string, mimeType = ""): boolean {
  const extension = extensionOf(name);
  if (!LOCAL_TEXT_EXTENSIONS.has(extension)) return false;
  const normalizedMime = mimeType.toLocaleLowerCase("en-US");
  return (
    !/^(?:audio|image|video)\//u.test(normalizedMime) &&
    ![
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ].includes(normalizedMime)
  );
}

function localMaterialKind(name: string, mimeType = ""): LocalMaterialKind | null {
  if (isSupportedLocalTextMaterial(name, mimeType)) return "text";
  const extension = extensionOf(name);
  const normalizedMime = mimeType.toLocaleLowerCase("en-US");
  if (/^(?:audio|image|video)\//u.test(normalizedMime)) return null;
  if (
    extension === ".pdf" &&
    ["", "application/pdf", "application/x-pdf", "application/octet-stream"].includes(
      normalizedMime
    )
  ) {
    return "pdf";
  }
  if (
    extension === ".docx" &&
    [
      "",
      "application/octet-stream",
      "application/zip",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ].includes(normalizedMime)
  ) {
    return "docx";
  }
  return null;
}

export function isSupportedLocalMaterial(name: string, mimeType = ""): boolean {
  return localMaterialKind(name, mimeType) !== null;
}

function hasUnreadableCharacters(value: string): boolean {
  let replacementCharacters = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint === 0 ||
      (codePoint < 0x20 && ![0x09, 0x0a, 0x0d].includes(codePoint)) ||
      codePoint === 0x7f
    ) {
      return true;
    }
    if (codePoint === 0xfffd) replacementCharacters += 1;
  }
  return replacementCharacters >= 3 && replacementCharacters / Math.max(1, value.length) >= 0.01;
}

async function readDocumentBytes(file: LocalMaterialFile): Promise<Uint8Array> {
  if (!file.arrayBuffer) throw new Error("missing_binary_reader");
  return new Uint8Array(await file.arrayBuffer());
}

async function readMaterialText(
  file: LocalMaterialFile,
  name: string,
  kind: LocalMaterialKind
): Promise<string> {
  if (kind === "text") return (await file.text()).replace(/^\uFEFF/u, "").trim();

  try {
    const bytes = await readDocumentBytes(file);
    if (kind === "docx") return extractDocxText(bytes);
    return await extractPdfText(bytes);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "docx_text_too_large") {
      throw new Error(`“${name}”解压后的正文超过 2 MB；请只保留与恢复项目有关的内容。`, {
        cause: error
      });
    }
    if (code === "pdf_page_limit") {
      throw new Error(`“${name}”超过 80 页；请只选择与当前项目直接相关的页面。`, {
        cause: error
      });
    }
    if (code === "pdf_processing_timeout") {
      throw new Error(`“${name}”处理超过 10 秒；请压缩文件或只保留相关页面后重试。`, {
        cause: error
      });
    }
    if (code === "password_protected_pdf") {
      throw new Error(`“${name}”受密码保护；请另存一份可读取的 PDF 后重试。`, {
        cause: error
      });
    }
    throw new Error(
      kind === "pdf"
        ? `“${name}”不是可读取的 PDF，或文件已经损坏。`
        : `“${name}”不是可读取的 DOCX，或文件已经损坏。`,
      { cause: error }
    );
  }
}

export async function readLocalMaterials(
  inputFiles: readonly LocalMaterialFile[]
): Promise<LocalMaterialBundle> {
  const files = [...inputFiles];
  if (!files.length) throw new Error("还没有选择本地文字材料。");
  if (files.length > MAX_LOCAL_MATERIAL_FILES) {
    throw new Error(`一次最多选择 ${MAX_LOCAL_MATERIAL_FILES} 份本地文字材料。`);
  }

  const normalized = files.map((file) => {
    const name = safeFileName(file.name);
    return { file, name, kind: localMaterialKind(name, file.type ?? "") };
  });
  const unsupported = normalized.find(({ kind }) => !kind);
  if (unsupported) {
    throw new Error(
      `“${unsupported.name}”不能在本机按文字读取。当前支持 TXT、Markdown、CSV、JSON、YAML、PDF 和 DOCX；图片与音频仍未启用本地识别。`
    );
  }

  const oversized = normalized.find(
    ({ file, kind }) =>
      file.size > (kind === "text" ? MAX_LOCAL_TEXT_MATERIAL_BYTES : MAX_LOCAL_DOCUMENT_BYTES)
  );
  if (oversized) {
    const limit = oversized.kind === "text" ? "1 MB" : "8 MB";
    throw new Error(`“${oversized.name}”超过 ${limit}；请只保留与恢复项目有关的文字。`);
  }
  const totalBytes = normalized.reduce((sum, { file }) => sum + file.size, 0);
  if (totalBytes > MAX_LOCAL_MATERIAL_TOTAL_BYTES) {
    throw new Error("本次本地材料合计不能超过 16 MB。");
  }

  const parts: string[] = [];
  const materials: LocalMaterialSummary[] = [];
  let totalCharacters = 0;
  for (const { file, name, kind } of normalized) {
    const text = await readMaterialText(file, name, kind!);
    if (!text) {
      throw new Error(
        kind === "pdf"
          ? `“${name}”没有可复制文字；如果它是扫描件，请先做 OCR 或另存为文字版 PDF。`
          : `“${name}”没有可读取的文字。`
      );
    }
    if (hasUnreadableCharacters(text)) {
      throw new Error(`“${name}”不像可读的 UTF-8 文字；请确认文件格式，或另存为 UTF-8 后重试。`);
    }
    totalCharacters += text.length;
    if (totalCharacters > MAX_LOCAL_MATERIAL_CHARACTERS) {
      throw new Error("提取到的文字合计超过 20 万字；请只选择与当前项目直接相关的材料。");
    }
    materials.push({ name, sizeBytes: file.size, characters: text.length });
    parts.push(`【本地材料：${name}】\n${text}`);
  }

  const shownNames = materials
    .slice(0, 3)
    .map(({ name }) => name)
    .join("、");
  const remainder = materials.length > 3 ? `等 ${materials.length} 份` : `${materials.length} 份`;
  return {
    content: parts.join("\n\n"),
    sourceLabel: `${shownNames} · ${remainder}`.slice(0, 180),
    titleHint: materials.length === 1 ? baseName(materials[0]!.name) : "",
    materials
  };
}

export const readLocalTextMaterials = readLocalMaterials;

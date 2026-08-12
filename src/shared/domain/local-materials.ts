export const MAX_LOCAL_MATERIAL_FILES = 8;
export const MAX_LOCAL_MATERIAL_BYTES = 1024 * 1024;
export const MAX_LOCAL_MATERIAL_TOTAL_BYTES = 2 * 1024 * 1024;
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

function safeFileName(value: string): string {
  const withoutControls = [...value]
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
  if (LOCAL_TEXT_EXTENSIONS.has(extension)) return true;
  return mimeType.toLocaleLowerCase("en-US").startsWith("text/");
}

export async function readLocalTextMaterials(
  inputFiles: readonly LocalMaterialFile[]
): Promise<LocalMaterialBundle> {
  const files = [...inputFiles];
  if (!files.length) throw new Error("还没有选择本地文字材料。");
  if (files.length > MAX_LOCAL_MATERIAL_FILES) {
    throw new Error(`一次最多选择 ${MAX_LOCAL_MATERIAL_FILES} 份本地文字材料。`);
  }

  const normalized = files.map((file) => ({ file, name: safeFileName(file.name) }));
  const unsupported = normalized.find(
    ({ file, name }) => !isSupportedLocalTextMaterial(name, file.type ?? "")
  );
  if (unsupported) {
    throw new Error(
      `“${unsupported.name}”不能在本机按文字读取。PDF、DOCX 和音频需要受控云端理解，或请先另存为 TXT / Markdown。`
    );
  }

  const oversized = normalized.find(({ file }) => file.size > MAX_LOCAL_MATERIAL_BYTES);
  if (oversized) {
    throw new Error(`“${oversized.name}”超过 1 MB；请只保留与恢复项目有关的文字。`);
  }
  const totalBytes = normalized.reduce((sum, { file }) => sum + file.size, 0);
  if (totalBytes > MAX_LOCAL_MATERIAL_TOTAL_BYTES) {
    throw new Error("本次本地文字材料合计不能超过 2 MB。");
  }

  const parts: string[] = [];
  const materials: LocalMaterialSummary[] = [];
  let totalCharacters = 0;
  for (const { file, name } of normalized) {
    const text = (await file.text())
      .replace(/^\uFEFF/u, "")
      .split("\u0000")
      .join("")
      .trim();
    if (!text) throw new Error(`“${name}”没有可读取的文字。`);
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

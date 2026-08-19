import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  MAX_LOCAL_MATERIAL_FILES,
  isSupportedLocalMaterial,
  isSupportedLocalTextMaterial,
  readLocalMaterials,
  type LocalMaterialFile
} from "@/shared/domain/local-materials";

function material(name: string, content: string, type = "text/plain"): LocalMaterialFile {
  return {
    name,
    type,
    size: new TextEncoder().encode(content).byteLength,
    async text() {
      return content;
    }
  };
}

function binaryMaterial(name: string, bytes: Uint8Array, type: string): LocalMaterialFile {
  return {
    name,
    type,
    size: bytes.byteLength,
    async text() {
      return new TextDecoder().decode(bytes);
    },
    async arrayBuffer() {
      return bytes.slice().buffer as ArrayBuffer;
    }
  };
}

function docxMaterial(bodyXml: string): LocalMaterialFile {
  const bytes = zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types" />'
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`
    )
  });
  return binaryMaterial(
    "黑客松报名.docx",
    bytes,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

describe("local text materials", () => {
  it("accepts only the documented UTF-8 text extensions", () => {
    for (const extension of ["txt", "md", "markdown", "csv", "json", "yaml", "yml"]) {
      expect(isSupportedLocalTextMaterial(`材料.${extension}`, "text/plain")).toBe(true);
    }
    expect(isSupportedLocalTextMaterial("没有扩展名", "text/plain")).toBe(false);
    expect(isSupportedLocalTextMaterial("伪装.txt", "image/png")).toBe(false);
    expect(isSupportedLocalMaterial("恢复现场.pdf", "application/pdf")).toBe(true);
    expect(
      isSupportedLocalMaterial(
        "恢复现场.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(true);
    expect(isSupportedLocalMaterial("录音.mp3", "audio/mpeg")).toBe(false);
    expect(isSupportedLocalMaterial("伪装.pdf", "text/plain")).toBe(false);
    expect(isSupportedLocalMaterial("伪装.docx", "application/pdf")).toBe(false);
  });

  it("reads several supported files into one clearly separated local bundle", async () => {
    const bundle = await readLocalMaterials([
      material("README.md", "我想完成黑客松报名。\n上次已经写完项目简介。", "text/markdown"),
      material("进度.yaml", "卡点: 还没有整理个人分工", "application/yaml")
    ]);

    expect(bundle.materials).toEqual([
      expect.objectContaining({ name: "README.md" }),
      expect.objectContaining({ name: "进度.yaml" })
    ]);
    expect(bundle.content).toContain("【本地材料：README.md】");
    expect(bundle.content).toContain("还没有整理个人分工");
    expect(bundle.sourceLabel).toContain("2 份");
    expect(bundle.titleHint).toBe("");
  });

  it("uses a single safe filename only as an optional title hint", async () => {
    const bundle = await readLocalMaterials([
      material("C:\\private\\黑客松报名材料.md", "我想完成黑客松报名。")
    ]);

    expect(bundle.titleHint).toBe("黑客松报名材料");
    expect(bundle.sourceLabel).not.toContain("private");
  });

  it("extracts only readable main-document text from a bounded DOCX archive", async () => {
    const bundle = await readLocalMaterials([
      docxMaterial(
        "<w:p><w:r><w:t>我想完成黑客松报名。</w:t></w:r></w:p>" +
          "<w:p><w:r><w:t>上次写完简介，</w:t><w:tab/><w:t>现在卡在个人分工。</w:t></w:r></w:p>"
      )
    ]);

    expect(bundle.content).toContain("我想完成黑客松报名");
    expect(bundle.content).toContain("现在卡在个人分工");
    expect(bundle.materials[0]).toMatchObject({ name: "黑客松报名.docx" });
    expect(bundle.titleHint).toBe("黑客松报名");
  });

  it("rejects renamed binary and clearly broken UTF-8 text", async () => {
    await expect(readLocalMaterials([material("伪装.txt", "项目\u0000现场")])).rejects.toThrow(
      "不像可读的 UTF-8 文字"
    );
    await expect(readLocalMaterials([material("乱码.md", "项目���现场")])).rejects.toThrow(
      "不像可读的 UTF-8 文字"
    );
  });

  it("rejects unsupported, empty, oversized, and excessive selections", async () => {
    expect(isSupportedLocalTextMaterial("项目.pdf", "application/pdf")).toBe(false);
    await expect(
      readLocalMaterials([material("项目.pdf", "%PDF", "application/pdf")])
    ).rejects.toThrow("不是可读取的 PDF");
    await expect(
      readLocalMaterials([material("录音.mp3", "binary", "audio/mpeg")])
    ).rejects.toThrow("图片与音频仍未启用本地识别");
    await expect(readLocalMaterials([material("空白.txt", "   ")])).rejects.toThrow(
      "没有可读取的文字"
    );
    await expect(
      readLocalMaterials(
        Array.from({ length: MAX_LOCAL_MATERIAL_FILES + 1 }, (_, index) =>
          material(`材料-${index}.txt`, "项目现场")
        )
      )
    ).rejects.toThrow(`最多选择 ${MAX_LOCAL_MATERIAL_FILES} 份`);

    const oversized = material("太大.txt", "项目现场");
    oversized.size = 1024 * 1024 + 1;
    await expect(readLocalMaterials([oversized])).rejects.toThrow("超过 1 MB");
  });

  it("refuses a compressed DOCX whose main XML expands past the local boundary", async () => {
    const hugeText = "进度".repeat(530_000);
    await expect(
      readLocalMaterials([docxMaterial(`<w:p><w:r><w:t>${hugeText}</w:t></w:r></w:p>`)])
    ).rejects.toThrow("解压后的正文超过 2 MB");
  });
});

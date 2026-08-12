import { describe, expect, it } from "vitest";
import {
  MAX_LOCAL_MATERIAL_FILES,
  isSupportedLocalTextMaterial,
  readLocalTextMaterials,
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

describe("local text materials", () => {
  it("accepts only the documented UTF-8 text extensions", () => {
    for (const extension of ["txt", "md", "markdown", "csv", "json", "yaml", "yml"]) {
      expect(isSupportedLocalTextMaterial(`材料.${extension}`, "text/plain")).toBe(true);
    }
    expect(isSupportedLocalTextMaterial("没有扩展名", "text/plain")).toBe(false);
    expect(isSupportedLocalTextMaterial("伪装.txt", "image/png")).toBe(false);
  });

  it("reads several supported files into one clearly separated local bundle", async () => {
    const bundle = await readLocalTextMaterials([
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
    const bundle = await readLocalTextMaterials([
      material("C:\\private\\黑客松报名材料.md", "我想完成黑客松报名。")
    ]);

    expect(bundle.titleHint).toBe("黑客松报名材料");
    expect(bundle.sourceLabel).not.toContain("private");
  });

  it("rejects renamed binary and clearly broken UTF-8 text", async () => {
    await expect(readLocalTextMaterials([material("伪装.txt", "项目\u0000现场")])).rejects.toThrow(
      "不像可读的 UTF-8 文字"
    );
    await expect(readLocalTextMaterials([material("乱码.md", "项目���现场")])).rejects.toThrow(
      "不像可读的 UTF-8 文字"
    );
  });

  it("rejects unsupported, empty, oversized, and excessive selections", async () => {
    expect(isSupportedLocalTextMaterial("项目.pdf", "application/pdf")).toBe(false);
    await expect(
      readLocalTextMaterials([material("项目.pdf", "%PDF", "application/pdf")])
    ).rejects.toThrow("PDF、DOCX 和音频需要受控云端理解");
    await expect(readLocalTextMaterials([material("空白.txt", "   ")])).rejects.toThrow(
      "没有可读取的文字"
    );
    await expect(
      readLocalTextMaterials(
        Array.from({ length: MAX_LOCAL_MATERIAL_FILES + 1 }, (_, index) =>
          material(`材料-${index}.txt`, "项目现场")
        )
      )
    ).rejects.toThrow(`最多选择 ${MAX_LOCAL_MATERIAL_FILES} 份`);

    const oversized = material("太大.txt", "项目现场");
    oversized.size = 1024 * 1024 + 1;
    await expect(readLocalTextMaterials([oversized])).rejects.toThrow("超过 1 MB");
  });
});

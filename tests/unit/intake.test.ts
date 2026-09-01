import { describe, expect, it } from "vitest";
import { parseProjectDump } from "@/shared/domain/intake";
import { summarizeWebMaterialSource } from "@/shared/domain/web-source";

describe("parseProjectDump", () => {
  it("parses lines and semicolons, removes list markers, and de-duplicates", () => {
    expect(parseProjectDump("1. 申请黑客松\n- 报名英语考试；申请黑客松\n• 完成作品集")).toEqual([
      "申请黑客松",
      "报名英语考试",
      "完成作品集"
    ]);
  });

  it("limits title length and project count", () => {
    const dump = Array.from(
      { length: 25 },
      (_, index) => `${index + 1}. 项目${index}-${"项".repeat(90)}`
    ).join("\n");
    const projects = parseProjectDump(dump);
    expect(projects).toHaveLength(20);
    expect(projects.every((title) => title.length <= 80)).toBe(true);
  });
});

describe("summarizeWebMaterialSource", () => {
  it("keeps only the host and drops private path and query details", () => {
    expect(
      summarizeWebMaterialSource(
        "https://example.feishu.cn/docx/private-document?token=must-not-persist#draft"
      )
    ).toEqual({ host: "example.feishu.cn", sourceLabel: "网页摘录 · example.feishu.cn" });
  });

  it("rejects insecure or credential-bearing links", () => {
    expect(() => summarizeWebMaterialSource("http://example.com/apply")).toThrow("只接受 https");
    expect(() => summarizeWebMaterialSource("https://user:secret@example.com/apply")).toThrow(
      "不能包含账号或密码"
    );
  });
});

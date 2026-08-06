import { describe, expect, it } from "vitest";
import { parseProjectDump } from "@/shared/domain/intake";

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

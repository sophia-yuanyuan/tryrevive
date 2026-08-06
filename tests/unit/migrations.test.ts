import { describe, expect, it } from "vitest";
import { extractLegacyReviveState, migrateState } from "@/shared/domain/migrations";

describe("state migrations", () => {
  it("imports the legacy guest profile without exposing internal domain terms", () => {
    const legacy = {
      schemaVersion: 2,
      activeProjectId: "legacy-1",
      projects: [
        {
          id: "legacy-1",
          name: "课程网站",
          status: "running",
          lastCompleted: "完成了首页",
          obstacle: "导航在手机上溢出",
          action: {
            id: "action-1",
            text: "修复导航换行",
            doneDefinition: "390px 下不溢出",
            minutes: 10
          },
          evidence: [{ id: "e-1", note: "已找到溢出的 flex 容器" }]
        }
      ]
    };

    const state = migrateState(legacy, 1_800_000_000_000);
    expect(state.schemaVersion).toBe(3);
    expect(state.activeProjectId).toBe("legacy-1");
    expect(state.projects[0]).toMatchObject({
      title: "课程网站",
      stage: "return",
      restore: { lastCompleted: "完成了首页", stuckAt: "导航在手机上溢出" }
    });
    expect(state.projects[0]?.evidence[0]?.note).toContain("flex");
  });

  it("extracts the revive payload from the old local guest save", () => {
    const profile = JSON.stringify({ nickname: "朋友", revive: { projects: [{ id: "one" }] } });
    expect(extractLegacyReviveState(profile)).toEqual({ projects: [{ id: "one" }] });
    expect(extractLegacyReviveState("not-json")).toBeNull();
  });
});

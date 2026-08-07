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
    expect(state.schemaVersion).toBe(5);
    expect(state.activeProjectId).toBe("legacy-1");
    expect(state.projects[0]).toMatchObject({
      title: "课程网站",
      stage: "return",
      restore: { lastCompleted: "完成了首页", stuckAt: "导航在手机上溢出" }
    });
    expect(state.projects[0]?.evidence[0]?.note).toContain("flex");
  });

  it("upgrades version 3 without losing project progress", () => {
    const state = migrateState({
      schemaVersion: 3,
      activeProjectId: "p-1",
      projects: [
        {
          id: "p-1",
          schemaVersion: 3,
          title: "黑客松申请",
          stage: "return",
          status: "active",
          restore: {
            lastCompleted: "写完了问题陈述",
            stuckAt: "没有补团队介绍",
            deadline: "周日",
            whyMatters: "想验证产品"
          },
          decision: "shrink",
          diagnosis: ["缺少队友信息"],
          action: null,
          actionHistory: [],
          evidence: [{ id: "e-1", note: "问题陈述已保存", link: "", createdAt: 1_800_000_000_001 }],
          returnPlan: null,
          createdAt: 1_800_000_000_000,
          updatedAt: 1_800_000_000_001
        }
      ],
      legacyMigrationCompleted: true,
      updatedAt: 1_800_000_000_001
    });

    expect(state.schemaVersion).toBe(5);
    expect(state.projects[0]?.analysis).toBeNull();
    expect(state.projects[0]?.reward).toBeNull();
    expect(state.projects[0]?.evidence[0]?.note).toBe("问题陈述已保存");
    expect(state.projects[0]?.restore.stuckAt).toBe("没有补团队介绍");
  });

  it("upgrades version 4 and preserves every existing project field", () => {
    const state = migrateState({
      schemaVersion: 4,
      activeProjectId: "p-4",
      projects: [
        {
          id: "p-4",
          schemaVersion: 4,
          title: "作品集投递",
          stage: "closed",
          status: "completed",
          restore: {
            lastCompleted: "已经投递",
            stuckAt: "",
            deadline: "",
            whyMatters: "记录自己的完成"
          },
          decision: "continue",
          diagnosis: [],
          action: null,
          actionHistory: [],
          evidence: [],
          returnPlan: null,
          analysis: null,
          createdAt: 1_800_000_000_000,
          updatedAt: 1_800_000_000_001
        }
      ],
      legacyMigrationCompleted: true,
      updatedAt: 1_800_000_000_001
    });

    expect(state.schemaVersion).toBe(5);
    expect(state.projects[0]).toMatchObject({
      id: "p-4",
      title: "作品集投递",
      status: "completed",
      reward: null
    });
  });

  it("extracts the revive payload from the old local guest save", () => {
    const profile = JSON.stringify({ nickname: "朋友", revive: { projects: [{ id: "one" }] } });
    expect(extractLegacyReviveState(profile)).toEqual({ projects: [{ id: "one" }] });
    expect(extractLegacyReviveState("not-json")).toBeNull();
  });

  it("refuses a future schema instead of rebuilding and overwriting it as legacy", () => {
    expect(() =>
      migrateState({
        schemaVersion: 6,
        activeProjectId: "future-project",
        projects: [{ id: "future-project", title: "未来版本项目" }],
        legacyMigrationCompleted: true,
        updatedAt: 1_800_000_000_000
      })
    ).toThrow(/更新版本/);
  });

  it("refuses a damaged current schema instead of dropping its progress fields", () => {
    expect(() =>
      migrateState({
        schemaVersion: 5,
        activeProjectId: "damaged-project",
        projects: [
          {
            id: "damaged-project",
            schemaVersion: 5,
            title: "不能被静默重建的项目",
            evidence: [{ id: "evidence-1", note: "真实成果不能丢" }]
          }
        ],
        legacyMigrationCompleted: true,
        updatedAt: 1_800_000_000_000
      })
    ).toThrow(/没有覆盖/);
  });

  it.each([
    ["a JSON string", "not-a-project-save"],
    ["a JSON array", []],
    ["an empty object", {}],
    ["a damaged version 2 save", { schemaVersion: 2, projects: "not-an-array" }]
  ])("refuses %s instead of turning it into an empty save", (_label, raw) => {
    expect(() => migrateState(raw)).toThrow(/没有覆盖/);
  });

  it("refuses the whole legacy save when one project cannot be migrated", () => {
    expect(() =>
      migrateState({
        schemaVersion: 2,
        projects: [
          { id: "valid", title: "应该保留的项目" },
          { id: "damaged", evidence: [{ note: "不能悄悄丢掉" }] }
        ]
      })
    ).toThrow(/没有静默丢弃/);
  });
});

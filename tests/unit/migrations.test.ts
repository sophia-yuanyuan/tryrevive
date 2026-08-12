import { describe, expect, it } from "vitest";
import { extractLegacyReviveState, migrateState } from "@/shared/domain/migrations";
import { createProject } from "@/shared/domain/model";

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
    expect(state.schemaVersion).toBe(7);
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

    expect(state.schemaVersion).toBe(7);
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

    expect(state.schemaVersion).toBe(7);
    expect(state.projects[0]).toMatchObject({
      id: "p-4",
      title: "作品集投递",
      status: "completed",
      reward: null
    });
  });

  it("upgrades version 5 without losing evidence, return plan, or reward", () => {
    const state = migrateState({
      schemaVersion: 5,
      activeProjectId: "p-5",
      projects: [
        {
          id: "p-5",
          schemaVersion: 5,
          title: "课程作品集",
          stage: "resume",
          status: "active",
          restore: {
            lastCompleted: "完成首页",
            stuckAt: "还没补移动端",
            deadline: "周五",
            whyMatters: "用于课程展示"
          },
          decision: "continue",
          diagnosis: ["移动端仍未处理"],
          action: null,
          actionHistory: [],
          evidence: [
            {
              id: "e-5",
              note: "首页已经保存",
              link: "src/home.vue",
              createdAt: 1_800_000_000_001
            }
          ],
          returnPlan: {
            dueAt: 1_800_086_400_000,
            cue: "先打开首页",
            createdAt: 1_800_000_000_002
          },
          analysis: null,
          reward: { mood: "proud", createdAt: 1_800_000_000_003 },
          createdAt: 1_800_000_000_000,
          updatedAt: 1_800_000_000_003
        }
      ],
      legacyMigrationCompleted: true,
      updatedAt: 1_800_000_000_003
    });

    expect(state.schemaVersion).toBe(7);
    expect(state.pendingInference).toBeNull();
    expect(state.projects[0]).toMatchObject({
      repository: null,
      outcomeDraft: null,
      returnPlan: { cue: "先打开首页" },
      reward: { mood: "proud", music: { engineVersion: 1 } }
    });
    expect(state.projects[0]?.evidence[0]).toMatchObject({
      note: "首页已经保存",
      actionId: null,
      observation: null
    });
  });

  it("upgrades a complete version 6 state and freezes existing rewards as legacy music", () => {
    const now = 1_800_000_000_000;
    const project = createProject("完整迁移项目", now - 86_400_000);
    project.id = "project-v6-complete";
    project.stage = "resume";
    project.restore = {
      lastCompleted: "已经保存真实成果",
      stuckAt: "等待最后确认",
      deadline: "周五",
      whyMatters: "保留完整迁移证据"
    };
    project.decision = "continue";
    project.diagnosis = ["还差一次确认"];
    project.action = {
      id: "action-v6",
      text: "确认最后结果",
      doneDefinition: "结果可打开",
      minutes: 10,
      startedAt: now - 601_000,
      completedAt: now - 1_000,
      createdAt: now - 602_000
    };
    project.evidence = [
      {
        id: "evidence-v6",
        actionId: "action-v6",
        note: "结果已经保存",
        link: "src/result.ts",
        observation: null,
        createdAt: now - 500
      }
    ];
    project.returnPlan = {
      dueAt: now + 86_400_000,
      cue: "打开 src/result.ts",
      createdAt: now - 400
    };
    project.repository = {
      bindingId: "repo_0123456789abcdef01234567",
      displayName: "完整迁移项目",
      lastSnapshot: {
        scannedAt: now - 300,
        fingerprint: "a".repeat(64),
        files: []
      },
      evidence: [],
      actionBaseline: null
    };
    project.reward = null;

    const legacyProject = {
      ...project,
      schemaVersion: 6,
      reward: { mood: "proud", createdAt: now }
    };
    const state = migrateState({
      schemaVersion: 6,
      activeProjectId: project.id,
      projects: [legacyProject],
      pendingInference: null,
      legacyMigrationCompleted: true,
      updatedAt: now
    });

    expect(state.schemaVersion).toBe(7);
    expect(state.activeProjectId).toBe(project.id);
    expect(state.projects[0]).toMatchObject({
      id: project.id,
      schemaVersion: 7,
      restore: project.restore,
      action: project.action,
      evidence: project.evidence,
      returnPlan: project.returnPlan,
      repository: project.repository,
      reward: {
        mood: "proud",
        createdAt: now,
        music: {
          engineVersion: 1,
          actionDurationsSeconds: [600]
        }
      }
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
        schemaVersion: 8,
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
        schemaVersion: 7,
        activeProjectId: "damaged-project",
        projects: [
          {
            id: "damaged-project",
            schemaVersion: 7,
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

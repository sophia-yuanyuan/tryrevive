import { describe, expect, it } from "vitest";
import { createProject } from "@/shared/domain/model";
import {
  addEvidence,
  applyProjectAnalysis,
  assignAction,
  chooseDecision,
  completeAction,
  resumeProject,
  saveRestore,
  scheduleReturn,
  startAction
} from "@/shared/domain/revival";

describe("revival domain flow", () => {
  it("moves through the student P0 loop without losing the last real result", () => {
    const start = 1_800_000_000_000;
    let project = createProject("课程作品集", start);

    project = saveRestore(
      project,
      {
        lastCompleted: "完成了首页布局",
        stuckAt: "移动端导航无法收起",
        deadline: "周五课堂展示",
        whyMatters: "想放进作品集"
      },
      start + 1
    );
    expect(project.stage).toBe("decision");

    project = chooseDecision(project, "shrink", start + 2);
    project = assignAction(
      project,
      {
        text: "只实现导航展开和关闭",
        doneDefinition: "在 390px 下可以连续打开和关闭",
        minutes: 10
      },
      start + 3
    );
    project = startAction(project, start + 4);
    project = completeAction(project, start + 604_000);
    project = addEvidence(
      project,
      { note: "移动端导航已经可以打开和关闭", link: "src/nav.vue" },
      start + 604_001
    );
    project = scheduleReturn(
      project,
      { dueAt: start + 3 * 86_400_000, cue: "先检查键盘操作" },
      start + 604_002
    );

    expect(project.stage).toBe("resume");
    expect(project.evidence.at(-1)?.note).toContain("已经可以");
    expect(project.returnPlan?.cue).toBe("先检查键盘操作");

    project = resumeProject(project, start + 3 * 86_400_000);
    expect(project.stage).toBe("action");
    expect(project.restore.lastCompleted).toBe("完成了首页布局");
  });

  it("keeps action timeboxes inside the 5–20 minute contract", () => {
    const project = chooseDecision(
      saveRestore(createProject("毕业设计"), {
        lastCompleted: "列出了访谈提纲",
        stuckAt: "问题太多",
        deadline: "",
        whyMatters: ""
      }),
      "continue"
    );

    expect(() =>
      assignAction(project, { text: "写一个问题", doneDefinition: "问题已保存", minutes: 4 })
    ).toThrow();
    expect(() =>
      assignAction(project, { text: "写一个问题", doneDefinition: "问题已保存", minutes: 21 })
    ).toThrow();
  });

  it("treats pause and abandon as explicit, recoverable decisions", () => {
    const restored = saveRestore(createProject("社团活动页"), {
      lastCompleted: "整理了文案",
      stuckAt: "没有活动照片",
      deadline: "",
      whyMatters: ""
    });
    const paused = chooseDecision(restored, "pause");
    const abandoned = chooseDecision(restored, "abandon");

    expect(paused).toMatchObject({ status: "paused", stage: "resume" });
    expect(resumeProject(paused)).toMatchObject({ status: "active", stage: "action" });
    expect(abandoned).toMatchObject({ status: "abandoned", stage: "closed" });
  });

  it("keeps a cloud analysis as a user-confirmed draft and reuses its next action", () => {
    const project = applyProjectAnalysis(createProject("黑客松申请", 1_800_000_000_000), {
      id: "draft-1",
      sourceLabel: "报名记录.md",
      originalGoal: "提交一份真实的黑客松申请",
      lastCompleted: "写完项目背景",
      stuckAt: "团队分工还没有落笔",
      deadline: "周日 20:00",
      whyMatters: "想验证 TryRevive",
      stallReasons: ["下一步范围太大", "等待队友信息"],
      suggestedDecision: "shrink",
      nextAction: {
        text: "只写自己的角色和已经完成的工作",
        doneDefinition: "申请表出现一段 80 字以内的个人职责",
        minutes: 10
      },
      uncertainties: ["队友是否已经确认参加"],
      createdAt: 1_800_000_000_001
    });

    expect(project.stage).toBe("decision");
    expect(project.restore.lastCompleted).toBe("写完项目背景");
    expect(project.diagnosis).toHaveLength(2);
    expect(project.analysis?.uncertainties[0]).toContain("队友");
    expect(project.analysis?.nextAction.text).toContain("自己的角色");
  });
});

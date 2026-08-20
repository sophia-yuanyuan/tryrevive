import { describe, expect, it } from "vitest";
import { ProjectAnalysisSchema } from "@/shared/domain/model";
import {
  confirmPendingInference,
  correctPendingInference,
  createPendingInference,
  titleFromAnalysis
} from "@/shared/domain/inference-flow";
import { inferLocalProject } from "@/shared/domain/local-inference";
import { assignAction, chooseDecision } from "@/shared/domain/revival";

function analysis() {
  return ProjectAnalysisSchema.parse({
    id: "analysis-one",
    sourceLabel: "本机文件夹 · course-demo · 只读扫描 3 个文件",
    originalGoal: "完成课程项目的报名页面",
    lastCompleted: "本次扫描到的可读文件中，最近修改的是 src/main.ts",
    stuckAt: "发现一个可能未完成标记：补上报名截止日期（需要你确认）",
    deadline: "",
    whyMatters: "",
    stallReasons: ["存在未完成标记：补上报名截止日期"],
    suggestedDecision: "continue",
    nextAction: {
      text: "先确认 src/main.ts 中的报名截止日期是否仍是当前卡点",
      doneDefinition: "卡点已确认或改正，并留下一个可保存的下一步",
      minutes: 10
    },
    uncertainties: ["文件修改时间不能证明某一步已经完成"],
    createdAt: 1_800_000_000_000
  });
}

const repository = {
  bindingId: "repo_0123456789abcdef01234567",
  displayName: "course-demo",
  snapshot: {
    scannedAt: 1_800_000_000_000,
    fingerprint: "a".repeat(64),
    files: [
      {
        path: "src/main.ts",
        sizeBytes: 120,
        modifiedAt: 1_800_000_000_000,
        contentHash: "b".repeat(64)
      }
    ]
  },
  evidence: [{ path: "src/main.ts", reason: "未完成标记线索" }]
};

describe("inference-first confirmation", () => {
  it("derives a short project title from cloud analysis without trusting a private filename", () => {
    expect(
      titleFromAnalysis(
        { ...analysis(), originalGoal: "我想完成黑客松报名。整理所有材料。" },
        "真实姓名-报名材料.md"
      )
    ).toBe("完成黑客松报名");
    expect(titleFromAnalysis({ ...analysis(), originalGoal: "项目" }, "黑客松报名材料.md")).toBe(
      "黑客松报名材料"
    );
  });

  it("keeps a repository result as a draft until explicit confirmation", () => {
    const pending = createPendingInference(
      {
        sourceKind: "repository",
        title: "course-demo",
        analysis: analysis(),
        repository
      },
      1_800_000_000_001
    );

    expect(pending).not.toHaveProperty("stage");
    expect(pending.repository?.bindingId).toBe(repository.bindingId);
    expect(JSON.stringify(pending)).not.toMatch(/[A-Z]:\\|\\\\/u);
  });

  it("uses corrections while keeping safe scan provenance", () => {
    const pending = createPendingInference(
      {
        sourceKind: "repository",
        title: "course-demo",
        analysis: analysis(),
        repository
      },
      1_800_000_000_001
    );
    const corrected = correctPendingInference(
      pending,
      {
        title: "课程报名页面",
        originalGoal: "在周五前完成报名页面",
        lastCompleted: "表单布局已经完成",
        stuckAt: "还没有补报名截止日期",
        whyMatters: "需要提交课程作业",
        stallReason: "截止日期需要课程老师确认",
        nextActionText: "先给老师写好截止日期确认消息",
        doneDefinition: "消息已经写好并复制到发送框",
        minutes: 5
      },
      1_800_000_000_002
    );
    const project = confirmPendingInference(corrected, 1_800_000_000_003);

    expect(project).toMatchObject({
      title: "课程报名页面",
      stage: "decision",
      status: "active",
      decision: null,
      action: null,
      restore: {
        lastCompleted: "表单布局已经完成",
        stuckAt: "还没有补报名截止日期"
      }
    });
    expect(project.analysis?.stallReasons).toEqual(["截止日期需要课程老师确认"]);
    expect(project.analysis?.nextAction).toEqual({
      text: "先给老师写好截止日期确认消息",
      doneDefinition: "消息已经写好并复制到发送框",
      minutes: 5
    });
    expect(project.repository?.bindingId).toBe(repository.bindingId);
    expect(project.repository?.lastSnapshot.fingerprint).toBe("a".repeat(64));
    expect(project.repository?.evidence[0]?.path).toBe("src/main.ts");

    const decided = chooseDecision(project, "continue", 1_800_000_000_004);
    const actionable = assignAction(decided, project.analysis!.nextAction, 1_800_000_000_005);
    expect(actionable.stage).toBe("execute");
    expect(actionable.action?.minutes).toBe(5);
  });

  it("does not let a confirmed inference bypass the project decision", () => {
    const project = confirmPendingInference(
      createPendingInference({
        sourceKind: "material",
        title: "课程报名页面",
        analysis: analysis(),
        repository: null
      })
    );

    expect(() => assignAction(project, project.analysis!.nextAction)).toThrow(
      "请先判断这个项目要继续、缩小还是求助"
    );
  });

  it("derives a cautious local draft without retaining credentials or absolute paths", () => {
    const result = inferLocalProject({
      sourceKind: "text",
      sourceLabel: "主动输入",
      content:
        '我想完成 TryRevive 课程项目。\n上次已经完成首页。\n现在卡在移动端导航。\n旧路径 C:\\Users\\Alice\\secret\nLinux 路径 /srv/tryrevive/private/config.json 和 /workspace/demo/notes.md\n"password": "my super secret value"\n"authorization": "Bearer quoted-bearer-value-that-must-not-return"\napi_key=sk-example-value-that-must-not-return',
      now: 1_800_000_000_000
    });
    const serialized = JSON.stringify(result);

    expect(result.analysis.lastCompleted).toContain("已经完成首页");
    expect(result.analysis.stuckAt).toContain("卡在移动端导航");
    expect(result.analysis.nextAction.text).toContain("可保存最小版本");
    expect(result.analysis.suggestedDecision).toBe("continue");
    expect(result.analysis.uncertainties[0]).toContain("本地推断");
    expect(serialized).not.toContain("C:\\Users\\Alice");
    expect(serialized).not.toContain("/srv/tryrevive");
    expect(serialized).not.toContain("/workspace/demo");
    expect(serialized).not.toContain("sk-example-value-that-must-not-return");
    expect(serialized).not.toContain("my super secret value");
    expect(serialized).not.toContain("quoted-bearer-value-that-must-not-return");
  });

  it("recommends shrinking when the material cannot establish progress or a concrete blocker", () => {
    const result = inferLocalProject({
      sourceKind: "voice",
      content: "我想申请黑客松，但是现在说不清上次做到哪里。",
      now: 1_800_000_000_000
    });

    expect(result.analysis.suggestedDecision).toBe("shrink");
  });

  it("recommends help, pause, or abandon only when the material contains matching evidence", () => {
    expect(
      inferLocalProject({
        sourceKind: "text",
        content: "我想提交报名。已经写完简介。现在没有权限，需要主办方确认后才能提交。"
      }).analysis.suggestedDecision
    ).toBe("help");
    expect(
      inferLocalProject({
        sourceKind: "text",
        content: "我想补完课程。已经整理了笔记。现在先暂停，等课程重新开放。"
      }).analysis.suggestedDecision
    ).toBe("pause");
    expect(
      inferLocalProject({
        sourceKind: "text",
        content: "我决定放弃这个过期报名，截止时间已经错过，不再做了。"
      }).analysis.suggestedDecision
    ).toBe("abandon");
  });

  it("does not recommend abandonment for a successful application or a stated wish to continue", () => {
    const result = inferLocalProject({
      sourceKind: "voice",
      content: "我想完成答辩。报名已经通过了初审。我不应该放弃。现在还没准备答辩材料。"
    });

    expect(result.analysis.suggestedDecision).not.toBe("abandon");
  });

  it("separates spoken sentences and recognizes an English blocker", () => {
    const result = inferLocalProject({
      sourceKind: "voice",
      content:
        "I want to finish my hackathon application. I already completed the project summary. I am waiting for organizer approval."
    });

    expect(result.analysis.originalGoal).toContain("finish my hackathon application");
    expect(result.analysis.lastCompleted).toContain("completed the project summary");
    expect(result.analysis.stuckAt).toContain("waiting for organizer approval");
    expect(result.analysis.suggestedDecision).toBe("help");
    expect(result.analysis.originalGoal).not.toBe(result.analysis.lastCompleted);
  });

  it("recomputes the recommendation after the user corrects the blocker", () => {
    const pending = createPendingInference({
      sourceKind: "text",
      title: "报名",
      analysis: analysis(),
      repository: null
    });
    const corrected = correctPendingInference(pending, {
      title: "报名",
      originalGoal: "提交报名",
      lastCompleted: "已经写完项目简介",
      stuckAt: "没有提交权限，需要主办方确认",
      whyMatters: "",
      stallReason: "需要主办方确认权限"
    });

    expect(corrected.analysis.suggestedDecision).toBe("help");
  });

  it("ignores local material separators when deriving a multi-file title and goal", () => {
    const result = inferLocalProject({
      sourceKind: "material",
      sourceLabel: "README.md、进度.txt · 2 份",
      content:
        "【本地材料：README.md】\n我想完成黑客松报名。\n【本地材料：进度.txt】\n上次已经写完项目简介。",
      now: 1_800_000_000_000
    });

    expect(result.title).toBe("我想完成黑客松报名");
    expect(result.analysis.originalGoal).toContain("我想完成黑客松报名");
    expect(result.analysis.originalGoal).not.toContain("本地材料");
  });
});

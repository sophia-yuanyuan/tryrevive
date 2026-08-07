import { describe, expect, it } from "vitest";
import { ProjectAnalysisSchema } from "@/shared/domain/model";
import {
  confirmPendingInference,
  correctPendingInference,
  createPendingInference
} from "@/shared/domain/inference-flow";
import { inferLocalProject } from "@/shared/domain/local-inference";
import { assignAction } from "@/shared/domain/revival";

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
        whyMatters: "需要提交课程作业"
      },
      1_800_000_000_002
    );
    const project = confirmPendingInference(corrected, 1_800_000_000_003);

    expect(project).toMatchObject({
      title: "课程报名页面",
      stage: "action",
      status: "active",
      decision: null,
      action: null,
      restore: {
        lastCompleted: "表单布局已经完成",
        stuckAt: "还没有补报名截止日期"
      }
    });
    expect(project.analysis?.nextAction.text).toContain("还没有补报名截止日期");
    expect(project.repository?.bindingId).toBe(repository.bindingId);
    expect(project.repository?.lastSnapshot.fingerprint).toBe("a".repeat(64));
    expect(project.repository?.evidence[0]?.path).toBe("src/main.ts");

    const actionable = assignAction(project, project.analysis!.nextAction, 1_800_000_000_004);
    expect(actionable.stage).toBe("execute");
    expect(actionable.action?.minutes).toBe(10);
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
    expect(result.analysis.uncertainties[0]).toContain("本地推断");
    expect(serialized).not.toContain("C:\\Users\\Alice");
    expect(serialized).not.toContain("/srv/tryrevive");
    expect(serialized).not.toContain("/workspace/demo");
    expect(serialized).not.toContain("sk-example-value-that-must-not-return");
    expect(serialized).not.toContain("my super secret value");
    expect(serialized).not.toContain("quoted-bearer-value-that-must-not-return");
  });
});

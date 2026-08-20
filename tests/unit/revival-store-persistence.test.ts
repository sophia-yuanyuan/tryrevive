import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectAnalysisSchema,
  createEmptyState,
  createProject,
  type AppState,
  type RevivalProject
} from "@/shared/domain/model";
import { chooseDecision, saveRestore } from "@/shared/domain/revival";

const mocks = vi.hoisted(() => ({
  importState: vi.fn(),
  saveState: vi.fn()
}));

vi.mock("@/renderer/platform/web", () => ({
  platform: {
    kind: "web",
    importState: mocks.importState,
    saveState: mocks.saveState
  }
}));

import { useRevivalStore } from "@/renderer/stores/revival";

const restore = {
  lastCompleted: "完成了首页布局",
  stuckAt: "还没有补报名截止日期",
  deadline: "周五展示",
  whyMatters: "需要完成课程项目"
};

const analysis = ProjectAnalysisSchema.parse({
  id: "analysis-persistence",
  sourceLabel: "本机文字材料",
  originalGoal: "完成课程报名页面",
  lastCompleted: restore.lastCompleted,
  stuckAt: restore.stuckAt,
  deadline: restore.deadline,
  whyMatters: restore.whyMatters,
  stallReasons: ["下一步还不明确"],
  suggestedDecision: "continue",
  nextAction: {
    text: "补上报名截止日期",
    doneDefinition: "报名页显示截止日期",
    minutes: 10
  },
  uncertainties: ["需要本人确认"],
  createdAt: 1_800_000_000_000
});

function stateWith(project: RevivalProject): AppState {
  return {
    ...createEmptyState(1_800_000_000_000),
    activeProjectId: project.id,
    projects: [project],
    legacyMigrationCompleted: true
  };
}

function restoredProject(title = "课程项目"): RevivalProject {
  return saveRestore(createProject(title, 1_800_000_000_000), restore, 1_800_000_000_001);
}

async function expectDataUnchangedAfterFailedSave(
  setup: () => AppState,
  run: (store: ReturnType<typeof useRevivalStore>) => Promise<unknown>
): Promise<void> {
  const store = useRevivalStore();
  store.data = setup();
  const before = JSON.parse(JSON.stringify(store.data));
  mocks.saveState.mockRejectedValueOnce(new Error("disk unavailable"));

  await expect(run(store)).rejects.toThrow("disk unavailable");

  expect(store.data).toEqual(before);
  expect(store.saveStatus).toBe("error");
}

describe("revival store save-before-publish", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.importState.mockReset();
    mocks.saveState.mockReset().mockResolvedValue(undefined);
  });

  it("keeps every pre-action stage unchanged when its save fails", async () => {
    const cases: Array<{
      name: string;
      setup: () => AppState;
      run: (store: ReturnType<typeof useRevivalStore>) => Promise<unknown>;
    }> = [
      {
        name: "collect projects",
        setup: () => createEmptyState(1_800_000_000_000),
        run: (store) => store.newProjects(["申请黑客松", "报名英语考试"])
      },
      {
        name: "restore context",
        setup: () => stateWith(createProject("恢复现场", 1_800_000_000_000)),
        run: (store) => store.recordRestore(restore)
      },
      {
        name: "apply analysis",
        setup: () => stateWith(createProject("分析现场", 1_800_000_000_000)),
        run: (store) => store.applyAnalysis(analysis)
      },
      {
        name: "choose direction",
        setup: () => stateWith(restoredProject("项目判断")),
        run: (store) => store.decide("continue")
      },
      {
        name: "save diagnosis",
        setup: () => stateWith(chooseDecision(restoredProject("求助诊断"), "help")),
        run: (store) => store.diagnose(["需要老师确认报名范围"])
      },
      {
        name: "assign action",
        setup: () => stateWith(chooseDecision(restoredProject("下一小步"), "continue")),
        run: (store) => store.setAction(analysis.nextAction)
      },
      {
        name: "resume project",
        setup: () => stateWith(chooseDecision(restoredProject("下次继续"), "pause")),
        run: (store) => store.resume()
      }
    ];

    for (const testCase of cases) {
      setActivePinia(createPinia());
      mocks.saveState.mockReset().mockResolvedValue(undefined);
      await expectDataUnchangedAfterFailedSave(testCase.setup, testCase.run);
    }
  });

  it("keeps the current workspace when a web backup cannot be persisted", async () => {
    const current = stateWith(createProject("必须保留的项目", 1_800_000_000_000));
    const imported = stateWith(createProject("导入的新项目", 1_800_000_100_000));
    mocks.importState.mockResolvedValue({ canceled: false, persisted: false, state: imported });

    await expectDataUnchangedAfterFailedSave(
      () => current,
      (store) => store.importData()
    );
  });

  it("blocks a second direction choice until the first save is durable", async () => {
    const store = useRevivalStore();
    const project = restoredProject("不能双击的项目判断");
    store.data = stateWith(project);
    let resolveSave: () => void = () => undefined;
    mocks.saveState.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      })
    );

    const first = store.decide("continue");
    await nextTick();

    expect(store.activeProject).toMatchObject({ decision: null, stage: "decision" });
    await expect(store.decide("shrink")).rejects.toThrow("上一次保存还在进行");
    expect(mocks.saveState).toHaveBeenCalledTimes(1);

    resolveSave();
    await first;

    expect(store.activeProject).toMatchObject({ decision: "continue", stage: "action" });
  });

  it("does not request focus when the action contract cannot be saved", async () => {
    const store = useRevivalStore();
    const project = chooseDecision(restoredProject("不能幽灵进入专注"), "continue");
    store.data = stateWith(project);
    mocks.saveState.mockRejectedValueOnce(new Error("disk unavailable"));

    await expect(store.setActionAndRequestFocus(analysis.nextAction)).rejects.toThrow(
      "disk unavailable"
    );

    expect(store.activeProject?.action).toBeNull();
    expect(store.activeProject?.stage).toBe("action");
    expect(store.consumeFocusRequest(project.id)).toBe(false);
  });
});

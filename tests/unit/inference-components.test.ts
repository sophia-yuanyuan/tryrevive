import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPendingInference, confirmPendingInference } from "@/shared/domain/inference-flow";
import { ProjectAnalysisSchema, createEmptyState } from "@/shared/domain/model";

const mocks = vi.hoisted(() => ({
  chooseRepository: vi.fn(),
  cloudStatus: vi.fn(),
  quoteCloudContext: vi.fn(),
  analyzeCloudContext: vi.fn(),
  redeemCloudCode: vi.fn(),
  disconnectCloud: vi.fn(),
  importState: vi.fn(),
  saveState: vi.fn()
}));

vi.mock("@/renderer/platform/web", () => ({
  platform: {
    kind: "desktop",
    chooseRepository: mocks.chooseRepository,
    cloudStatus: mocks.cloudStatus,
    quoteCloudContext: mocks.quoteCloudContext,
    analyzeCloudContext: mocks.analyzeCloudContext,
    redeemCloudCode: mocks.redeemCloudCode,
    disconnectCloud: mocks.disconnectCloud,
    importState: mocks.importState,
    saveState: mocks.saveState
  }
}));

import ActionStep from "@/renderer/components/ActionStep.vue";
import InferenceConfirmStep from "@/renderer/components/InferenceConfirmStep.vue";
import ProjectIntake from "@/renderer/components/ProjectIntake.vue";
import { useRevivalStore } from "@/renderer/stores/revival";

function scanResult() {
  const analysis = ProjectAnalysisSchema.parse({
    id: "analysis-component",
    sourceLabel: "本机文件夹 · course-demo · 只读扫描 1 个文件",
    originalGoal: "完成课程报名页面",
    lastCompleted: "最近修改的是 src/main.ts",
    stuckAt: "可能卡在报名截止日期",
    deadline: "",
    whyMatters: "",
    stallReasons: ["发现一个未完成标记"],
    suggestedDecision: "continue",
    nextAction: {
      text: "补上报名截止日期",
      doneDefinition: "截止日期显示在报名页",
      minutes: 10
    },
    uncertainties: ["需要你确认"],
    createdAt: 1_800_000_000_000
  });
  return {
    canceled: false as const,
    bindingId: "repo_0123456789abcdef01234567",
    displayName: "course-demo",
    analysis,
    evidence: [{ path: "src/main.ts", reason: "未完成标记线索" }],
    snapshot: {
      scannedAt: 1_800_000_000_000,
      fingerprint: "a".repeat(64),
      files: [
        {
          path: "src/main.ts",
          sizeBytes: 100,
          modifiedAt: 1_800_000_000_000,
          contentHash: "b".repeat(64)
        }
      ]
    },
    boundary: {
      scannedFileCount: 1,
      readBytes: 100,
      skippedSecretCount: 0,
      skippedLinkCount: 0,
      skippedBinaryCount: 0,
      skippedLargeCount: 0,
      truncated: false
    }
  };
}

describe("inference-first components", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.chooseRepository.mockReset().mockResolvedValue(scanResult());
    mocks.cloudStatus.mockReset().mockResolvedValue({
      available: false,
      authenticated: false,
      balance: null,
      secureSessionStorage: true,
      message: "云端服务未配置；当前不会上传任何内容。"
    });
    mocks.quoteCloudContext.mockReset();
    mocks.analyzeCloudContext.mockReset();
    mocks.redeemCloudCode.mockReset();
    mocks.disconnectCloud.mockReset();
    mocks.importState.mockReset();
    mocks.saveState.mockReset().mockResolvedValue(undefined);
  });

  it("selects a repository once and keeps it as a draft", async () => {
    const store = useRevivalStore();
    const wrapper = mount(ProjectIntake);

    await wrapper.get("button.primary-button").trigger("click");
    await flushPromises();

    expect(mocks.chooseRepository).toHaveBeenCalledTimes(1);
    expect(store.data.projects).toHaveLength(0);
    expect(store.pendingInference?.title).toBe("course-demo");
    expect(mocks.saveState).toHaveBeenCalledTimes(1);
  });

  it("shows folder, voice, attachment, and local text as first-page intake choices", async () => {
    const wrapper = mount(ProjectIntake);
    await flushPromises();

    expect(wrapper.text()).toContain("从项目文件夹恢复");
    expect(wrapper.text()).toContain("语音或常见附件");
    expect(wrapper.text()).toContain("说一段话，或上传现有材料");
    expect(wrapper.text()).toContain("本地文字材料或你记得的内容");
    expect(wrapper.text()).toContain("当前不会上传任何内容");
    expect(wrapper.text()).not.toContain("语音理解暂缓");
    expect(mocks.cloudStatus).toHaveBeenCalledTimes(1);
  });

  it("combines several local text materials before creating one pending draft", async () => {
    const store = useRevivalStore();
    const wrapper = mount(ProjectIntake);
    await flushPromises();
    const input = wrapper.get('input[type="file"][multiple]');
    const files = [
      new File(["我想完成黑客松报名。\n上次已经写完项目简介。"], "README.md", {
        type: "text/markdown"
      }),
      new File(["现在卡在还没有整理个人分工。"], "进度.txt", { type: "text/plain" })
    ];
    Object.defineProperty(input.element, "files", { configurable: true, value: files });

    await input.trigger("change");
    await flushPromises();

    expect(wrapper.text()).toContain("将在本机读取的材料");
    expect(wrapper.text()).toContain("README.md");
    expect(wrapper.text()).toContain("进度.txt");
    expect(wrapper.get('button[type="submit"].primary-button').text()).toContain(
      "从 2 份材料生成待确认草稿"
    );

    await wrapper.get('button[type="submit"].primary-button').trigger("submit");
    await flushPromises();

    expect(store.data.projects).toHaveLength(0);
    expect(store.pendingInference).toMatchObject({ sourceKind: "material" });
    expect(store.pendingInference?.analysis.lastCompleted).toContain("写完项目简介");
    expect(store.pendingInference?.analysis.stuckAt).toContain("个人分工");
    expect(store.pendingInference?.analysis.sourceLabel).toContain("README.md");
  });

  it("keeps a provided cloud analysis pending until the shared confirmation step", async () => {
    const store = useRevivalStore();

    await store.inferProvidedAnalysis({
      analysis: { ...scanResult().analysis, originalGoal: "我想完成黑客松报名。" },
      sourceKind: "material",
      titleHint: "真实姓名-黑客松报名材料.md"
    });

    expect(store.data.projects).toHaveLength(0);
    expect(store.pendingInference).toMatchObject({
      sourceKind: "material",
      title: "完成黑客松报名",
      repository: null
    });
    expect(mocks.saveState).toHaveBeenCalledTimes(1);
  });

  it("corrects a draft before confirmation creates one actionable project", async () => {
    const store = useRevivalStore();
    const result = scanResult();
    const pending = createPendingInference({
      sourceKind: "repository",
      title: result.displayName,
      analysis: result.analysis,
      repository: {
        bindingId: result.bindingId,
        displayName: result.displayName,
        snapshot: result.snapshot,
        evidence: result.evidence
      }
    });
    store.data.pendingInference = pending;
    const wrapper = mount(InferenceConfirmStep, { props: { pending } });

    expect(wrapper.text()).toContain("正确，继续");
    expect(wrapper.text()).toContain("修改");
    expect(store.data.projects).toHaveLength(0);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "修改")
      ?.trigger("click");
    await wrapper.get("#inference-completed").setValue("报名表单布局已经完成");
    await wrapper.get("#inference-reason").setValue("课程老师还没有确认截止日期");
    await wrapper.get("#inference-action").setValue("写好一条截止日期确认消息");
    await wrapper.get("#inference-done").setValue("确认消息已经写好");
    await wrapper.get("#inference-minutes").setValue("5");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(store.data.projects).toHaveLength(0);
    expect(store.pendingInference?.analysis.lastCompleted).toBe("报名表单布局已经完成");
    expect(store.pendingInference?.analysis.stallReasons).toEqual(["课程老师还没有确认截止日期"]);
    expect(store.pendingInference?.analysis.nextAction).toEqual({
      text: "写好一条截止日期确认消息",
      doneDefinition: "确认消息已经写好",
      minutes: 5
    });
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "正确，继续")
      ?.trigger("click");
    await flushPromises();

    expect(store.data.projects).toHaveLength(1);
    expect(store.activeProject?.stage).toBe("action");
    expect(store.activeProject?.restore.lastCompleted).toBe("报名表单布局已经完成");
    expect(store.pendingInference).toBeNull();
  });

  it("discards unsaved corrections when editing is canceled", async () => {
    const store = useRevivalStore();
    const result = scanResult();
    const pending = createPendingInference({
      sourceKind: "repository",
      title: result.displayName,
      analysis: result.analysis,
      repository: {
        bindingId: result.bindingId,
        displayName: result.displayName,
        snapshot: result.snapshot,
        evidence: result.evidence
      }
    });
    store.data.pendingInference = pending;
    const wrapper = mount(InferenceConfirmStep, { props: { pending } });

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "修改")
      ?.trigger("click");
    await wrapper.get("#inference-title").setValue("没有保存的标题");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "取消修改")
      ?.trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "修改")
      ?.trigger("click");

    expect((wrapper.get("#inference-title").element as HTMLInputElement).value).toBe(pending.title);
    expect(store.pendingInference?.title).toBe(pending.title);
  });

  it("keeps the draft and creates no project when confirmation cannot be saved", async () => {
    const store = useRevivalStore();
    const result = scanResult();
    const pending = createPendingInference({
      sourceKind: "repository",
      title: result.displayName,
      analysis: result.analysis,
      repository: {
        bindingId: result.bindingId,
        displayName: result.displayName,
        snapshot: result.snapshot,
        evidence: result.evidence
      }
    });
    store.data.pendingInference = pending;
    let rejectSave: (reason: Error) => void = () => undefined;
    mocks.saveState.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectSave = reject;
      })
    );
    const wrapper = mount(InferenceConfirmStep, { props: { pending } });

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "正确，继续")
      ?.trigger("click");
    await nextTick();

    expect(store.data.projects).toHaveLength(0);
    expect(store.pendingInference?.id).toBe(pending.id);
    expect(wrapper.text()).toContain("我猜你做到这里");

    rejectSave(new Error("disk unavailable"));
    await flushPromises();

    expect(store.data.projects).toHaveLength(0);
    expect(store.pendingInference?.id).toBe(pending.id);
    expect(wrapper.text()).toContain("disk unavailable");
  });

  it("blocks project switching while a confirmation snapshot is still saving", async () => {
    const store = useRevivalStore();
    const result = scanResult();
    const existing = confirmPendingInference(
      createPendingInference({
        sourceKind: "repository",
        title: "existing-project",
        analysis: result.analysis,
        repository: null
      })
    );
    const pending = createPendingInference({
      sourceKind: "repository",
      title: result.displayName,
      analysis: result.analysis,
      repository: {
        bindingId: result.bindingId,
        displayName: result.displayName,
        snapshot: result.snapshot,
        evidence: result.evidence
      }
    });
    store.data = {
      ...createEmptyState(),
      projects: [existing],
      activeProjectId: null,
      pendingInference: pending
    };
    let resolveSave: () => void = () => undefined;
    mocks.saveState.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      })
    );

    const confirming = store.confirmInference();
    await nextTick();

    await expect(store.selectProject(existing.id)).rejects.toThrow("上一次保存还在进行");
    expect(store.data.pendingInference?.id).toBe(pending.id);
    expect(store.data.projects).toHaveLength(1);

    resolveSave();
    await confirming;

    expect(store.data.pendingInference).toBeNull();
    expect(store.data.projects).toHaveLength(2);
  });

  it("rejects a backup chosen while a confirmation snapshot is saving", async () => {
    const store = useRevivalStore();
    const result = scanResult();
    const pending = createPendingInference({
      sourceKind: "repository",
      title: result.displayName,
      analysis: result.analysis,
      repository: {
        bindingId: result.bindingId,
        displayName: result.displayName,
        snapshot: result.snapshot,
        evidence: result.evidence
      }
    });
    store.data = { ...createEmptyState(), pendingInference: pending };
    let resolveImport: (value: {
      canceled: false;
      state: ReturnType<typeof createEmptyState>;
    }) => void = () => undefined;
    mocks.importState.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveImport = resolve;
      })
    );
    let resolveSave: () => void = () => undefined;
    mocks.saveState.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      })
    );

    const importing = store.importData();
    const importExpectation = expect(importing).rejects.toThrow("上一次保存还在进行");
    await nextTick();
    const confirming = store.confirmInference();
    await nextTick();
    resolveImport({ canceled: false, state: createEmptyState() });

    await importExpectation;
    expect(store.data.pendingInference?.id).toBe(pending.id);
    expect(store.data.projects).toHaveLength(0);

    resolveSave();
    await confirming;
    expect(store.data.pendingInference).toBeNull();
    expect(store.data.projects).toHaveLength(1);
  });

  it("turns the confirmed next step into one focus request", async () => {
    const store = useRevivalStore();
    const result = scanResult();
    const project = confirmPendingInference(
      createPendingInference({
        sourceKind: "repository",
        title: result.displayName,
        analysis: result.analysis,
        repository: {
          bindingId: result.bindingId,
          displayName: result.displayName,
          snapshot: result.snapshot,
          evidence: result.evidence
        }
      })
    );
    store.data = {
      ...createEmptyState(),
      activeProjectId: project.id,
      projects: [project],
      legacyMigrationCompleted: true
    };
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
    const wrapper = mount(ActionStep, { props: { project } });

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(store.activeProject?.stage).toBe("execute");
    expect(store.activeProject?.action?.text).toBe("补上报名截止日期");
    expect(store.consumeFocusRequest(project.id)).toBe(true);
    expect(store.consumeFocusRequest(project.id)).toBe(false);
  });

  it("imports a backup that contains only an unconfirmed inference draft", async () => {
    const store = useRevivalStore();
    const result = scanResult();
    const pending = createPendingInference({
      sourceKind: "repository",
      title: result.displayName,
      analysis: result.analysis,
      repository: {
        bindingId: result.bindingId,
        displayName: result.displayName,
        snapshot: result.snapshot,
        evidence: result.evidence
      }
    });
    mocks.importState.mockResolvedValue({
      canceled: false,
      state: { ...createEmptyState(), pendingInference: pending }
    });

    await expect(store.importData()).resolves.toBe("备份已导入");

    expect(store.data.projects).toHaveLength(0);
    expect(store.pendingInference?.id).toBe(pending.id);
  });
});

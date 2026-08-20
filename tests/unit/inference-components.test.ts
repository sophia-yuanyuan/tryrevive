import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPendingInference, confirmPendingInference } from "@/shared/domain/inference-flow";
import { ProjectAnalysisSchema, createEmptyState } from "@/shared/domain/model";
import { chooseDecision } from "@/shared/domain/revival";

const mocks = vi.hoisted(() => ({
  chooseRepository: vi.fn(),
  discoverRepositories: vi.fn(),
  scanDiscoveredRepository: vi.fn(),
  cloudStatus: vi.fn(),
  quoteCloudContext: vi.fn(),
  analyzeCloudContext: vi.fn(),
  redeemCloudCode: vi.fn(),
  disconnectCloud: vi.fn(),
  importState: vi.fn(),
  saveState: vi.fn(),
  localSpeechCapability: vi.fn(),
  transcribeLocalSpeech: vi.fn(),
  startLocalSpeechRecording: vi.fn()
}));

vi.mock("@/renderer/audio/local-speech-recorder", () => ({
  startLocalSpeechRecording: mocks.startLocalSpeechRecording
}));

vi.mock("@/renderer/platform/web", () => ({
  platform: {
    kind: "desktop",
    chooseRepository: mocks.chooseRepository,
    discoverRepositories: mocks.discoverRepositories,
    scanDiscoveredRepository: mocks.scanDiscoveredRepository,
    cloudStatus: mocks.cloudStatus,
    quoteCloudContext: mocks.quoteCloudContext,
    analyzeCloudContext: mocks.analyzeCloudContext,
    redeemCloudCode: mocks.redeemCloudCode,
    disconnectCloud: mocks.disconnectCloud,
    importState: mocks.importState,
    saveState: mocks.saveState,
    localSpeechCapability: mocks.localSpeechCapability,
    transcribeLocalSpeech: mocks.transcribeLocalSpeech
  }
}));

import ActionStep from "@/renderer/components/ActionStep.vue";
import InferenceConfirmStep from "@/renderer/components/InferenceConfirmStep.vue";
import DecisionStep from "@/renderer/components/DecisionStep.vue";
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
    mocks.discoverRepositories.mockReset().mockResolvedValue({
      canceled: false,
      sessionId: "discovery_0123456789abcdef01234567",
      scopeLabel: "D 盘",
      candidates: [
        {
          id: "candidate_0123456789abcdef01234567",
          displayName: "course-demo",
          relativeLocation: "projects/course-demo",
          markers: ["package.json", "README.md"],
          modifiedAt: 1_800_000_000_000
        }
      ],
      boundary: { visitedEntries: 120, skippedDirectoryCount: 8, truncated: false }
    });
    mocks.scanDiscoveredRepository.mockReset().mockResolvedValue(scanResult());
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
    mocks.localSpeechCapability.mockReset().mockResolvedValue({
      available: true,
      culture: "zh-CN",
      recognizer: "Microsoft Speech Recognizer 8.0",
      message: "本机可用"
    });
    mocks.transcribeLocalSpeech.mockReset().mockResolvedValue({
      transcript: "我想完成黑客松报名。上次已经写完项目简介。现在卡在团队分工。",
      culture: "zh-CN",
      confidence: 0.8
    });
    mocks.startLocalSpeechRecording.mockReset().mockResolvedValue({
      stop: vi.fn().mockResolvedValue(new Uint8Array(64)),
      cancel: vi.fn().mockResolvedValue(undefined)
    });
  });

  it("selects a repository once and keeps it as a draft", async () => {
    const store = useRevivalStore();
    const wrapper = mount(ProjectIntake);

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("我知道具体项目文件夹"))
      ?.trigger("click");
    await flushPromises();

    expect(mocks.chooseRepository).toHaveBeenCalledTimes(1);
    expect(store.data.projects).toHaveLength(0);
    expect(store.pendingInference?.title).toBe("course-demo");
    expect(mocks.saveState).toHaveBeenCalledTimes(1);
  });

  it("shows bounded repository omissions in the pending confirmation", async () => {
    const result = scanResult();
    result.boundary.truncated = true;
    result.boundary.skippedSecretCount = 2;
    result.boundary.skippedLargeCount = 1;
    mocks.chooseRepository.mockResolvedValue(result);
    const store = useRevivalStore();
    const wrapper = mount(ProjectIntake);

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("我知道具体项目文件夹"))
      ?.trigger("click");
    await flushPromises();

    expect(store.pendingInference?.analysis.uncertainties[0]).toContain("扫描已达到");
    expect(store.pendingInference?.analysis.uncertainties[1]).toContain("疑似敏感项 2");
    expect(store.pendingInference?.analysis.uncertainties[1]).toContain("过大文件 1");
    const confirmation = mount(InferenceConfirmStep, {
      props: { pending: store.pendingInference! }
    });
    expect(confirmation.text()).toContain("这不是整个文件夹的完整总结");
    expect(confirmation.text()).toContain("选择更小的项目文件夹");
  });

  it("shows folder, voice, attachment, and local text as first-page intake choices", async () => {
    const wrapper = mount(ProjectIntake);
    await flushPromises();

    expect(wrapper.text()).toContain("从项目文件夹恢复");
    expect(wrapper.text()).toContain("从 C／D 盘或大文件夹找项目");
    expect(wrapper.text()).toContain("我已经知道下一步，直接开始");
    expect(wrapper.text()).toContain("语音或常见附件");
    expect(wrapper.text()).toContain("说一段话，或上传现有材料");
    expect(wrapper.text()).toContain("本地文字材料或你记得的内容");
    expect(wrapper.text()).toContain("一次请选择属于同一个项目的材料");
    expect(wrapper.text()).toContain("扫描图片不会 OCR");
    expect(wrapper.text()).toContain("用 Windows 本机语音说");
    expect(wrapper.text()).toContain("无需 API Key");
    expect(wrapper.text()).toContain("只有你主动点击上方本机语音");
    const localFileInput = wrapper.get('input[type="file"][accept*=".yaml"]');
    expect(localFileInput.attributes("accept")).toContain(".pdf");
    expect(localFileInput.attributes("accept")).toContain(".docx");
    expect(wrapper.text()).toContain("当前不会上传任何内容");
    expect(wrapper.text()).not.toContain("语音理解暂缓");
    expect(mocks.cloudStatus).toHaveBeenCalledTimes(1);
  });

  it("discovers drive candidates from metadata and scans only the candidate the user selects", async () => {
    const store = useRevivalStore();
    const wrapper = mount(ProjectIntake);
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("从 C／D 盘"))
      ?.trigger("click");
    await flushPromises();

    expect(mocks.discoverRepositories).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("只依据名称和元数据找到 1 个候选");
    expect(wrapper.text()).toContain("projects/course-demo");
    expect(store.pendingInference).toBeNull();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("读取这个项目"))
      ?.trigger("click");
    await flushPromises();

    expect(mocks.scanDiscoveredRepository).toHaveBeenCalledWith({
      sessionId: "discovery_0123456789abcdef01234567",
      candidateId: "candidate_0123456789abcdef01234567"
    });
    expect(store.pendingInference?.title).toBe("course-demo");
    expect(store.data.projects).toHaveLength(0);
  });

  it("lets a user with a known goal skip inference and persist one unstarted action", async () => {
    const store = useRevivalStore();
    const wrapper = mount(ProjectIntake);
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("我已经知道下一步"))
      ?.trigger("click");
    await nextTick();

    const inputs = wrapper.findAll("input");
    await inputs
      .find((input) => input.attributes("placeholder")?.includes("申请黑客松"))
      ?.setValue("黑客松报名");
    const textareas = wrapper.findAll("textarea");
    await textareas[0]!.setValue("填写项目简介");
    await textareas[1]!.setValue("项目简介已经保存为草稿");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(store.pendingInference).toBeNull();
    expect(store.activeProject).toMatchObject({
      title: "黑客松报名",
      decision: "continue",
      stage: "execute",
      analysis: null
    });
    expect(store.activeProject?.action?.startedAt).toBeNull();
  });

  it("shows an editable local transcript before the user explicitly creates a draft", async () => {
    const store = useRevivalStore();
    const wrapper = mount(ProjectIntake);
    await flushPromises();

    const voiceButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("用 Windows 本机语音说"));
    expect(voiceButton).toBeDefined();
    await voiceButton?.trigger("click");
    await flushPromises();

    expect(mocks.localSpeechCapability).toHaveBeenCalledTimes(1);
    expect(mocks.startLocalSpeechRecording).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("停止并转写");

    await voiceButton?.trigger("click");
    await flushPromises();

    expect(mocks.transcribeLocalSpeech).toHaveBeenCalledTimes(1);
    expect(store.data.projects).toHaveLength(0);
    expect(store.pendingInference).toBeNull();
    expect((wrapper.get("#project-context").element as HTMLTextAreaElement).value).toContain(
      "写完项目简介"
    );
    expect(wrapper.text()).toContain("请先检查或修改文字");
    expect(mocks.saveState).not.toHaveBeenCalled();

    await wrapper
      .get("#project-context")
      .setValue("我想完成黑客松报名。上次已经修改完项目简介。现在卡在团队分工。");
    await wrapper.get('button[type="submit"].primary-button').trigger("submit");
    await flushPromises();

    expect(store.pendingInference?.sourceKind).toBe("voice");
    expect(store.pendingInference?.analysis.sourceLabel).toContain("tryrevive 离线语音转写");
    expect(store.pendingInference?.analysis.lastCompleted).toContain("修改完项目简介");
    expect(store.pendingInference?.analysis.stuckAt).toContain("团队分工");
    expect(mocks.saveState).toHaveBeenCalledTimes(1);
  });

  it("lets the user choose English for the offline transcription request", async () => {
    const wrapper = mount(ProjectIntake);
    await flushPromises();

    await wrapper.get('[aria-label="语音识别语言"]').setValue("en-US");
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("用 Windows 本机语音说"))
      ?.trigger("click");
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("停止并转写"))
      ?.trigger("click");
    await flushPromises();

    expect(mocks.transcribeLocalSpeech).toHaveBeenCalledWith(
      expect.objectContaining({ culture: "en-US" })
    );
  });

  it("keeps the intake usable when microphone permission is denied", async () => {
    mocks.startLocalSpeechRecording.mockRejectedValue(
      new DOMException("permission denied", "NotAllowedError")
    );
    const wrapper = mount(ProjectIntake);
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("用 Windows 本机语音说"))
      ?.trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("没有获得麦克风权限");
    expect(wrapper.text()).toContain("没有保存或上传任何声音");
    expect(mocks.transcribeLocalSpeech).not.toHaveBeenCalled();
    expect(wrapper.get("#project-context").attributes("disabled")).toBeUndefined();
  });

  it("explains a missing offline runtime without starting the microphone", async () => {
    mocks.localSpeechCapability.mockResolvedValue({
      available: false,
      culture: null,
      recognizer: null,
      message: "离线语音运行时没有随当前构建完整安装。"
    });
    const wrapper = mount(ProjectIntake);
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("用 Windows 本机语音说"))
      ?.trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("离线语音运行时");
    expect(mocks.startLocalSpeechRecording).not.toHaveBeenCalled();
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
    expect(wrapper.text()).toContain("原文不会写入存档");
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
    expect(store.pendingInference?.title).toBe("我想完成黑客松报名");
  });

  it("does not pretend a Feishu or application URL alone has been read", async () => {
    const store = useRevivalStore();
    const wrapper = mount(ProjectIntake);
    await flushPromises();

    await wrapper
      .get("#source-url")
      .setValue("https://example.feishu.cn/docx/private?token=must-not-persist");
    await wrapper.get('button[type="submit"].primary-button').trigger("submit");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("不会只靠链接读取登录页");
    expect(store.pendingInference).toBeNull();
    expect(mocks.saveState).not.toHaveBeenCalled();
  });

  it("uses pasted page content while retaining only the source host", async () => {
    const store = useRevivalStore();
    const wrapper = mount(ProjectIntake);
    await flushPromises();

    await wrapper
      .get("#source-url")
      .setValue("https://hackathon.example/apply?invite=must-not-persist");
    await wrapper
      .get("#project-context")
      .setValue("我想申请黑客松。上次已经写完项目简介。现在卡在团队分工。");
    await wrapper.get('button[type="submit"].primary-button').trigger("submit");
    await flushPromises();

    expect(store.pendingInference?.sourceKind).toBe("material");
    expect(store.pendingInference?.analysis.sourceLabel).toContain("hackathon.example");
    expect(JSON.stringify(store.pendingInference)).not.toContain("must-not-persist");
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

  it("corrects a draft before confirmation creates one project awaiting a decision", async () => {
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
    const wrapper = mount(InferenceConfirmStep, { props: { pending }, attachTo: document.body });

    await nextTick();
    expect(document.activeElement).toBe(wrapper.get("#stage-title").element);

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
    expect(store.activeProject?.stage).toBe("decision");
    expect(store.activeProject?.decision).toBeNull();
    expect(store.activeProject?.restore.lastCompleted).toBe("报名表单布局已经完成");
    expect(store.pendingInference).toBeNull();
    wrapper.unmount();
  });

  it("leads with one project judgment while keeping all alternatives including abandon", async () => {
    const store = useRevivalStore();
    const result = scanResult();
    const project = confirmPendingInference(
      createPendingInference({
        sourceKind: "repository",
        title: result.displayName,
        analysis: { ...result.analysis, suggestedDecision: "shrink" },
        repository: null
      })
    );
    store.data = {
      ...createEmptyState(),
      activeProjectId: project.id,
      projects: [project]
    };
    const wrapper = mount(DecisionStep, { props: { project } });

    expect(wrapper.text()).toContain("tryrevive 建议：缩小");
    expect(wrapper.text()).toContain("接受建议：缩小");
    expect(wrapper.text()).toContain("这个判断不合适？换一个");
    expect(wrapper.text()).toContain("放弃");

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("接受建议：缩小"))
      ?.trigger("click");
    await flushPromises();

    expect(store.activeProject?.decision).toBe("shrink");
    expect(store.activeProject?.stage).toBe("action");
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
    const decidedProject = chooseDecision(project, "continue");
    store.data = {
      ...createEmptyState(),
      activeProjectId: decidedProject.id,
      projects: [decidedProject],
      legacyMigrationCompleted: true
    };
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
    const wrapper = mount(ActionStep, { props: { project: decidedProject } });

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

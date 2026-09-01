import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EvidenceStep from "@/renderer/components/EvidenceStep.vue";
import ReturnStep from "@/renderer/components/ReturnStep.vue";
import { useRevivalStore } from "@/renderer/stores/revival";
import { confirmPendingInference, createPendingInference } from "@/shared/domain/inference-flow";
import { ProjectAnalysisSchema, createEmptyState } from "@/shared/domain/model";
import type { RepositorySnapshot } from "@/shared/domain/repository";
import { assignAction, chooseDecision } from "@/shared/domain/revival";

const mocks = vi.hoisted(() => ({
  rescanRepository: vi.fn(),
  saveState: vi.fn()
}));

vi.mock("@/renderer/platform/web", () => ({
  platform: {
    kind: "desktop",
    rescanRepository: mocks.rescanRepository,
    saveState: mocks.saveState
  }
}));

const bindingId = "repo_0123456789abcdef01234567";

function analysis() {
  return ProjectAnalysisSchema.parse({
    id: "analysis-outcome",
    sourceLabel: "本机文件夹 · course-demo",
    originalGoal: "完成课程报名页",
    lastCompleted: "表单布局已经完成",
    stuckAt: "还没有补报名截止日期",
    deadline: "",
    whyMatters: "",
    stallReasons: ["截止日期未确认"],
    suggestedDecision: "continue",
    nextAction: {
      text: "补上报名截止日期",
      doneDefinition: "截止日期显示在报名页",
      minutes: 10
    },
    uncertainties: ["需要你确认"],
    createdAt: 1_800_000_000_000
  });
}

function snapshot(hash: string, scannedAt: number, modifiedAt = scannedAt): RepositorySnapshot {
  return {
    scannedAt,
    fingerprint: hash.repeat(64).slice(0, 64),
    files: [
      {
        path: "src/main.ts",
        sizeBytes: 120,
        modifiedAt,
        contentHash: hash.repeat(64).slice(0, 64)
      }
    ]
  };
}

function scanResult(value: RepositorySnapshot) {
  return {
    canceled: false as const,
    bindingId,
    displayName: "course-demo",
    analysis: analysis(),
    evidence: [{ path: "src/main.ts", reason: "可读源文件" }],
    snapshot: value,
    boundary: {
      scannedFileCount: value.files.length,
      readBytes: 120,
      skippedSecretCount: 0,
      skippedLinkCount: 0,
      skippedBinaryCount: 0,
      skippedLargeCount: 0,
      truncated: false
    }
  };
}

function seedStore() {
  const store = useRevivalStore();
  const initial = snapshot("a", 1_800_000_000_000);
  const confirmed = confirmPendingInference(
    createPendingInference({
      sourceKind: "repository",
      title: "course-demo",
      analysis: analysis(),
      repository: {
        bindingId,
        displayName: "course-demo",
        snapshot: initial,
        evidence: [{ path: "src/main.ts", reason: "可读源文件" }]
      }
    })
  );
  const project = assignAction(
    chooseDecision(confirmed, "continue"),
    confirmed.analysis!.nextAction
  );
  store.data = {
    ...createEmptyState(),
    activeProjectId: project.id,
    projects: [project],
    legacyMigrationCompleted: true
  };
  return store;
}

describe("repository outcome confirmation", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.rescanRepository.mockReset();
    mocks.saveState.mockReset().mockResolvedValue(undefined);
  });

  it("captures a baseline, creates only a draft, and records evidence after Correct", async () => {
    const store = seedStore();
    const baseline = snapshot("a", 1_800_000_001_000);
    const current = snapshot("b", 1_800_000_002_000);
    mocks.rescanRepository
      .mockResolvedValueOnce(scanResult(baseline))
      .mockResolvedValueOnce(scanResult(current));

    await store.beginAction();
    const actionId = store.activeProject!.action!.id;
    expect(store.activeProject?.repository?.actionBaseline).toMatchObject({ actionId });

    await store.finishAction();
    expect(store.activeProject).toMatchObject({
      stage: "evidence",
      status: "active",
      reward: null
    });
    expect(store.activeProject?.evidence).toHaveLength(0);
    expect(store.activeProject?.outcomeDraft?.changes).toContainEqual({
      path: "src/main.ts",
      kind: "content_changed"
    });

    const wrapper = mount(EvidenceStep, { props: { project: store.activeProject! } });
    const observation = wrapper.get('[aria-label="TryRevive 观察到的文件变化"]');
    expect(observation.text()).toContain("src/main.ts");
    expect(observation.text()).toContain("内容与开始前不同");
    await wrapper.get('input[value="yes"]').setValue(true);
    await wrapper.get("button.primary-button").trigger("click");
    await flushPromises();

    expect(store.activeProject?.stage).toBe("return");
    expect(store.activeProject?.outcomeDraft).toBeNull();
    expect(store.activeProject?.evidence).toHaveLength(1);
    expect(store.activeProject?.evidence[0]).toMatchObject({
      actionId,
      substantiveProgress: "yes",
      observation: { kind: "repository_diff", paths: ["src/main.ts"] }
    });

    const returnStep = mount(ReturnStep, { props: { project: store.activeProject! } });
    expect((returnStep.get("#return-cue").element as HTMLTextAreaElement).value).toContain(
      "src/main.ts"
    );
  });

  it("keeps the machine observation separate when the user modifies the result note", async () => {
    const store = seedStore();
    mocks.rescanRepository
      .mockResolvedValueOnce(scanResult(snapshot("a", 1_800_000_001_000)))
      .mockResolvedValueOnce(scanResult(snapshot("b", 1_800_000_002_000)));
    await store.beginAction();
    await store.finishAction();
    const wrapper = mount(EvidenceStep, { props: { project: store.activeProject! } });

    await wrapper.get("button.secondary-button").trigger("click");
    await wrapper.get("#evidence-note").setValue("我补上了报名截止日期");
    await wrapper.get('input[value="uncertain"]').setValue(true);
    await wrapper.get("#progress-reason").setValue("文件变了，但还没有走真实报名流程");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(store.activeProject?.evidence[0]?.note).toBe("我补上了报名截止日期");
    expect(store.activeProject?.evidence[0]).toMatchObject({
      substantiveProgress: "uncertain",
      progressReason: "文件变了，但还没有走真实报名流程"
    });
    expect(store.activeProject?.evidence[0]?.observation?.paths).toEqual(["src/main.ts"]);
  });

  it("requires a substantive-progress judgment before saving evidence", async () => {
    const store = seedStore();
    mocks.rescanRepository
      .mockResolvedValueOnce(scanResult(snapshot("a", 1_800_000_001_000)))
      .mockResolvedValueOnce(scanResult(snapshot("b", 1_800_000_002_000)));
    await store.beginAction();
    await store.finishAction();
    const wrapper = mount(EvidenceStep, { props: { project: store.activeProject! } });

    await wrapper.get("button.primary-button").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("请选择这次是否让项目产生了实质推进");
    expect(store.activeProject?.stage).toBe("evidence");
    expect(store.activeProject?.evidence).toHaveLength(0);
  });

  it("does not block focus when the baseline scan fails and falls back to a manual result", async () => {
    const store = seedStore();
    mocks.rescanRepository.mockRejectedValueOnce(new Error("binding unavailable"));

    await expect(store.beginAction()).resolves.toBeUndefined();
    expect(store.activeProject?.action?.startedAt).not.toBeNull();
    expect(store.activeProject?.repository?.actionBaseline).toBeNull();

    await store.finishAction();
    expect(store.activeProject?.stage).toBe("evidence");
    expect(store.activeProject?.outcomeDraft?.status).toBe("scan_failed");
    expect(store.activeProject?.evidence).toHaveLength(0);
    const wrapper = mount(EvidenceStep, { props: { project: store.activeProject! } });
    expect(wrapper.find('[aria-label="TryRevive 观察到的文件变化"]').exists()).toBe(false);
    expect(wrapper.get("#evidence-note").isVisible()).toBe(true);
  });

  it("treats an mtime-only rescan as no readable change and keeps manual evidence available", async () => {
    const store = seedStore();
    mocks.rescanRepository
      .mockResolvedValueOnce(scanResult(snapshot("a", 1_800_000_001_000)))
      .mockResolvedValueOnce(scanResult(snapshot("a", 1_800_000_002_000, 1_800_000_009_000)));

    await store.beginAction();
    await store.finishAction();

    expect(store.activeProject?.outcomeDraft?.status).toBe("no_readable_change");
    expect(store.activeProject?.outcomeDraft?.changes).toEqual([]);
    expect(store.activeProject?.evidence).toHaveLength(0);
    const wrapper = mount(EvidenceStep, { props: { project: store.activeProject! } });
    expect(wrapper.text()).toContain("有限扫描没有读到内容变化");
    expect(wrapper.get("#evidence-note").isVisible()).toBe(true);
  });

  it("does not publish a completed action when the outcome snapshot cannot be saved", async () => {
    const store = seedStore();
    mocks.rescanRepository
      .mockResolvedValueOnce(scanResult(snapshot("a", 1_800_000_001_000)))
      .mockResolvedValueOnce(scanResult(snapshot("b", 1_800_000_002_000)));
    await store.beginAction();
    mocks.saveState.mockRejectedValueOnce(new Error("disk unavailable"));

    await expect(store.finishAction()).rejects.toThrow("disk unavailable");

    expect(store.activeProject?.stage).toBe("execute");
    expect(store.activeProject?.action?.completedAt).toBeNull();
    expect(store.activeProject?.outcomeDraft).toBeNull();
    expect(store.activeProject?.evidence).toHaveLength(0);
  });
});

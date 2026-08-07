import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  type AppState,
  type Decision,
  type ProjectMood,
  type ProjectAnalysis,
  type RestoreContext,
  type RevivalProject,
  AppStateSchema,
  createEmptyState,
  createProject
} from "@/shared/domain/model";
import { migrateState } from "@/shared/domain/migrations";
import {
  confirmPendingInference,
  correctPendingInference,
  createPendingInference,
  type InferenceCorrection
} from "@/shared/domain/inference-flow";
import { inferLocalProject, type LocalInferenceRequest } from "@/shared/domain/local-inference";
import {
  addEvidence,
  applyProjectAnalysis,
  assignAction,
  chooseDecision,
  completeAction,
  markProjectCompleted,
  resumeProject,
  saveDiagnosis,
  saveRestore,
  scheduleReturn,
  setProjectReward,
  startAction
} from "@/shared/domain/revival";
import { platform } from "@/renderer/platform/web";

let saveQueue = Promise.resolve();

export const useRevivalStore = defineStore("revival", () => {
  const data = ref<AppState>(createEmptyState());
  const ready = ref(false);
  const saveStatus = ref<"idle" | "saving" | "saved" | "error">("idle");
  const errorMessage = ref("");
  const recoveryRequired = ref(false);
  const recoveryNotice = ref("");
  const focusRequestedProjectId = ref<string | null>(null);
  const candidateCommitInFlight = ref(false);

  const activeProject = computed(
    () => data.value.projects.find((project) => project.id === data.value.activeProjectId) ?? null
  );
  const openProjects = computed(() =>
    data.value.projects.filter((project) => !["abandoned", "completed"].includes(project.status))
  );
  const pendingInference = computed(() => data.value.pendingInference);

  async function saveSnapshot(snapshot: AppState): Promise<void> {
    if (recoveryRequired.value) {
      throw new Error("本地存档正在等待恢复；为防止覆盖原文件，请先导入有效的 JSON 备份");
    }
    saveStatus.value = "saving";
    saveQueue = saveQueue.catch(() => undefined).then(() => platform.saveState(snapshot));
    try {
      await saveQueue;
      saveStatus.value = "saved";
      errorMessage.value = "";
    } catch (error) {
      saveStatus.value = "error";
      errorMessage.value = error instanceof Error ? error.message : "本地保存失败";
      throw error;
    }
  }

  async function persist(): Promise<void> {
    data.value.updatedAt = Date.now();
    const snapshot = AppStateSchema.parse(JSON.parse(JSON.stringify(data.value)));
    await saveSnapshot(snapshot);
  }

  async function commitCandidate(candidate: AppState, beforePublish?: () => void): Promise<void> {
    if (candidateCommitInFlight.value) {
      throw new Error("上一次保存还在进行，请等它完成后再操作");
    }
    candidateCommitInFlight.value = true;
    try {
      candidate.updatedAt = Date.now();
      const snapshot = AppStateSchema.parse(JSON.parse(JSON.stringify(candidate)));
      await saveSnapshot(snapshot);
      beforePublish?.();
      data.value = snapshot;
    } finally {
      candidateCommitInFlight.value = false;
    }
  }

  async function initialize(): Promise<void> {
    try {
      const loaded = await platform.loadState();
      recoveryNotice.value = loaded.recoveryMessage ?? "";
      if (loaded.recoveryRequired) {
        recoveryRequired.value = true;
        errorMessage.value = loaded.recoveryMessage ?? "本地存档需要恢复；TryRevive 没有覆盖原文件";
        saveStatus.value = "error";
        return;
      }
      data.value = migrateState(loaded.state);
      data.value.legacyMigrationCompleted = true;
      await persist();
    } catch (error) {
      data.value = createEmptyState();
      recoveryRequired.value = true;
      recoveryNotice.value =
        "TryRevive 已停止自动保存，原存档没有被空白数据覆盖。请导入有效的 JSON 备份。";
      errorMessage.value = error instanceof Error ? error.message : "无法安全载入本地进度";
      saveStatus.value = "error";
    } finally {
      ready.value = true;
    }
  }

  function replaceActive(project: RevivalProject): void {
    const index = data.value.projects.findIndex((item) => item.id === project.id);
    if (index < 0) throw new Error("找不到当前项目");
    data.value.projects[index] = project;
  }

  function stateSnapshot(): AppState {
    return AppStateSchema.parse(JSON.parse(JSON.stringify(data.value)));
  }

  function assertNoCandidateCommit(): void {
    if (candidateCommitInFlight.value) {
      throw new Error("上一次保存还在进行，请等它完成后再操作");
    }
  }

  async function newProject(title: string): Promise<void> {
    await newProjects([title]);
  }

  async function newProjects(titles: string[]): Promise<void> {
    const existing = new Set(
      data.value.projects.map((project) => project.title.toLocaleLowerCase("zh-CN"))
    );
    const available = Math.max(0, 100 - data.value.projects.length);
    const projects = titles
      .map((title) => title.trim().slice(0, 80))
      .filter(Boolean)
      .filter((title) => {
        const key = title.toLocaleLowerCase("zh-CN");
        if (existing.has(key)) return false;
        existing.add(key);
        return true;
      })
      .slice(0, available)
      .map((title) => createProject(title));
    if (!projects.length) throw new Error("没有发现可新建的项目，可能都已经在本地存档中。");
    data.value.projects.unshift(...projects);
    data.value.activeProjectId = projects[0]?.id ?? null;
    data.value.pendingInference = null;
    await persist();
  }

  async function inferRepository(): Promise<boolean> {
    const result = await platform.chooseRepository();
    if (result.canceled) return false;
    const candidate = stateSnapshot();
    candidate.activeProjectId = null;
    candidate.pendingInference = createPendingInference({
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
    await commitCandidate(candidate);
    return true;
  }

  async function inferLocalContext(request: Omit<LocalInferenceRequest, "now">): Promise<void> {
    const inferred = inferLocalProject(request);
    const candidate = stateSnapshot();
    candidate.activeProjectId = null;
    candidate.pendingInference = createPendingInference({
      sourceKind: request.sourceKind,
      title: inferred.title,
      analysis: inferred.analysis,
      repository: null
    });
    await commitCandidate(candidate);
  }

  async function correctInference(input: InferenceCorrection): Promise<void> {
    if (!data.value.pendingInference) return;
    const candidate = stateSnapshot();
    candidate.pendingInference = correctPendingInference(data.value.pendingInference, input);
    await commitCandidate(candidate);
  }

  async function discardInference(): Promise<void> {
    const candidate = stateSnapshot();
    candidate.pendingInference = null;
    await commitCandidate(candidate);
  }

  async function confirmInference(): Promise<void> {
    const pending = data.value.pendingInference;
    if (!pending) return;
    if (data.value.projects.length >= 100)
      throw new Error("本地项目已达到 100 个，请先导出备份再整理。");
    if (
      pending.repository &&
      data.value.projects.some(
        (project) =>
          project.repository?.bindingId === pending.repository?.bindingId &&
          !["abandoned", "completed"].includes(project.status)
      )
    ) {
      throw new Error("这个项目文件夹已经有一个进行中的项目；请从项目列表继续，或先结束旧项目。");
    }
    const project = confirmPendingInference(pending);
    const candidate = stateSnapshot();
    candidate.projects.unshift(project);
    candidate.activeProjectId = project.id;
    candidate.pendingInference = null;
    await commitCandidate(candidate);
  }

  async function selectProject(projectId: string): Promise<void> {
    if (!data.value.projects.some((project) => project.id === projectId)) return;
    const candidate = stateSnapshot();
    candidate.activeProjectId = projectId;
    await commitCandidate(candidate);
  }

  async function reviewInference(): Promise<void> {
    if (!data.value.pendingInference) return;
    const candidate = stateSnapshot();
    candidate.activeProjectId = null;
    await commitCandidate(candidate);
  }

  async function prepareNewProject(): Promise<void> {
    const candidate = stateSnapshot();
    candidate.activeProjectId = null;
    candidate.pendingInference = null;
    await commitCandidate(candidate);
  }

  async function recordRestore(restore: RestoreContext): Promise<void> {
    if (!activeProject.value) return;
    replaceActive(saveRestore(activeProject.value, restore));
    await persist();
  }

  async function applyAnalysis(analysis: ProjectAnalysis): Promise<void> {
    if (!activeProject.value) return;
    replaceActive(applyProjectAnalysis(activeProject.value, analysis));
    await persist();
  }

  async function decide(decision: Decision): Promise<void> {
    if (!activeProject.value) return;
    replaceActive(chooseDecision(activeProject.value, decision));
    await persist();
  }

  async function diagnose(answers: string[]): Promise<void> {
    if (!activeProject.value) return;
    replaceActive(saveDiagnosis(activeProject.value, answers));
    await persist();
  }

  async function setAction(input: {
    text: string;
    doneDefinition: string;
    minutes: number;
  }): Promise<void> {
    if (!activeProject.value) return;
    replaceActive(assignAction(activeProject.value, input));
    await persist();
  }

  async function setActionAndRequestFocus(input: {
    text: string;
    doneDefinition: string;
    minutes: number;
  }): Promise<void> {
    if (!activeProject.value) return;
    const projectId = activeProject.value.id;
    const candidate = stateSnapshot();
    const index = candidate.projects.findIndex((project) => project.id === projectId);
    if (index < 0) throw new Error("找不到当前项目");
    candidate.projects[index] = assignAction(candidate.projects[index]!, input);
    await commitCandidate(candidate, () => {
      focusRequestedProjectId.value = projectId;
    });
  }

  function consumeFocusRequest(projectId: string): boolean {
    if (focusRequestedProjectId.value !== projectId) return false;
    focusRequestedProjectId.value = null;
    return true;
  }

  async function beginAction(): Promise<void> {
    if (!activeProject.value) return;
    replaceActive(startAction(activeProject.value));
    await persist();
  }

  async function finishAction(): Promise<void> {
    if (!activeProject.value) return;
    replaceActive(completeAction(activeProject.value));
    await persist();
  }

  async function recordEvidence(input: { note: string; link?: string }): Promise<void> {
    if (!activeProject.value) return;
    replaceActive(addEvidence(activeProject.value, input));
    await persist();
  }

  async function setReturnPlan(input: { dueAt: number; cue: string }): Promise<void> {
    if (!activeProject.value) return;
    replaceActive(scheduleReturn(activeProject.value, input));
    await persist();
  }

  async function resume(): Promise<void> {
    if (!activeProject.value) return;
    replaceActive(resumeProject(activeProject.value));
    await persist();
  }

  async function completeProject(mood: ProjectMood): Promise<void> {
    if (!activeProject.value) return;
    replaceActive(markProjectCompleted(activeProject.value, mood));
    await persist();
  }

  async function setRewardMood(projectId: string, mood: ProjectMood): Promise<void> {
    const project = data.value.projects.find((item) => item.id === projectId);
    if (!project) throw new Error("找不到这张项目唱片");
    const index = data.value.projects.findIndex((item) => item.id === projectId);
    data.value.projects[index] = setProjectReward(project, mood);
    await persist();
  }

  async function exportData(): Promise<string> {
    if (recoveryRequired.value) {
      throw new Error("当前存档尚未安全载入，不能导出空白数据；请先导入有效备份");
    }
    const result = await platform.exportState(data.value);
    return result.canceled ? "已取消导出" : result.path ? `已导出到 ${result.path}` : "已导出备份";
  }

  async function importData(): Promise<string> {
    assertNoCandidateCommit();
    const result = await platform.importState();
    if (result.canceled) return "已取消导入";
    assertNoCandidateCommit();
    if (result.state == null) throw new Error("无法读取这个 JSON 备份；现有项目没有被替换");
    const imported = migrateState(result.state);
    if (!imported.projects.length && !imported.pendingInference && result.state) {
      throw new Error("备份中没有可导入的项目或待确认恢复摘要");
    }
    data.value = { ...imported, legacyMigrationCompleted: true };
    const wasRecoveryRequired = recoveryRequired.value;
    recoveryRequired.value = false;
    try {
      if (result.persisted) {
        saveStatus.value = "saved";
      } else {
        await persist();
      }
    } catch (error) {
      recoveryRequired.value = wasRecoveryRequired;
      throw error;
    }
    errorMessage.value = "";
    recoveryNotice.value = "有效备份已导入，本地自动保存已经恢复";
    return "备份已导入";
  }

  return {
    data,
    ready,
    saveStatus,
    errorMessage,
    recoveryRequired,
    recoveryNotice,
    activeProject,
    openProjects,
    pendingInference,
    platformKind: platform.kind,
    initialize,
    newProject,
    newProjects,
    inferRepository,
    inferLocalContext,
    correctInference,
    discardInference,
    confirmInference,
    selectProject,
    reviewInference,
    prepareNewProject,
    recordRestore,
    applyAnalysis,
    decide,
    diagnose,
    setAction,
    setActionAndRequestFocus,
    consumeFocusRequest,
    beginAction,
    finishAction,
    recordEvidence,
    setReturnPlan,
    resume,
    completeProject,
    setRewardMood,
    exportData,
    importData
  };
});

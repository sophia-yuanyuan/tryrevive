import {
  ActionSchema,
  type Decision,
  EvidenceSchema,
  ProjectAnalysisSchema,
  type ProjectAnalysis,
  type ProjectMood,
  ProjectRewardSchema,
  type RepositoryObservation,
  type RestoreContext,
  ReturnPlanSchema,
  type RevivalAction,
  type RevivalProject,
  createId
} from "./model";
import { captureLegacyMusicRecipe } from "../audio/music-recipe";

function touch(project: RevivalProject, now = Date.now()): RevivalProject {
  return { ...project, updatedAt: now };
}

export function saveRestore(
  project: RevivalProject,
  restore: RestoreContext,
  now = Date.now()
): RevivalProject {
  if (!restore.lastCompleted.trim() || !restore.stuckAt.trim()) {
    throw new Error("请先写下最后完成的内容和当前卡点。");
  }
  return touch({ ...project, restore, stage: "decision", status: "active" }, now);
}

export function applyProjectAnalysis(
  project: RevivalProject,
  input: ProjectAnalysis,
  now = Date.now()
): RevivalProject {
  const analysis = ProjectAnalysisSchema.parse(input);
  return touch(
    {
      ...project,
      restore: {
        lastCompleted: analysis.lastCompleted,
        stuckAt: analysis.stuckAt,
        deadline: analysis.deadline,
        whyMatters: analysis.whyMatters
      },
      diagnosis: analysis.stallReasons,
      analysis,
      status: "active",
      stage: "decision"
    },
    now
  );
}

export function chooseDecision(
  project: RevivalProject,
  decision: Decision,
  now = Date.now()
): RevivalProject {
  if (decision === "pause") {
    return touch({ ...project, decision, status: "paused", stage: "resume" }, now);
  }
  if (decision === "abandon") {
    return touch({ ...project, decision, status: "abandoned", stage: "closed" }, now);
  }
  return touch(
    {
      ...project,
      decision,
      status: "active",
      stage: decision === "help" ? "diagnosis" : "action"
    },
    now
  );
}

export function saveDiagnosis(
  project: RevivalProject,
  answers: string[],
  now = Date.now()
): RevivalProject {
  const diagnosis = answers
    .map((answer) => answer.trim())
    .filter(Boolean)
    .slice(0, 3);
  return touch({ ...project, diagnosis, stage: "action" }, now);
}

export function assignAction(
  project: RevivalProject,
  input: Pick<RevivalAction, "text" | "doneDefinition" | "minutes">,
  now = Date.now()
): RevivalProject {
  const action = ActionSchema.parse({
    id: createId("action"),
    ...input,
    startedAt: null,
    completedAt: null,
    createdAt: now
  });
  const history = project.action
    ? [...project.actionHistory, project.action].slice(-50)
    : project.actionHistory;
  return touch(
    {
      ...project,
      action,
      actionHistory: history,
      returnPlan: null,
      outcomeDraft: null,
      repository: project.repository
        ? { ...project.repository, actionBaseline: null }
        : project.repository,
      stage: "execute"
    },
    now
  );
}

export function startAction(project: RevivalProject, now = Date.now()): RevivalProject {
  if (!project.action) throw new Error("还没有设定下一小步。");
  return touch(
    { ...project, action: { ...project.action, startedAt: project.action.startedAt ?? now } },
    now
  );
}

export function completeAction(project: RevivalProject, now = Date.now()): RevivalProject {
  if (!project.action) throw new Error("还没有可完成的下一小步。");
  return touch(
    { ...project, action: { ...project.action, completedAt: now }, stage: "evidence" },
    now
  );
}

export function addEvidence(
  project: RevivalProject,
  input: { note: string; link?: string; observation?: RepositoryObservation | null },
  now = Date.now()
): RevivalProject {
  const evidence = EvidenceSchema.parse({
    id: createId("evidence"),
    actionId: project.action?.id ?? null,
    note: input.note,
    link: input.link ?? "",
    observation: input.observation ?? null,
    createdAt: now
  });
  return touch(
    {
      ...project,
      evidence: [...project.evidence, evidence],
      outcomeDraft: null,
      repository: project.repository
        ? { ...project.repository, actionBaseline: null }
        : project.repository,
      stage: "return"
    },
    now
  );
}

export function scheduleReturn(
  project: RevivalProject,
  input: { dueAt: number; cue: string },
  now = Date.now()
): RevivalProject {
  if (input.dueAt <= now) throw new Error("回来看看的时间需要晚于现在。");
  const returnPlan = ReturnPlanSchema.parse({ ...input, createdAt: now });
  return touch({ ...project, returnPlan, stage: "resume", status: "active" }, now);
}

export function resumeProject(project: RevivalProject, now = Date.now()): RevivalProject {
  if (project.status === "abandoned" || project.status === "completed") {
    throw new Error("这个项目已经结束，可以新建项目继续。");
  }
  return touch({ ...project, status: "active", stage: "action" }, now);
}

export function markProjectCompleted(
  project: RevivalProject,
  mood: ProjectMood | null = null,
  now = Date.now()
): RevivalProject {
  const reward = mood ? createProjectReward(project, mood, now) : project.reward;
  return touch({ ...project, status: "completed", stage: "closed", reward }, now);
}

function createProjectReward(
  project: RevivalProject,
  mood: ProjectMood,
  now: number
): RevivalProject["reward"] {
  if (project.reward) {
    if (project.reward.mood !== mood) {
      throw new Error("这张收藏唱片已经生成；更换心情会改变它的身份。");
    }
    return project.reward;
  }
  return ProjectRewardSchema.parse({
    mood,
    createdAt: now,
    music: captureLegacyMusicRecipe(project, mood)
  });
}

export function setProjectReward(
  project: RevivalProject,
  mood: ProjectMood,
  now = Date.now()
): RevivalProject {
  if (project.status !== "completed") throw new Error("项目完成后才能生成收藏唱片。");
  const reward = createProjectReward(project, mood, now);
  return touch({ ...project, reward }, now);
}

export function suggestedAction(project: RevivalProject): {
  text: string;
  doneDefinition: string;
  minutes: number;
} {
  const lastEvidence = project.evidence.at(-1);
  if (project.returnPlan) {
    return {
      text: project.returnPlan.cue,
      doneDefinition: "留下一条可确认的新结果，并写下下次从哪里继续",
      minutes: 10
    };
  }
  if (lastEvidence) {
    return {
      text: `从“${lastEvidence.note.slice(0, 96)}”继续最小的一步`,
      doneDefinition: "留下一条能与上次结果对照的新进度",
      minutes: 10
    };
  }
  if (project.analysis) return { ...project.analysis.nextAction };
  const stuckAt = project.restore.stuckAt || "当前卡点";
  if (project.decision === "shrink") {
    return {
      text: `把“${stuckAt}”缩成一个可见的小片段`,
      doneDefinition: "留下一个能看见、能保存的结果",
      minutes: 10
    };
  }
  if (project.decision === "help") {
    return {
      text: `整理“${stuckAt}”并写出一个具体求助问题`,
      doneDefinition: "问题包含背景、已尝试内容和期望结果",
      minutes: 15
    };
  }
  return {
    text: `继续处理“${stuckAt}”中最小的一步`,
    doneDefinition: "留下一个可以从这里继续的明确结果",
    minutes: 15
  };
}

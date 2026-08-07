import {
  ActionSchema,
  type Decision,
  EvidenceSchema,
  ProjectAnalysisSchema,
  type ProjectAnalysis,
  type ProjectMood,
  ProjectRewardSchema,
  type RestoreContext,
  ReturnPlanSchema,
  type RevivalAction,
  type RevivalProject,
  createId
} from "./model";

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
  return touch({ ...project, action, actionHistory: history, stage: "execute" }, now);
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
  input: { note: string; link?: string },
  now = Date.now()
): RevivalProject {
  const evidence = EvidenceSchema.parse({
    id: createId("evidence"),
    note: input.note,
    link: input.link ?? "",
    createdAt: now
  });
  return touch({ ...project, evidence: [...project.evidence, evidence], stage: "return" }, now);
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
  return touch({ ...project, status: "active", stage: "action", returnPlan: null }, now);
}

export function markProjectCompleted(
  project: RevivalProject,
  mood: ProjectMood | null = null,
  now = Date.now()
): RevivalProject {
  const reward = mood ? ProjectRewardSchema.parse({ mood, createdAt: now }) : project.reward;
  return touch({ ...project, status: "completed", stage: "closed", reward }, now);
}

export function setProjectReward(
  project: RevivalProject,
  mood: ProjectMood,
  now = Date.now()
): RevivalProject {
  if (project.status !== "completed") throw new Error("项目完成后才能生成收藏唱片。");
  const reward = ProjectRewardSchema.parse({ mood, createdAt: now });
  return touch({ ...project, reward }, now);
}

export function suggestedAction(project: RevivalProject): {
  text: string;
  doneDefinition: string;
  minutes: number;
} {
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

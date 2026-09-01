import { z } from "zod";
import {
  AppStateSchema,
  EvidenceSchema,
  ProjectMoodSchema,
  ProjectSchema,
  SCHEMA_VERSION,
  createEmptyState,
  createProject,
  type AppState,
  type RevivalProject
} from "./model";
import { captureLegacyMusicRecipe } from "../audio/music-recipe";

type UnknownRecord = Record<string, unknown>;

const LegacyProjectRewardV6Schema = z
  .object({
    mood: ProjectMoodSchema,
    createdAt: z.number().int().positive()
  })
  .strict();

const LegacyEvidenceV7Schema = EvidenceSchema.omit({
  substantiveProgress: true,
  progressReason: true
});

const LegacyProjectV7Schema = ProjectSchema.extend({
  schemaVersion: z.literal(7),
  evidence: z.array(LegacyEvidenceV7Schema).max(100)
});

const LegacyAppStateV7Schema = AppStateSchema.extend({
  schemaVersion: z.literal(7),
  projects: z.array(LegacyProjectV7Schema).max(100)
});

const LegacyProjectV6Schema = LegacyProjectV7Schema.extend({
  schemaVersion: z.literal(6),
  reward: LegacyProjectRewardV6Schema.nullable()
});

const LegacyAppStateV6Schema = LegacyAppStateV7Schema.extend({
  schemaVersion: z.literal(6),
  projects: z.array(LegacyProjectV6Schema).max(100)
});

type LegacyAppStateV7 = z.infer<typeof LegacyAppStateV7Schema>;
type LegacyAppStateV6 = z.infer<typeof LegacyAppStateV6Schema>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function migrateLegacyProject(raw: unknown, now: number): RevivalProject | null {
  if (!isRecord(raw)) {
    throw new Error("本地存档不是可识别的项目数据，TryRevive 没有覆盖它");
  }
  const source = raw;
  const title = asString(source.name) || asString(source.title) || asString(source.goal);
  if (!title) return null;

  const project = createProject(title, asNumber(source.createdAt, now));
  project.id = asString(source.id) || project.id;
  const snapshots = Array.isArray(source.contextSnapshots) ? source.contextSnapshots : [];
  const latestSnapshot = asRecord(snapshots.at(-1));
  const snapshotData = asRecord(latestSnapshot.data);
  const action = asRecord(source.action);
  const evidence = Array.isArray(source.evidence) ? source.evidence : [];
  const returnPlan = asRecord(source.returnPlan);
  const legacyStatus = asString(source.status);

  project.restore = {
    lastCompleted:
      asString(source.lastCompleted) ||
      asString(snapshotData.lastCompleted) ||
      asString(source.lastProgress) ||
      "已导入旧版项目，待补充最后进度",
    stuckAt:
      asString(source.obstacle) ||
      asString(snapshotData.blocker) ||
      asString(source.blocker) ||
      "待补充当前卡点",
    deadline: "",
    whyMatters: asString(source.whyContinue)
  };
  project.stage = "decision";
  project.status =
    legacyStatus === "paused" ? "paused" : legacyStatus === "completed" ? "completed" : "active";

  const actionText = asString(action.text) || asString(action.deliverable);
  if (actionText) {
    project.action = {
      id: asString(action.id) || `action_legacy_${project.id}`,
      text: actionText,
      doneDefinition: asString(action.doneDefinition) || "留下一个可以从这里继续的明确结果",
      minutes: Math.min(
        20,
        Math.max(5, Number(action.minutes) || Number(action.timeboxMinutes) || 10)
      ),
      startedAt: typeof action.startedAt === "number" ? action.startedAt : null,
      completedAt: typeof action.completedAt === "number" ? action.completedAt : null,
      createdAt: asNumber(action.createdAt, now)
    };
    project.stage = project.action.completedAt ? "evidence" : "execute";
  }

  project.evidence = evidence
    .map((item, index) => {
      const record = asRecord(item);
      const note = asString(record.note);
      return note
        ? {
            id: asString(record.id) || `evidence_legacy_${index}`,
            actionId: project.action?.id ?? null,
            note,
            link: asString(record.link),
            observation: null,
            substantiveProgress: "uncertain" as const,
            progressReason: "旧版记录没有询问是否构成实质推进",
            createdAt: asNumber(record.createdAt, now)
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (project.evidence.length) project.stage = "return";
  if (typeof returnPlan.dueAt === "number" && returnPlan.dueAt > 0) {
    project.returnPlan = {
      dueAt: returnPlan.dueAt,
      cue: "从上次留下的真实进度继续",
      createdAt: asNumber(returnPlan.createdAt, now)
    };
    project.stage = "resume";
  }
  if (project.status === "completed") project.stage = "closed";
  if (project.status === "paused") project.stage = "resume";
  project.updatedAt = asNumber(source.updatedAt, now);
  return project;
}

function migrateEvidenceList(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => ({
    ...asRecord(item),
    actionId: null,
    observation: null
  }));
}

function upgradeValidatedVersion7(state: LegacyAppStateV7): AppState {
  return AppStateSchema.parse({
    ...state,
    schemaVersion: SCHEMA_VERSION,
    projects: state.projects.map((project) => ({
      ...project,
      schemaVersion: SCHEMA_VERSION,
      stage: project.decision === null && project.stage === "action" ? "decision" : project.stage,
      evidence: project.evidence.map((item) => ({
        ...item,
        substantiveProgress: "uncertain" as const,
        progressReason: "旧版记录没有询问是否构成实质推进"
      }))
    }))
  });
}

function upgradeVersion7Candidate(candidate: unknown): AppState | null {
  const parsed = LegacyAppStateV7Schema.safeParse(candidate);
  return parsed.success ? upgradeValidatedVersion7(parsed.data) : null;
}

function migrateVersion7(raw: unknown): AppState | null {
  return upgradeVersion7Candidate(raw);
}

function upgradeValidatedVersion6(state: LegacyAppStateV6): AppState {
  const version7 = LegacyAppStateV7Schema.parse({
    ...state,
    schemaVersion: 7,
    projects: state.projects.map((project) => ({
      ...project,
      schemaVersion: 7,
      reward: project.reward
        ? {
            ...project.reward,
            music: captureLegacyMusicRecipe(project, project.reward.mood)
          }
        : null
    }))
  });
  return upgradeValidatedVersion7(version7);
}

function upgradeVersion6Candidate(candidate: unknown): AppState | null {
  const parsed = LegacyAppStateV6Schema.safeParse(candidate);
  return parsed.success ? upgradeValidatedVersion6(parsed.data) : null;
}

function migrateVersion6(raw: unknown): AppState | null {
  return upgradeVersion6Candidate(raw);
}

function migrateVersion5(raw: unknown): AppState | null {
  const source = asRecord(raw);
  if (source.schemaVersion !== 5 || !Array.isArray(source.projects)) return null;
  const candidate = {
    ...source,
    schemaVersion: 6,
    pendingInference: null,
    projects: source.projects.map((item) => {
      const project = asRecord(item);
      return {
        ...project,
        schemaVersion: 6,
        evidence: migrateEvidenceList(project.evidence),
        repository: null,
        outcomeDraft: null
      };
    })
  };
  return upgradeVersion6Candidate(candidate);
}

function migrateVersion3(raw: unknown): AppState | null {
  const source = asRecord(raw);
  if (source.schemaVersion !== 3 || !Array.isArray(source.projects)) return null;
  const candidate = {
    ...source,
    schemaVersion: 6,
    pendingInference: null,
    projects: source.projects.map((item) => {
      const project = asRecord(item);
      return {
        ...project,
        schemaVersion: 6,
        evidence: migrateEvidenceList(project.evidence),
        analysis: null,
        repository: null,
        outcomeDraft: null,
        reward: null
      };
    })
  };
  return upgradeVersion6Candidate(candidate);
}

function migrateVersion4(raw: unknown): AppState | null {
  const source = asRecord(raw);
  if (source.schemaVersion !== 4 || !Array.isArray(source.projects)) return null;
  const candidate = {
    ...source,
    schemaVersion: 6,
    pendingInference: null,
    projects: source.projects.map((item) => {
      const project = asRecord(item);
      return {
        ...project,
        schemaVersion: 6,
        evidence: migrateEvidenceList(project.evidence),
        repository: null,
        outcomeDraft: null,
        reward: null
      };
    })
  };
  return upgradeVersion6Candidate(candidate);
}

export function migrateState(raw: unknown, now = Date.now()): AppState {
  if (raw == null) return createEmptyState(now);

  const parsed = AppStateSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const source = asRecord(raw);
  const declaredVersion = source.schemaVersion;
  if (declaredVersion === 7) {
    const version7 = migrateVersion7(raw);
    if (version7) return version7;
    throw new Error("版本 7 的本地存档不完整，TryRevive 没有覆盖它");
  }
  if (declaredVersion === 6) {
    const version6 = migrateVersion6(raw);
    if (version6) return version6;
    throw new Error("版本 6 的本地存档不完整，TryRevive 没有覆盖它");
  }
  if (declaredVersion === 5) {
    const version5 = migrateVersion5(raw);
    if (version5) return version5;
    throw new Error("版本 5 的本地存档不完整，TryRevive 没有覆盖它");
  }
  if (declaredVersion === 4) {
    const version4 = migrateVersion4(raw);
    if (version4) return version4;
    throw new Error("版本 4 的本地存档不完整，TryRevive 没有覆盖它");
  }
  if (declaredVersion === 3) {
    const version3 = migrateVersion3(raw);
    if (version3) return version3;
    throw new Error("版本 3 的本地存档不完整，TryRevive 没有覆盖它");
  }
  if (declaredVersion !== undefined && declaredVersion !== 2) {
    if (typeof declaredVersion === "number" && declaredVersion > SCHEMA_VERSION) {
      throw new Error("这份存档来自更新版本的 TryRevive；请使用新版本打开，原文件没有被覆盖");
    }
    throw new Error("本地存档格式无法验证，TryRevive 没有覆盖它");
  }

  if (!Array.isArray(source.projects)) {
    throw new Error("旧版存档缺少完整的项目列表，TryRevive 没有覆盖它");
  }
  const migratedProjects = source.projects.map((item) => migrateLegacyProject(item, now));
  if (migratedProjects.some((item) => item == null)) {
    throw new Error("旧版存档中有无法识别的项目，TryRevive 没有静默丢弃它");
  }
  const projects = migratedProjects as RevivalProject[];
  const state = createEmptyState(now);
  state.schemaVersion = SCHEMA_VERSION;
  state.projects = projects;
  state.activeProjectId = projects.some((project) => project.id === source.activeProjectId)
    ? (source.activeProjectId as string)
    : (projects[0]?.id ?? null);
  state.legacyMigrationCompleted = projects.length > 0;
  return AppStateSchema.parse(state);
}

export function extractLegacyReviveState(serializedProfile: string | null): unknown | null {
  if (!serializedProfile) return null;
  try {
    const profile = JSON.parse(serializedProfile) as UnknownRecord;
    return asRecord(profile).revive ?? null;
  } catch {
    return null;
  }
}

import {
  AppStateSchema,
  SCHEMA_VERSION,
  createEmptyState,
  createProject,
  type AppState,
  type RevivalProject
} from "./model";

type UnknownRecord = Record<string, unknown>;

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
            note,
            link: asString(record.link),
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

function migrateVersion3(raw: unknown): AppState | null {
  const source = asRecord(raw);
  if (source.schemaVersion !== 3 || !Array.isArray(source.projects)) return null;
  const candidate = {
    ...source,
    schemaVersion: SCHEMA_VERSION,
    projects: source.projects.map((item) => ({
      ...asRecord(item),
      schemaVersion: SCHEMA_VERSION,
      analysis: null,
      reward: null
    }))
  };
  const parsed = AppStateSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function migrateVersion4(raw: unknown): AppState | null {
  const source = asRecord(raw);
  if (source.schemaVersion !== 4 || !Array.isArray(source.projects)) return null;
  const candidate = {
    ...source,
    schemaVersion: SCHEMA_VERSION,
    projects: source.projects.map((item) => ({
      ...asRecord(item),
      schemaVersion: SCHEMA_VERSION,
      reward: null
    }))
  };
  const parsed = AppStateSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function migrateState(raw: unknown, now = Date.now()): AppState {
  if (raw == null) return createEmptyState(now);

  const parsed = AppStateSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const source = asRecord(raw);
  const declaredVersion = source.schemaVersion;
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

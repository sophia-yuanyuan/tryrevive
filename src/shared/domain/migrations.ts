import {
  AppStateSchema,
  SCHEMA_VERSION,
  createEmptyState,
  createProject,
  type AppState,
  type RevivalProject
} from "./model";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function migrateLegacyProject(raw: unknown, now: number): RevivalProject | null {
  const source = asRecord(raw);
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

export function migrateState(raw: unknown, now = Date.now()): AppState {
  const parsed = AppStateSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const source = asRecord(raw);
  const legacyProjects = Array.isArray(source.projects) ? source.projects : [];
  const projects = legacyProjects
    .map((item) => migrateLegacyProject(item, now))
    .filter((item): item is RevivalProject => Boolean(item));
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
